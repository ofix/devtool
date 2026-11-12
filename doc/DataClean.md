# DataClean ETL 引擎 · 架构设计说明书

| 项 | 内容 |
|---|---|
| 文档版本 | v2.0（评审修订版） |
| 文档状态 | 契约冻结候选（Contract Freeze Candidate），落地前需完成第 11 章 P0 项 |
| 修订日期 | 2026-11-12 |
| 替代文档 | v1.0 交接稿（存在结构性破损与 3 处契约级冲突，详见第 1 章） |
| 技术栈 | Electron + Vue3 + Node-API Addon(C++) + DuckDB + SQLite + Arrow |
| 产品目标 | 面向分析师、单机、百万至千万行级、工作流与数据流混合的 ETL 工具 |

---

## 目录

- [0. 修订记录](#0-修订记录)
- [1. 评审结论：可改进点清单](#1-评审结论可改进点清单)
- [2. 需求目标与边界](#2-需求目标与边界)
- [3. 术语表与统一命名](#3-术语表与统一命名)
- [4. 工程目录结构](#4-工程目录结构)
- [5. 进程与线程模型](#5-进程与线程模型)
- [6. 核心契约](#6-核心契约)
- [7. 端口级数据流转与转换器矩阵](#7-端口级数据流转与转换器矩阵)
- [8. 缓存、增量与生命周期](#8-缓存增量与生命周期)
- [9. 类依赖与调用关系](#9-类依赖与调用关系)
- [10. 命名约定](#10-命名约定)
- [11. 待实现清单与验收标准](#11-待实现清单与验收标准)
- [12. 关键取舍记录](#12-关键取舍记录)
- [13. 风险登记与开放问题](#13-风险登记与开放问题)
- [14. 附录](#14-附录)

---

## 0. 修订记录

| 版本 | 日期 | 修订人 | 主要变更 |
|---|---|---|---|
| v1.0 | — | 初稿作者 | 架构定稿：MessagePort + C++ 执行器 + DuckDB/SQLite 同进程 |
| v2.0 | 2026-11-12 | 评审修订 | 修复 2 处结构性破损；统一 \`PortKind\` / \`ResultKind\` 双枚举；补齐事件字段名、状态枚举、错误模型；新增取消中断、线程安全、背压、预览缓存上限、\`__row_seq\` 键集分页前提；新增术语表、Mermaid 图、验收标准、风险登记 |

> 本次修订**不改变架构主干**（进程划分、MessagePort、Arrow 交换、物化 + 增量），只做三件事：修复文档破损、消除契约矛盾、补齐落地必需的边界定义。

---

## 1. 评审结论：可改进点清单

共发现 **35 项**问题：P0（阻断实现，9 项）、P1（影响正确性或性能，19 项）、P2（文档工程，7 项）。下文编号在正文对应章节以 \`[R-xx]\` 标注。

### 1.1 P0 — 阻断实现，必须先修

| # | 位置 | 问题 | 修订动作 |
|---|---|---|---|
| R-01 | §3.5（原文） | \`javascript\` 代码块**未闭合**，后续「四、核心契约」「五、类依赖关系」两个二级标题被吞进代码块，整篇文档从该处起渲染崩坏，标题层级丢失 | 补闭合围栏；全文代码块统一带语言标识 |
| R-02 | §8（原文） | 「四种数据流转规则」整段**原样重复两遍**（表 + 两段说明），读者无法判断是否为两个不同概念 | 去重；并补齐原文缺失的「10 条转换器」枚举（原文只列 4 条，另外 6 条从未定义） |
| R-03 | §4.2 vs §4.3 | **同一概念两套枚举**：\`OperatorInputPort.recordSetKind = chunk/table/json/text\`，\`NodeResult.outputRecordSetKind = db_table/sql_cte/json/text\`。\`_collectInputs\` 无法唯一确定映射，\`table\` 到底对应 \`db_table\` 还是 \`sql_cte\` 无定义 | 拆成 \`PortKind\`（调度视角）与 \`ResultKind\`（执行器视角）两个类型别名，并给出唯一映射函数 \`toResultKind()\` |
| R-04 | §4.5 vs §6.2 | \`executeMode\` 故意不放进 \`EtlTask\`，由 C++ \`OperatorRegistry\` 查表决定。但 Renderer 侧 \`Scheduler\` 必须知道 stream/barrier 才能决定增量边界、物化点、预览窗口来源，形成**信息不对称**；同时 \`OperatorMeta.js\` 与 C++ \`OperatorSpec\` 两份注册表必然漂移 | 采用「单一清单 + 双向生成」：\`operators.manifest.json\` 为唯一真源，构建期生成 JS meta 与 C++ 常量；\`EtlTask\` 携带 \`executeMode\` 作为**只读 hint**，执行器以自身 registry 为准并校验一致性（不一致即报 \`PLAN_SPEC_MISMATCH\`） |
| R-05 | §3.2 / §3.3 | **线程安全缺口**：\`fetch_preview_window\` / \`get_node_result\` 在 Addon 主线程执行，而 \`PreviewCache\`(SQLite) 与 DuckDB 连接由工作线程写入。DuckDB \`Connection\` 非线程安全，SQLite 跨线程写入需明确模式 | 规定「单写者 + 请求队列」：DuckDB 与 SQLite 句柄均由工作线程独占，主线程的读请求入无锁队列由工作线程消费；SQLite 开 WAL + \`busy_timeout\`；并在 §5.3 给出时序约束 |
| R-06 | §3.4 vs §9.1 vs §6.1 | **事件字段名三处不一致**：事件发 \`transformKind\`，待实现清单要 \`edgeTransformKind\`；\`§6.1\` 用 \`event.eventType\`，但 \`§3.4\` 从未定义该字段；消息类型 snake_case（\`node_done\`）与载荷 camelCase 混排 | 统一为：消息 \`type\` 与载荷字段一律 **camelCase**，事件统一字段名 \`eventType\`、\`transformKind\`，\`§9.1\` 改为一致的 \`transformKind\` |
| R-07 | §1.3 / §9.1 / §4.3 | **版本号四套命名**（\`upstreamVersion\` / \`upstreamResultVersion\` / \`dataVersion\` / \`resultVersion\`），且 \`hash(dataVersion + schemaVersion)\` **未包含算子实现版本** → 只改 Filter 的 C++ 代码，缓存仍判为有效，产生幽灵脏数据 | 固化 \`resultVersion = hash(operatorImplVersion, schemaVersion, dataVersion, paramsHash, sortedInputVersions)\`，四名归一为 \`resultVersion\` |
| R-08 | §4.3 / §10 | \`sql_cte\` 是**死枚举**：\`cteOptimize\` 明确不实现，则执行器永远不会产出 \`sql_cte\`；且 stream 节点无法消费 CTE（消费方必须是 SQL） | 两条路选一：① 删除 \`sql_cte\`，\`cteOptimize\` 落地时再以 \`ResultKind\` 扩展位引入；② 保留但定义 fallback：\`sql_cte\` 结果被下游非 SQL 消费时自动物化为 \`db_table\`。本版取 ②，并在 result 上标 \`materializedFromCte: true\` |
| R-09 | §10 | **取消语义不完整**：\`aborted_\` 只在节点之间检查，DuckDB 单个 \`runTask\` 内的长查询（千万行 Join）无法中断，用户点「取消」后进程仍占满 CPU；取消后临时表与缓存状态未定义 | 取消时调用 \`duckdb_interrupt()\`（或 \`Connection::Interrupt()\`），节点内每批次检查一次 flag；取消后按 §8.5 执行回滚：清 \`__tmp_*\` 表、把 recordSetKey 标记 \`dirty\` |

### 1.2 P1 — 影响正确性、性能或可交付性

| # | 位置 | 问题 | 修订动作 |
|---|---|---|---|
| R-10 | §3.4 | \`taskDone.status\` 无枚举定义；一个节点失败后下游如何处理（跳过 / 中止整条分支 / 整计划失败）未定义 | 定义 \`PlanStatus = ok/error/cancelled/timeout\` 与 \`NodeStatus = ok/error/skipped\`；新增 \`nodeSkipped\` 事件带 \`causeNodeId\` |
| R-11 | §3.4 | \`error\` 仅 \`{ planId, nodeId?, error }\`，\`error\` 内部结构未定义，无 \`code\` / \`retryable\` / \`detail\` | 定义结构化 \`ExecutorError\` + 错误码表（§6.6） |
| R-12 | §4.4 | \`duration\` / \`timeoutMs\` **单位未声明**（秒？毫秒？）；\`timeoutMs\` 是节点级还是计划级不明 | 明确全链路毫秒（\`durationMs\` / \`timeoutMs\`），超时语义为「软超时：置 \`timeout\` 状态并中断 DuckDB 查询」 |
| R-13 | §6.1 | \`buildEtlTask(graphId, targetNodeId, options)\` 的 \`options\` 从未定义 | 定义 \`ExecutionOptions\`：\`mode: preview/run\`、\`targetNodeId\`、\`previewLimit\`、\`forceRematerialize\`、\`maxParallel\` |
| R-14 | §3.3 | \`limit\` 无上限（渲染进程可传 \`limit: 10^9\` 拖垮内存）；\`anchorSeq\` 在重物化后 \`seq\` 会整体变化，请求不带版本 → 翻页错位 | \`limit\` 服务端 clamp ≤ 500；请求新增 \`resultVersion\`，不匹配返回 \`STALE_RESULT\` |
| R-15 | §3.4 | \`previewChunk.rows\` 编码未定义。原文同时说「数据流不跨进程」与「小于 5MB 跨进程拷贝」，读者无法判断是 JSON 还是 Arrow IPC | 新增 \`encoding\`（取 \`arrowIpc\` 或 \`json\`）；\`arrowIpc\` 以 \`ArrayBuffer\` transferable 直传，\`json\` 仅用于 < 2000 行的小结果 |
| R-16 | §3.2 | **无背压**：\`ThreadSafeFunction\` → 渲染进程的 \`previewChunk\` 队列无界，渲染慢了就内存暴涨 | TSFN 队列设上限（默认 64 批次 / 32 MB），超限策略：合并为「最新窗口」或丢中间批次并置 \`coalesced: true\` |
| R-17 | §6.2 | \`runTask\` 是**单线程顺序 for 循环**，而 §3.2/§5 都画了「工作线程池」，兄弟分支不并行；「线程池」实为单任务容器 | 明确 M1 为串行实现（诚实标注），M2 引入「屏障边界并行」：每屏障一个读连接（DuckDB 同进程支持多 connection 只读并发） |
| R-18 | §4.2 / §4.3 | \`columnMapping\`、\`jsonOutline\` 以裸 \`object\` 声明，无字段定义，C++ 侧无法建 struct | 补 \`ColumnMapping\`、\`JsonOutline\` typedef（§6.4/§6.5） |
| R-19 | §9.2 | 增量只比较「版本」，未校验「物化是否还在」：DuckDB 临时表被 LRU 淘汰后 \`recordSetKey\` 仍被判有效，下游读到空表 | 新增物化存在性判定 \`isMaterialized(node)\`，失效则降级为重建而非复用 |
| R-20 | 全文 | **无缓存清理策略**：SQLite 预览库只增不减，DuckDB \`__tmp_*\` 表跨 task 残留 | §8.5 定义三级 GC：plan 释放、graph 关闭、进程退出 |
| R-21 | §5 | 无协议版本握手，开发期热更新 Renderer 与 Executor 版本错配时静默失败 | 新增 \`getExecutorInfo\` → \`{ protocolVersion, addonVersion, duckdbVersion }\`，Scheduler 启动时校验 |
| R-22 | §2 | \`utilityProcess\` 加载 Node-API Addon 的 **ABI 匹配**问题未提（Electron ABI ≠ Node ABI，需 \`electron-rebuild\`；asar 内 \`.node\` 必须 \`asarUnpack\`） | 补一张「构建与打包约束」小节，纳入验收标准 |
| R-23 | 全文 | 安全边界缺失：CSV/Excel 路径可指向任意本地文件；HTTP 拉取算子可被构造为 SSRF；\`params\` 拼进 DuckDB SQL 的**标识符注入** | 路径 allowlist（项目目录 + 用户显式授权）、出网域名白名单、标识符 \`quoteIdent()\` 白名单校验、值参数化 |
| R-24 | §9.5 | 差异化卖点是「工作流算子 + 数据流算子混合」，但 \`TriggerManager\` / 文件夹扫描 / API 拉取被排在「后续」最低优先级，M1 只做纯数据流 → **差异化无法验证** | M1 至少落地 1 个工作流算子（FolderScan）+ TriggerManager 骨架，否则定位与实现脱节 |
| R-25 | §2 | \`readers/writers\` 具体支持哪些格式（csv/tsv/excel/parquet/json/http）无语义清单，\`inputRecordSetKind: text\` 归属不明 | 补算子清单表（§4.3），标注输入/输出 kind 与是否 barrier |
| R-26 | §9 | 无测试与基准：10 个转换器无契约测试、千万行无基准、无内存上限指标 | 补「验收标准」：转换器一对一契约测试、1,000 万行 × 5 节点的墙钟与 RSS 基线 |
| R-27 | §4.4 | \`log\` 函数无落地方式（去哪、留多久、是否回传渲染进程） | 落地为 ring buffer（默认 500 条/节点）+ \`log\` 事件回传，debug 级默认关闭 |
| R-28 | §10 | 「5MB 阈值」的判定对象未定义（单批 Arrow IPC 大小？窗口大小？） | 定义为「单次 \`previewChunk\` 的 Arrow IPC 载荷字节数」 |

### 1.3 P2 — 文档工程

| # | 位置 | 问题 | 修订动作 |
|---|---|---|---|
| R-29 | 全文 | 无版本号、修订记录、术语表、目录、风险与开放问题清单 | 新增 §0 / §3 / §13 |
| R-30 | §3.2 / §5 | ASCII 树未包在 code block，GitHub 与飞书渲染时缩进与竖线被折叠 | 改为 Mermaid \`flowchart\` + 必要的 code block 兜底 |
| R-31 | §11（原文） | 「新对话开场建议」是交接元信息，混在规格正文里 | 移到 §14 附录，标注「非规格正文」 |
| R-32 | 全文 | 表格列宽与中英混排不统一；代码标识符有时加反引号有时不加 | 统一：所有标识符、字段名、枚举值一律反引号 |
| R-33 | 全文 | 缺少 Mermaid 图：进程/线程结构、执行时序、节点状态机 | 补 3 张图（§5.1 / §5.4 / §6.7） |
| R-34 | §1.2 | 「Arrow batch 零拷贝」表述过度：DuckDB 写列存（Appender / \`INSERT ... SELECT\`）**必然发生拷贝**，零拷贝只存在于 stream 段直传与 \`ArrowArrayStream\` 扫描读 | 改为「进程内零序列化 + 读路径零拷贝」，并说明写路径的真实成本 |
| R-35 | §9 | 待实现清单只有优先级，无 Definition of Done、无工作量 | 每项补验收标准（可测的布尔条件） |

### 1.4 修订前后关键指标

| 指标 | v1.0 | v2.0 |
|---|---|---|
| 可渲染的完整章节 | 约 60%（§3.5 之后崩坏） | 100% |
| 契约级矛盾 | 3（R-03、R-04、R-07） | 0 |
| 未定义类型（裸 \`object\`） | 3 | 0 |
| 明确定义的枚举 | 4 | 11 |
| 有验收标准的待实现项 | 0 / 22 | 22 / 22 |

---
## 2. 需求目标与边界

### 2.1 产品定位

| 维度 | 定义 |
|---|---|
| 目标用户 | 数据分析师、商业咨询顾问、业务运营；**不是**大数据工程师 |
| 数据规模 | 100 万 ~ 1000 万行，单机处理，明确不碰分布式 |
| 运行形态 | 桌面端单机，一个任务一个进程内的执行计划 |
| 核心能力 | 数据流算子（Filter / Join / Aggregate / Formula / JSON 解析）与工作流算子（文件夹扫描 / 脚本 / API 拉取）**混合在同一张 DAG** 上 |
| 对标产品 | Alteryx（工作流 + 数据流混合，容器式控制流）、Duckle（DuckDB 单机 ETL，纯 CTE）、n8n（控制流节点化） |

### 2.2 差异化优势（须可验证）

| 优势 | 验证方式（可测） |
|---|---|
| **物化表 + 增量调度**：上游未变时下游预览不重跑整链 | 改末端节点参数 → 只重跑该节点，上游 \`nodeDone\` 直接复用，端到端 < 300 ms（10 万行） |
| **工作流 + 数据流混合**：同一 DAG 内既有文件扫描/API 拉取，也有 Filter/Join | M1 交付 \`FolderScan → Filter → Join → Writer\` 的可运行样例 |
| **C++ 执行器 + DuckDB 同进程**：避开跨进程序列化 | 单批 10 万行从算子输出到 DuckDB 落表，无 JSON/Protobuf 编解码路径（代码可审查） |

> **口径修正（R-34）**：准确表述为「进程内零序列化」，而非「全链路零拷贝」。真实成本分布：stream 段 → stream 段（指针传递，零拷贝）；chunk → DuckDB 列存（Appender 必然拷贝）；DuckDB 表 → chunk（\`ArrowArrayStream\` 扫描，可零拷贝）；C++ → 渲染进程预览（Arrow IPC 编码一次 + \`ArrayBuffer\` 转移）。

### 2.3 硬约束（冻结）

1. **C++ 执行器 + DuckDB + SQLite 预览缓存同进程**（\`utilityProcess\`），保证进程内零序列化；
2. **Renderer 只通过 \`MessagePort\` 下发执行计划、收取预览窗口**，原始数据流不跨进程（唯一例外：预览载荷，按 §6.7 编码）；
3. **数据交换层唯一标准是 Arrow \`RecordBatch\`**；不允许新增 JSON 行式中间层；
4. **stream 段不落中间表**，只有 barrier 段才灌 DuckDB 列存；
5. **预览缓存走 SQLite 行存 + \`seq\` 主键，双向键集分页**；缓存容量有上限（§8.3）；
6. **动态 Key JSON 不走 Arrow \`Struct\`**，默认 \`LargeUtf8\` 原始 JSON 字符串；
7. **\`cteOptimize\` 字段保留、暂不实现**，\`lazy\` 模式 UI 隐藏；\`sql_cte\` 结果按 §6.3 fallback 规则处理（R-08）。

### 2.4 明确不做（Out of Scope）

- 分布式执行、集群调度、跨机 shuffle；
- 用户级权限体系与多租户（只做本地项目目录隔离）；
- 数据血缘的持久化存储（本期只做内存内 \`resultVersion\` 传播）；
- 流式增量（Kafka / CDC）作为数据源；
- 自定义算子的脚本热加载（脚本算子走独立进程沙箱，M3 再议）。

---

## 3. 术语表与统一命名

> 原文最大的隐性成本是「同一个东西四个名字」。此表为**唯一权威**，正文其余处一律以此为准（R-07）。

### 3.1 核心术语

| 术语 | 类型 | 定义 | 禁止使用的别名 |
|---|---|---|---|
| \`graphId\` | string | 一张 DAG 的稳定标识，由 GraphStore 创建时生成 | \`workflowId\`、\`dagId\` |
| \`nodeId\` | string | 节点在 graph 内的稳定标识 | \`vertexId\`、\`stepId\` |
| \`recordSetKey\` | string | 一个节点**某次输出**的缓存键：\`hash(graphId, nodeId, outputPortIndex)\`，**不含版本** | \`cacheKey\`、\`resultKey\` |
| \`resultVersion\` | string | 结果内容版本：\`hash(operatorImplVersion, schemaVersion, dataVersion, paramsHash, sortedInputVersions)\` | \`upstreamVersion\`、\`dataVersion\`（后者仅指原始数据的版本因子） |
| \`dataVersion\` | string | 数据源层面版本（文件指纹 / SQL 查询结果指纹 / API ETag） | — |
| \`schemaVersion\` | string | 输出 schema（列名、类型、顺序）的哈希 | — |
| \`operatorImplVersion\` | string | 算子实现的构建版本（源码 hash 或语义版本号），改动实现即改缓存 | — |
| \`paramsHash\` | string | 归一化后参数对象的稳定哈希（§8.2） | \`paramHash\` |
| \`executeMode\` | enum | 算子静态属性，\`stream\` 或 \`barrier\` | \`mode\`、\`execMode\` |
| \`PortKind\` | enum | 端口/调度视角的数据形态：\`chunk/table/json/text\` | \`recordSetKind\`（保留字段名，语义按本节） |
| \`ResultKind\` | enum | 执行器产出结果的形态：\`db_table/sql_cte/json/text\` | \`outputRecordSetKind\`（同上） |
| \`transformKind\` | enum | 边上的转换器种类（§7.2，共 10 种） | \`edgeTransformKind\` |
| \`seq\` | int64 | 结果集内的行序号，从 0 递增，是预览分页的唯一排序键 | \`rowIndex\`、\`offset\` |
| \`previewWindow\` | object | 一次分页返回的行集合（含 \`anchorSeq\`、\`direction\`、\`limit\`） | \`page\`、\`chunk\`（\`chunk\` 特指 Arrow 批次） |
| \`materialize\` | 动词 | 把 stream 输出落入 DuckDB 列存表 | \`persist\`、\`flush\` |
| \`EtlTask\` | object | 一次执行的完整任务描述（原 \`ExecutionPlan\`），包含节点、边、选项 | \`ExecutionPlan\`、\`plan\`（消息字段 \`planId\` 保留） |

### 3.2 数据形态的四个名字

一句话记忆：**\`PortKind\` 是「调度器眼里的形状」，\`ResultKind\` 是「执行器手里的东西」**；\`table\` 在端口层是一个概念，到了执行器层要拆成「真的建了表」还是「只是一个 CTE」。

---

## 4. 工程目录结构

### 4.1 目录树

\`\`\`text
src/renderer/views/DataClean/
├── core/
│   ├── contract/
│   │   ├── OperatorMeta.js          # 算子元数据（由 manifest 生成，勿手改）
│   │   ├── OperatorInputPort.js     # 输入端口 typedef
│   │   ├── NodeResult.js            # 节点执行结果 typedef
│   │   ├── OperatorContext.js       # 算子执行上下文 typedef
│   │   ├── EtlTask.js               # 执行任务 + ExecutionOptions typedef（原 ExecutionPlan）
│   │   ├── Enums.js                 # PortKind / ResultKind / TransformKind / Status（新增）
│   │   └── Errors.js                # 错误码表（新增）
│   ├── Scheduler.js                 # 决策层：子图、拓扑、增量、构造 EtlTask
│   ├── ExecutionClient.js           # MessagePort 客户端（含协议版本校验）
│   ├── PreviewClient.js             # 预览分页客户端（含 stale 重取）
│   ├── CacheKey.js                  # buildRecordSetKey / hashParams / hashString / buildResultVersion
│   ├── FileFingerprint.js           # 文件指纹（path+size+mtime+inode）→ dataVersion（新增）
│   ├── MetaStore.js                 # Pinia：nodeMeta / taskMeta
│   └── GraphStore.js                # Pinia：nodes / edges / executionRegions
├── operators/
│   ├── manifest.json                # 唯一真源：算子规格清单（新增）
│   ├── index.js                     # 由 manifest 生成的 meta 注册表
│   ├── readers.js / filters.js / transform.js / join.js / json.js / statistics.js / writers.js
│   └── workflow.js                  # 工作流算子：FolderScan / HttpPull / Script
└── components/
    ├── NodeEditor.vue
    └── PreviewPanel.vue

electron/main/
└── port-bridge.js                   # 建 MessageChannelMain、分发端口、生命周期

cpp-executor/
├── CMakeLists.txt
├── src/
│   ├── AddonEntry.cpp               # Node-API 入口 + napi_async_work
│   ├── ExecThread.cpp               # 工作线程：独占 DuckDB / SQLite 句柄（新增）
│   ├── RequestQueue.cpp             # 主线程→工作线程的无锁请求队列（新增）
│   ├── EtlTaskRunner.cpp            # 执行任务执行器（原 ExecutionPlanRunner）
│   ├── OperatorRegistry.cpp         # 由 manifest 生成的常量表
│   ├── CppOperatorBase.cpp
│   ├── ArrowBatchStream.cpp         # 拉模型 Arrow batch 流
│   ├── ArrowBridge.cpp              # Arrow ↔ DuckDB
│   ├── DuckDBBridge.cpp             # 连接、Appender、查询、Interrupt
│   ├── PreviewCache.cpp             # SQLite 预览缓存（seq 主键 + 容量上限）
│   ├── MessagePortSender.cpp        # 事件上报（含 TSFN 背压）
│   └── Operators/
│       ├── FilterOperator.cpp
│       ├── JoinOperator.cpp
│       ├── SummarizeOperator.cpp
│       ├── FormulaOperator.cpp
│       ├── FolderScanOperator.cpp   # 新增：M1 工作流算子
│       └── CsvWriterOperator.cpp
└── test/                            # 转换器契约测试 + 基准（新增）
\`\`\`

### 4.2 与原稿的差异

| 变更 | 原因 |
|---|---|
| 新增 \`Enums.js\` / \`Errors.js\` | R-03、R-11 需要集中定义，避免枚举散落 |
| 新增 \`operators/manifest.json\` | R-04：单一真源，构建期双端生成 |
| 新增 \`FileFingerprint.js\` | R-07：文件类数据源的 \`dataVersion\` 来源 |
| 新增 \`ExecThread.cpp\` / \`RequestQueue.cpp\` | R-05：显式表达「单写者 + 请求队列」 |
| 新增 \`workflow.js\` / \`FolderScanOperator.cpp\` | R-24：差异化能力必须在 M1 可见 |
| 新增 \`cpp-executor/test/\` | R-26：转换器契约测试与基准 |
| \`ExecutionPlan\` → \`EtlTask\` | 命名更贴近业务语义，避免与「执行计划」通用概念混淆 |

### 4.3 算子清单（原文缺失，R-25）

| 算子 | 类别 | \`executeMode\` | 输入 \`PortKind\` | 输出 \`PortKind\` | M1 |
|---|---|---|---|---|---|
| \`CsvReader\` | 数据源 | \`stream\` | — | \`chunk\` | ✅ |
| \`ExcelReader\` | 数据源 | \`barrier\` | — | \`table\` | ✅ |
| \`FolderScan\` | 工作流 | \`stream\` | — | \`chunk\`（文件清单） | ✅ |
| \`HttpPull\` | 工作流 | \`barrier\` | — | \`json\` | M2 |
| \`Filter\` | 转换 | \`stream\` | \`chunk\` | \`chunk\` | ✅ |
| \`Formula\` | 转换 | \`stream\` | \`chunk\` | \`chunk\` | ✅ |
| \`SelectColumns\` | 转换 | \`stream\` | \`chunk\` | \`chunk\` | M2 |
| \`JsonParse\` | 转换 | \`stream\` | \`json\` | \`chunk\` | ✅ |
| \`Join\` | 屏障 | \`barrier\` | \`table\` × 2 | \`table\` | ✅ |
| \`Union\` | 屏障 | \`barrier\` | \`table\` × N | \`table\` | M2 |
| \`Summarize\` | 屏障 | \`barrier\` | \`table\` | \`table\` | ✅ |
| \`Window\` | 屏障 | \`barrier\` | \`table\` | \`table\` | M3 |
| \`QaCheck\` | 屏障 | \`barrier\` | \`table\` | \`table\` | M3 |
| \`CsvWriter\` / \`ParquetWriter\` | 写出 | \`barrier\` | \`table\` | \`text\`（路径） | ✅ |

---
## 5. 进程与线程模型

### 5.1 进程划分

\`\`\`mermaid
flowchart LR
  subgraph R["Renderer 进程（Vue3）"]
    A["画布 / NodeEditor"] --> B["Scheduler<br/>子图·拓扑·增量"]
    B --> C["ExecutionClient"]
    D["PreviewPanel"] --> E["PreviewClient"]
  end

  subgraph M["Electron 主进程"]
    F["port-bridge<br/>MessageChannelMain"]
  end

  subgraph U["utilityProcess：C++ 执行器"]
    direction TB
    G["Addon 主线程<br/>事件循环"]
    H["RequestQueue<br/>（无锁队列）"]
    I["ExecThread 工作线程<br/>独占 DuckDB + SQLite"]
    J[("DuckDB<br/>列存")]
    K[("SQLite<br/>预览缓存 WAL")]
    G --> H --> I
    I --> J
    I --> K
  end

  C -- "MessagePort" --> F
  E -- "MessagePort" --> F
  F -- "port1" --> G
\`\`\`

| 进程 | 职责 | 明确不做什么 |
|---|---|---|
| **Renderer（Vue）** | 画布交互、参数编辑、预览 UI、调度决策、构造 \`EtlTask\`、增量判定 | 不持有任何数据行；不直接读文件；不做 SQL 执行 |
| **C++ 执行器（utilityProcess）** | 接收任务、跑算子、物化、写预览缓存、上报事件 | 不做调度决策（只看 \`executeMode\` 校验一致性）；不弹 UI |
| **主进程** | 启动时建 \`MessageChannelMain\`、转发端口、进程生命周期、崩溃重启 | **不参与数据流**，不解析任务内容 |

### 5.2 关键设计：谁拥有句柄（R-05）

原稿把「主线程响应 \`fetchWindow\`」当成优点（预览不被阻塞），但忽略了 DuckDB \`Connection\` 与 SQLite 连接的线程安全约束。修订如下：

| 规则 | 内容 |
|---|---|
| **单写者** | DuckDB \`Connection\` 与 SQLite 连接**只在 \`ExecThread\` 上创建与使用**，其他线程永不直接触碰句柄 |
| **读请求排队** | Addon 主线程收到 \`fetchPreviewWindow\` / \`getNodeResult\` 时，把请求封装为 \`task\` 入 \`RequestQueue\`，由 \`ExecThread\` 在批次边界消费 |
| **为什么不阻塞 UI** | 读请求是**批级原子操作**（读一窗 ≤ 500 行，或读一张表的一页），耗时在毫秒级；\`ExecThread\` 每处理完一个批次就 check 一次队列，最坏等待 ≈ 一个批次的执行时间（默认 10 万行批，约 50~150 ms），远好于跨进程往返 |
| **SQLite 模式** | \`journal_mode=WAL\`、\`synchronous=NORMAL\`、\`busy_timeout=5000ms\`；**只由 \`ExecThread\` 写**，WAL 可容忍外部只读，但本项目不启用外部读 |
| **DuckDB 并发** | M1：单 \`Connection\` 串行；M2 并行时，每屏障 fork 一条 \`Connection\`，**只读**共享同一 \`Database\` 实例（DuckDB 允许同进程多 connection 并发读） |

> 结论修正：原稿「Addon 主线程始终响应 \`fetchWindow\`」改为「主线程负责**接单**，执行线程负责**兑现**」，吞吐与安全兼得。

### 5.3 线程模型

\`\`\`text
Addon 主线程（Node 事件循环，不阻塞）
├─ MessagePort 消息回调
│   ├─ submitTask       → 校验 → 入队 → 立即回 taskAccepted
│   ├─ cancelTask       → 置 atomic flag + 入队 interrupt 请求
│   ├─ fetchPreviewWindow → 封装读任务入 RequestQueue
│   ├─ getNodeResult    → 封装读任务入 RequestQueue
│   └─ releaseTask      → 入队清理任务
└─ ThreadSafeFunction 回调（把工作线程事件转成 JS 对象 postMessage）

ExecThread 工作线程（唯一句柄拥有者）
├─ 循环：runTask / 消费 RequestQueue
│   ├─ EtlTaskRunner.runTask()
│   │   ├─ StreamingSegmentRunner → CppOperatorBase 子类（Arrow 直传）
│   │   ├─ BarrierSegmentRunner   → ArrowBridge + DuckDBBridge
│   │   └─ PreviewCache.write()（SQLite）
│   ├─ 每个批次边界：检查 aborted_ → 检查 RequestQueue → 上报事件
│   └─ 节点间：校验 spec->executeMode 与 task hint 一致
└─ 退出：close 句柄 → flush WAL
\`\`\`

**关键约束（新增）**：\`aborted_\` 检查点从「节点间」提升为「每批次一次」；DuckDB 长查询通过 \`duckdb_interrupt()\` 打断（R-09）。

### 5.4 一次预览的时序

\`\`\`mermaid
sequenceDiagram
  participant R as Renderer
  participant P as 主进程
  participant A as Addon 主线程
  participant W as ExecThread
  participant DB as SQLite/DuckDB

  R->>P: submitTask(taskId, task)
  P->>A: port1 转发
  A->>A: 校验 protocolVersion + spec 一致性
  A-->>R: taskAccepted(taskId)
  A->>W: 入队 runTask
  W->>W: runTask 开始，逐节点执行
  W-->>R: nodeStart / nodeDone×N（经 TSFN）
  W->>DB: 物化 + PreviewCache.write
  R->>P: fetchPreviewWindow(key, ver, fwd, seq=100, 50)
  P->>A: 转发
  A->>W: 入 RequestQueue
  W->>DB: 读窗口（keyset by seq）
  W-->>R: previewChunk(rows, total, done=false)
  W-->>R: taskDone(status=ok)
\`\`\`

### 5.5 构建与打包约束（R-22）

| 问题 | 约束 |
|---|---|
| Electron ABI ≠ Node ABI | 必须 \`electron-rebuild -f -w cpp-executor\`，\`CMakeLists\` 里链接 \`node_api\` 而非 \`node\` 头文件；CI 里按 Electron 大版本矩阵出包 |
| \`utilityProcess.fork\` 加载 \`.node\` | 入口脚本 \`executor-entry.js\` 内 \`require('bindings')\` 或 \`process.env.ADDON_PATH\` 指绝对路径 |
| asar 打包 | \`.node\` 必须列入 \`asarUnpack\`；\`fork\` 的 \`executor-entry.js\` 也在 unpack 目录，否则 \`utilityProcess\` 找不到 |
| macOS 签名 | \`hardenedRuntime\` 下 \`.node\` 需一同签名，否则加载被拒（\`code signature invalid\`） |
| 崩溃恢复 | 主进程监听 \`worker.on('exit')\`，非 0 退出时向 Renderer 发 \`executorCrashed\`，Scheduler 将全部 \`recordSetKey\` 标记 \`dirty\` |

---

## 6. 核心契约

> 本章所有 typedef 为**冻结内容**。C++ 头文件 \`contract/*.h\` 与此一一对应，字段名保持一致（camelCase 直通，不做转换）。

### 6.1 枚举（新增，R-03）

\`\`\`javascript
/** 调度视角的数据形态（端口声明、Scheduler 判增量用） */
/** @typedef {"chunk"|"table"|"json"|"text"} PortKind */

/** 执行器产出的结果形态（NodeResult 用） */
/** @typedef {"db_table"|"sql_cte"|"json"|"text"} ResultKind */

/** 边的转换器种类，共 10 种（§7.2） */
/** @typedef {"chunk_to_table"|"table_to_chunk"|"json_to_chunk"|"chunk_to_json"
 *            |"table_to_json"|"json_to_table"|"text_to_json"|"json_to_text"
 *            |"table_to_text"|"text_to_chunk"} TransformKind */

/** @typedef {"stream"|"barrier"} ExecuteMode */
/** @typedef {"ok"|"error"|"cancelled"|"timeout"} PlanStatus */
/** @typedef {"ok"|"error"|"skipped"} NodeStatus */
\`\`\`

**唯一映射函数**（放在 \`core/contract/Enums.js\`，C++ 侧 \`Enums.h\` 同构实现）：

\`\`\`javascript
/**
 * PortKind → 允许出现的 ResultKind
 * chunk  → 只可能是内存态 Arrow 流，不产生持久结果（结果为 null 或 memory）
 * table  → db_table（默认物化）或 sql_cte（仅在 cteOptimize 开启时）
 * json   → json
 * text   → text
 */
function toResultKind(portKind) {
  switch (portKind) {
    case 'chunk': return 'chunk';        // 无物理结果，仅流
    case 'table': return 'db_table';
    case 'json':  return 'json';
    case 'text':  return 'text';
  }
}
\`\`\`

**\`sql_cte\` fallback（R-08）**：当一个 \`sql_cte\` 结果被非 SQL 消费者（stream 算子、预览分页、写出算子）消费时，执行器必须先物化为 \`db_table\`，并在 \`NodeResult\` 上置 \`materializedFromCte: true\`。因此 \`sql_cte\` 不会成为「不可消费的死值」。

### 6.2 \`OperatorMeta\`（由 manifest 生成）

\`\`\`javascript
/**
 * @typedef {object} OperatorMeta
 * @property {string} type                 唯一标识，如 "Filter"
 * @property {string} label                中文名，UI 展示
 * @property {string} icon                 图标资源 id
 * @property {string} category             "source"|"workflow"|"transform"|"barrier"|"writer"
 * @property {number} inputPorts           固定输入端口数（inputMode=static 时生效）
 * @property {number} outputPorts          输出端口数（MVP 固定 1）
 * @property {"static"|"dynamic"} inputMode
 * @property {number} [minInputPorts]
 * @property {number} [maxInputPorts]
 * @property {PortKind} inputRecordSetKind      每个输入端口声明的形态
 * @property {PortKind} typicalOutputRecordSetKind
 * @property {ExecuteMode} executeMode      stream | barrier
 * @property {boolean} cteOptimize          保留，暂不实现，默认 false
 * @property {boolean} parallelSafe         是否允许在 M2 并行执行（新增）
 * @property {string} operatorImplVersion   实现版本，参与缓存哈希（新增，R-07）
 * @property {Array<OperatorSchemaField>} schema
 */

/**
 * @typedef {object} OperatorSchemaField
 * @property {string} name
 * @property {string} type                  Arrow 类型串，如 "LargeUtf8" / "Int64"
 * @property {boolean} nullable
 * @property {number} inputPortIndex        该字段来自哪个输入端口（输出 schema 推导用）
 * @property {string} [sourceColumn]        源列名，缺省等于 name
 */
\`\`\`

### 6.3 \`OperatorInputPort\`

\`\`\`javascript
/**
 * @typedef {object} OperatorInputPort
 * @property {string} upstreamNodeId
 * @property {string} [recordSetKey]        上游结果键（chunk 直连时为 null）
 * @property {string} [sqlCteName]          仅当上游为 sql_cte 时存在
 * @property {PortKind} recordSetKind       端口声明的形态
 * @property {ResultKind} [upstreamResultKind] 上游实际产出的形态（新增，用于插转换器）
 * @property {TransformKind|null} [incomingTransform] 该端口上已确定的转换器（新增，R-06）
 * @property {"array"|"object"|"scalar"|null} [jsonShape]
 * @property {"fixed"|"dynamic"|null} [jsonSchemaKind]
 * @property {Column[]} columns
 * @property {JsonOutline} [jsonOutline]    见 §6.5
 * @property {ColumnMapping} columnMapping  见 §6.4
 * @property {string} upstreamResultVersion
 * @property {string} upstreamOperatorType  上游算子 type（新增，用于错误定位）
 * @property {number} inputPortIndex
 */
\`\`\`

### 6.4 \`ColumnMapping\`（原文为裸 object，R-18）

\`\`\`javascript
/**
 * @typedef {object} ColumnMapping
 * @property {string[]} columnNames          该端口实际提供的列名（有序）
 * @property {Record<string, number>} columnToInputIndex  列名 → 上游列序号
 * @property {Record<string, string>} columnTypes          列名 → Arrow 类型串
 * @property {string[]} [unresolvedColumns]  解析失败/缺失的列，UI 需高亮
 */
\`\`\`

### 6.5 \`JsonOutline\`（原文为裸 object，R-18）

\`\`\`javascript
/**
 * @typedef {object} JsonOutline
 * @property {number} sampledRows           采样行数（默认 200）
 * @property {boolean} homogeneous          采样集内结构是否一致
 * @property {Array<JsonOutlineField>} fields
 * @property {string|null} arrayElementShape  当 jsonShape=array 时，元素的结构签名
 */

/**
 * @typedef {object} JsonOutlineField
 * @property {string} path             JSON Pointer，如 "/data/items/0/price"
 * @property {string} arrowType       推荐 Arrow 类型（动态字段一律 LargeUtf8）
 * @property {number} presence         采样中出现比例 0~1
 * @property {boolean} dynamicKey      是否为动态 Key（§2.3-6 约束的目标）
 */
\`\`\`

> **动态 Key 规则**：当 \`jsonSchemaKind === "dynamic"\` 或 \`!homogeneous\` 时，\`jsonOutline.fields\` 只保留稳定字段，其余一律以单个 \`LargeUtf8\` 列 \`__raw_json\` 承载；预览出口统一 \`to_json(__raw_json)\`，不尝试展开成 Struct。

### 6.6 \`NodeResult\`

\`\`\`javascript
/**
 * @typedef {object} NodeResult
 * @property {ResultKind} outputRecordSetKind
 * @property {"duckdb"|"sqlite"|"memory"|null} storeType   结果**本体**的存放介质
 * @property {string} [recordSetKey]
 * @property {string} resultVersion         必填（新增，R-07）
 * @property {number} [rowCount]
 * @property {number|null} [byteSize]
 * @property {number} [durationMs]          该节点自身耗时（新增，R-12）
 * @property {Column[]} columns
 * @property {string} [schemaVersion]       必填（新增）
 * @property {"array"|"object"|"scalar"|null} [jsonShape]
 * @property {"fixed"|"dynamic"|null} [jsonSchemaKind]
 * @property {JsonOutline} [jsonOutline]
 * @property {ColumnMapping} columnMapping
 * @property {boolean} [materializedFromCte] 见 §6.1 fallback
 * @property {NodeResultPayload} payload
 */

/**
 * @typedef {object} NodeResultPayload
 * @property {string} [tableName]        db_table：DuckDB 表名（含 __row_seq 列）
 * @property {string} [sqlCteName]       sql_cte
 * @property {string} [sqlFragment]
 * @property {string} [json]             json：序列化后的字符串
 * @property {string} [formattedText]
 * @property {string} [text]             text
 */
\`\`\`

### 6.7 \`EtlTask\` 与 \`ExecutionOptions\`

\`\`\`javascript
/**
 * @typedef {object} ExecutionOptions
 * @property {"preview"|"run"} mode       preview：遇到 targetNodeId 即停并回预览
 * @property {string} [targetNodeId]      mode=preview 时必填
 * @property {number} [previewLimit]      默认 5000，上限 200000
 * @property {boolean} [forceRematerialize] 忽略缓存强制重算（调试用）
 * @property {number} [maxParallel]       默认 1（M1 串行）
 * @property {number} [timeoutMs]         计划级软超时，默认 0=不限
 */

/**
 * @typedef {object} EtlTask
 * @property {string} taskId
 * @property {string} graphId
 * @property {number} protocolVersion      新增，握手校验（R-21）
 * @property {EtlTaskNode[]} nodes         拓扑序，执行器按序执行
 * @property {Edge[]} edges
 * @property {number|null} timeoutMs
 * @property {ExecutionOptions} options
 */

/**
 * @typedef {object} EtlTaskNode
 * @property {string} nodeId
 * @property {string} nodeType
 * @property {ExecuteMode} executeMode     只读 hint，执行器以 registry 为准并校验（R-04）
 * @property {object} params
 * @property {string} paramsHash
 * @property {OperatorInputPort[]} inputPorts
 * @property {string} recordSetKey
 * @property {string} resultVersion        调度器预算出的期望版本
 * @property {string} outputTable          目标物化表名（barrier 或需落表时）
 * @property {PortKind} outputPortKind
 */

/**
 * @typedef {object} Edge
 * @property {string} id
 * @property {string} source
 * @property {string} target
 * @property {string} [sourceHandle]
 * @property {string} [targetHandle]
 * @property {TransformKind|null} [transformKind]  null 表示无需转换（同 kind 直连）
 * @property {number} [targetPortIndex]
 */
\`\`\`

**不变式**（施工时用断言守住）：

1. \`nodes\` 已按拓扑序排列，执行器不再排序；
2. 每条 \`Edge.transformKind\` 必须由 \`(sourceResultKind, targetPortKind)\` 唯一确定，且与 §7.2 矩阵一致；
3. \`task.protocolVersion\` 与执行器 \`protocolVersion\` 不等时，\`submitTask\` 立即返回 \`PROTOCOL_MISMATCH\`；
4. \`node.executeMode\` 与 registry 不一致时，返回 \`PLAN_SPEC_MISMATCH\`（不静默纠正）。

### 6.8 \`OperatorContext\`

\`\`\`javascript
/**
 * @typedef {object} OperatorContext
 * @property {string} taskId
 * @property {string} graphId
 * @property {string} nodeId
 * @property {string} recordSetKey
 * @property {string} outputTable
 * @property {number} timeoutMs           0 表示不限（毫秒）
 * @property {function(string, string=): void} log    (level, message)
 * @property {function(): boolean} isCancelled         算子内主动轮询（新增）
 * @property {function(): void} reportProgress         0~1，用于 UI 进度条（新增）
 */
\`\`\`

### 6.9 节点状态机（新增，R-33）

\`\`\`mermaid
stateDiagram-v2
  [*] --> pending
  pending --> running: 闸门就绪 & 版本失效
  pending --> ok: 版本命中且物化存在（复用）
  running --> ok
  running --> error
  running --> cancelled: cancelTask
  running --> timeout: 超时中断
  pending --> skipped: 上游 error/cancelled
  ok --> dirty: 上游版本变化 / 缓存淘汰
  dirty --> pending
  error --> pending: 重试
\`\`\`

### 6.10 消息协议

**统一约定（R-06）**：消息 \`type\` 与载荷字段**一律 camelCase**；事件对象必有 \`eventType\` 字段。

**Renderer → Executor**

| type | payload | 说明 |
|---|---|---|
| \`submitTask\` | \`{ taskId, task }\` | 提交即回 \`taskAccepted\`，不等执行完成 |
| \`cancelTask\` | \`{ taskId, hard?: boolean }\` | \`hard=true\` 直接 \`duckdb_interrupt\`，默认软取消 |
| \`fetchPreviewWindow\` | \`{ recordSetKey, resultVersion, direction, anchorSeq, limit }\` | \`limit\` 服务端 clamp ≤ 500；版本不符返回 \`STALE_RESULT\` |
| \`getNodeResult\` | \`{ graphId, nodeId, resultVersion? }\` | 取结果元信息（不含大载荷） |
| \`releaseTask\` | \`{ taskId }\` | 释放该任务的临时表与预览缓存 |
| \`getExecutorInfo\` | \`{}\` | 返回 \`{ protocolVersion, addonVersion, duckdbVersion, sqliteVersion }\` |

**Executor → Renderer**

| eventType | payload | 说明 |
|---|---|---|
| \`taskAccepted\` | \`{ taskId }\` | 校验通过、已入队 |
| \`nodeStart\` | \`{ taskId, nodeId }\` | |
| \`nodeDone\` | \`{ taskId, nodeId, status, result }\` | \`status\` 为 \`NodeStatus\` |
| \`nodeSkipped\` | \`{ taskId, nodeId, causeNodeId, reason }\` | 上游失败导致跳过（R-10） |
| \`edgeTransform\` | \`{ taskId, edgeId, transformKind, durationMs }\` | 字段名统一 \`transformKind\`（R-06） |
| \`previewChunk\` | \`{ recordSetKey, resultVersion, rows, encoding, total, done, coalesced? }\` | \`encoding: "arrowIpc" \\| "json"\`（R-15） |
| \`log\` | \`{ taskId, nodeId, level, message }\` | |
| \`error\` | \`{ taskId, nodeId?, error: ExecutorError }\` | 见 §6.11 |
| \`taskDone\` | \`{ taskId, status: PlanStatus, stats }\` | \`stats = { durationMs, nodeCount, peakRssMb }\` |
| \`executorCrashed\` | \`{ code, signal }\` | 由主进程代发（R-22） |

### 6.11 错误模型（新增，R-11）

\`\`\`javascript
/**
 * @typedef {object} ExecutorError
 * @property {string} code        见下表
 * @property {string} message     面向用户的一句话（中文）
 * @property {string} [detail]    技术细节（栈/SQL/路径），仅日志与展开面板展示
 * @property {boolean} retryable  是否可重试
 * @property {object} [context]   如 { nodeId, column, filePath, sql }
 */
\`\`\`

| code | 含义 | retryable |
|---|---|---|
| \`PROTOCOL_MISMATCH\` | 计划协议版本与执行器不匹配 | false |
| \`PLAN_SPEC_MISMATCH\` | \`executeMode\` 与 registry 不一致 | false |
| \`NODE_PARAM_INVALID\` | 参数校验失败 | false |
| \`INPUT_VERSION_STALE\` | 上游结果版本不符（缓存被淘汰/被改） | true |
| \`STALE_RESULT\` | 预览请求的 \`resultVersion\` 与当前不符 | true（客户端重取） |
| \`SOURCE_READ_FAILED\` | 文件/HTTP/DB 读取失败 | 视原因 |
| \`SOURCE_PATH_DENIED\` | 路径不在 allowlist | false |
| \`SQL_EXEC_FAILED\` | DuckDB 执行失败 | false |
| \`TYPE_MISMATCH\` | 列类型不兼容（转换器或算子） | false |
| \`OUT_OF_MEMORY\` | 批次超出内存预算 | true（降 limit） |
| \`CANCELLED\` | 用户取消 | false |
| \`TIMEOUT\` | 超时中断 | true |
| \`INTERNAL\` | 未分类 | false |

### 6.12 MessagePort 建立

\`\`\`javascript
// electron/main/port-bridge.js
const { utilityProcess, MessageChannelMain } = require('electron');

function startExecutor(mainWindow) {
  const worker = utilityProcess.fork(path.join(__dirname, 'executor-entry.js'), [], {
    stdio: 'inherit',
  });
  const { port1, port2 } = new MessageChannelMain();

  worker.postMessage({ type: 'initPort' }, [port1]);
  mainWindow.webContents.postMessage('executorPort', null, [port2]);

  worker.on('exit', (code) => {
    mainWindow.webContents.send('executorCrashed', { code });
  });
  return worker;
}
\`\`\`

\`\`\`javascript
// preload：接收 port 并包一层（wrapPort），暴露 getExecutorPort()
// renderer：initExecutionClient() → getExecutorPort() → new ExecutionClient(port)
//           启动即发 getExecutorInfo，校验 protocolVersion，不一致则禁用执行并提示
\`\`\`

---
## 7. 端口级数据流转与转换器矩阵

### 7.1 四种基础流转规则

原文只讲了 \`chunk\` 与 \`table\` 之间的 4 条，且整段重复。修订后按「源形态 × 目标形态」完整展开：

| 上游结果 | 下游端口 | 转换 | 实现要点 | \`transformKind\` |
|---|---|---|---|---|
| \`chunk\` | \`chunk\` | **直连** \`ArrowBatchStream\` | 不做任何中间层，指针传递 | \`null\`（无需转换） |
| \`chunk\` | \`table\` | **攒批写 DuckDB 临时表** | \`ArrowBridge\` → \`DuckDBBridge::Append\`，按批 size（默认 10 万行 / 128 MB）落表；写完 \`flush\` 后追加 \`__row_seq\` | \`chunk_to_table\` |
| \`table\` | \`table\` | **表直连，SQL 直接引用表名** | 屏障算子把上游表名拼进 SQL，不搬数据 | \`null\` |
| \`table\` | \`chunk\` | **表流式读成 \`ArrowBatchStream\`** | \`SELECT ... FROM t ORDER BY __row_seq\` 分页游标，按批产出 Arrow | \`table_to_chunk\` |

**多输入屏障（Join / Union）**：每个输入端口**独立**做转换。示例：\`Join\` 的左输入是 \`chunk\`（写临时表），右输入是 \`table\`（直接引用）；不允许因为「另一个端口是 table」就强制左端口也走 table 路径（会多一次无效物化）。

\`\`\`text
Join 执行前：
  portA(chunk) ──chunk_to_table──▶ __tmp_<key>_A   ─┐
  portB(table) ─────identity───────────────────────┼──▶ JOIN SQL
                                                    ┘
执行后：__tmp_<key>_A 标记为「屏障输入表」，task release 时一并 DROP
\`\`\`

### 7.2 转换器全表（原文声称 10 条但只列 4 条，R-02）

\`PortKind\` / \`ResultKind\` 共 4 种形态，去掉同态直连，剩余 12 条理论组合；其中 \`chunk ↔ chunk\` 与 \`table ↔ table\` 属直连，\`db_table ↔ sql_cte\` 属同一形态内部差异（不走转换器），实际需要编码的转换器恰为 **10 条**：

| # | \`transformKind\` | 语义 | 实现 | M1 |
|---|---|---|---|---|
| 1 | \`chunk_to_table\` | Arrow 批次流 → DuckDB 表 | \`DuckDBBridge::Append\` | ✅ |
| 2 | \`table_to_chunk\` | DuckDB 表 → Arrow 批次流 | \`ArrowBridge::ScanStream\`（按 \`__row_seq\` 游标） | ✅ |
| 3 | \`json_to_chunk\` | JSON（数组/对象/标量）→ Arrow 批次 | \`JsonToArrow\`，按 \`jsonOutline\` 定 schema | ✅ |
| 4 | \`chunk_to_json\` | Arrow 批次 → JSON 文本 | 逐批序列化，流式拼接，不整体驻留 | M2 |
| 5 | \`table_to_json\` | DuckDB 表 → JSON | \`SELECT to_json(t) FROM t\` | ✅ |
| 6 | \`json_to_table\` | JSON → DuckDB 表 | \`json_to_chunk\` + \`chunk_to_table\` 组合 | ✅ |
| 7 | \`text_to_json\` | 文本（CSV 片段/脚本输出）→ JSON | 按 \`params.textFormat\` 解析，失败报 \`TYPE_MISMATCH\` | M2 |
| 8 | \`json_to_text\` | JSON → 格式化文本 | pretty-print，用于「文本预览」面板 | M2 |
| 9 | \`table_to_text\` | DuckDB 表 → CSV/文本串 | \`COPY (SELECT ...) TO ... (FORMAT CSV)\` 到内存缓冲 | ✅ |
| 10 | \`text_to_chunk\` | 文本 → Arrow 批次（单列 \`LargeUtf8\`） | 字段名为 \`value\`，供后续 \`JsonParse\`/\`Filter\` | ✅ |

> 契约测试要求：每个转换器一组「输入样本 → 期望 Arrow schema + 行内容」的 golden 用例，双端（JS 侧只测 \`transformKind\` 推导，C++ 侧测实现）。

### 7.3 转换器的插入位置

**Renderer 负责决定，C++ 负责执行**（职责边界必须清楚，否则两边都写一半）：

| 步骤 | 责任方 | 产物 |
|---|---|---|
| 1. 推导上游实际形态 | Scheduler（读 \`MetaStore.nodeMeta\` 的 \`NodeResult\`） | \`upstreamResultKind\` |
| 2. 与目标端口声明比对 | Scheduler | \`incomingTransform\` 或报 \`TYPE_MISMATCH\`（在 task 阶段就失败，别等运行时） |
| 3. 写入 \`Edge.transformKind\` | Scheduler | 任务自包含，执行器不需要再猜 |
| 4. 执行转换 | C++ | 发 \`edgeTransform\` 事件上报耗时 |

**只在一种情况 C++ 可自行插入转换器**：\`sql_cte\` fallback（§6.1）——因为 CTE 是否物化属于执行器内部实现细节，Renderer 无从判断。

### 7.4 批次与内存预算

| 参数 | 默认 | 说明 |
|---|---|---|
| \`batchRows\` | 100000 | 单批最大行数 |
| \`batchBytes\` | 128 MB | 单批 Arrow IPC 序列化后大小上限，先到者为准 |
| \`streamBufferBatches\` | 4 | stream 段上下游之间的环形缓冲批数（背压用） |
| \`previewWindowLimit\` | 500 | 单次 \`fetchPreviewWindow\` 硬上限（R-14） |
| \`previewPayloadBytes\` | 5 MB | 单次 \`previewChunk\` 的 Arrow IPC 载荷上限；超限则降 limit 或转窗口读（R-28） |

---

## 8. 缓存、增量与生命周期

> 这一章是原稿最薄弱的部分：只说了「paramsHash + upstreamVersion」，没讲清**什么算有效**、**失效了怎么办**、**缓存什么时候回收**。

### 8.1 版本计算（R-07）

\`\`\`javascript
// core/CacheKey.js
buildRecordSetKey({ graphId, nodeId, outputPortIndex = 0 }) =>
  \`\${graphId}:\${nodeId}:\${outputPortIndex}\`;            // 稳定、不含版本

buildResultVersion({ operatorImplVersion, schemaVersion, dataVersion, paramsHash, inputVersions }) =>
  hashString(JSON.stringify([
    operatorImplVersion,
    schemaVersion,
    dataVersion,
    paramsHash,
    [...inputVersions].sort(),                          // 顺序无关，避免多输入口顺序抖动
  ]));
\`\`\`

| 版本因子 | 来源 | 失效触发 |
|---|---|---|
| \`operatorImplVersion\` | \`manifest.json\` 字段 | 算子 C++ 实现改动、升级 App 版本 |
| \`schemaVersion\` | 输出列名/类型/顺序哈希 | 上游列增删、类型变化 |
| \`dataVersion\` | 数据源指纹 | 文件 \`size/mtime/inode\` 变化；SQL 源 \`count+max(pk)\` 变化；HTTP 源 \`ETag/Last-Modified\` 变化 |
| \`paramsHash\` | §8.2 | 参数编辑 |
| \`inputVersions\` | 各输入端口 \`upstreamResultVersion\` | 上游重算 |

> **为什么必须含 \`operatorImplVersion\`**：原稿漏了这一项，导致「改了 Filter 的 C++ 实现但缓存仍命中」，用户会看到旧结果——这是最难排查的一类 bug。

### 8.2 \`paramsHash\` 归一化规则（否则「参数没改却判为改了」或反之）

1. **键排序**：递归按 key 字典序重排，不依赖 \`Object.keys\` 顺序；
2. **数值规范化**：\`1\` 与 \`1.0\` 视为同值；\`-0 → 0\`；\`NaN/Infinity\` 显式编码为字符串标记；
3. **默认值填充**：按 \`manifest.schema\` 补齐缺省参数后再哈希（\`{limit: undefined}\` 与 \`{limit: 100}\` 必须区分，故只在**有默认值**时填）；
4. **排除易变字段**：\`previewLimit\`、\`ui.*\`、\`selectedColumn\`（仅影响展示）、\`lastRunAt\` 不进哈希；
5. **文件参数**：只哈希 \`FileFingerprint\`，不哈希路径字符串（用户移动文件但内容相同 → 应命中）；
6. **字符串裁剪**：\`trim\` 首尾空白，不做大小写折叠（SQL 标识符大小写在部分引擎下有意义）。

### 8.3 有效性与物化存在性（R-19）

\`\`\`javascript
/**
 * 三层判定，缺一不可：
 * L1 版本命中   resultVersion === expected
 * L2 物化存在   storeType=duckdb → tableExists(tableName)
 *               storeType=sqlite → previewCache.has(recordSetKey, version)
 *               storeType=memory → 进程内句柄仍在（stream 结果不可跨 task 复用）
 * L3 未被标记脏   !dirtySet.has(recordSetKey)
 */
function isNodeReusable(node) {
  const meta = metaStore.nodeMeta[node.nodeId];
  return meta &&
         meta.resultVersion === node.resultVersion &&
         isMaterialized(meta) &&
         !dirtySet.has(node.recordSetKey);
}
\`\`\`

**关键区分（原稿缺失）**：「元数据说结果有效」≠「结果还在」。DuckDB 临时表可能被 LRU 淘汰、进程可能刚崩溃重启。判定不通过时**不报错，而是降级为重建**——这是增量的正确语义。

### 8.4 增量调度决策顺序

\`\`\`mermaid
flowchart TD
  A[targetNodeId] --> B[collectSubgraph 反向可达]
  B --> C[topoSorted]
  C --> D{上游全部 reusable?}
  D -- 是 --> E[目标节点：只算自身<br/>上游直接读物化表]
  D -- 否 --> F[找到最上游的断点]
  F --> G[断点之后全部重算]
  E --> H[buildTask: 标记 skipExecution=false]
  G --> H
  H --> I[写入 Edge.transformKind]
  I --> J[下发 submitTask]
\`\`\`

规则：

1. **断点法**：从 \`targetNodeId\` 反向遍历，第一个「不可复用」的节点即断点，其后（含自身）全部进 \`nodes\`；
2. 断点之上的节点**不进入 \`nodes\`**，但必须在 \`inputPorts\` 里带 \`recordSetKey\` + \`upstreamResultVersion\`，供执行器直接引用已物化表；
3. 同级并行分支：M1 串行下按拓扑序，\`maxParallel=1\`；
4. 任何「不可复用但也不可重建」的情况（如源文件已删除）→ task 阶段报 \`SOURCE_READ_FAILED\`，不下发。

### 8.5 缓存容量与 GC（R-20，R-09 的回滚）

**三级回收**

| 级别 | 触发 | 动作 |
|---|---|---|
| L1 任务级 | \`releaseTask\` / \`taskDone\` | \`DROP TABLE __tmp_<taskId>_*\`；预览缓存保留（用于 UI 翻页） |
| L2 图级 | 关闭 graph / 删除节点 | \`DROP\` 该 graph 全部表；删 SQLite 中该 graph 的行 |
| L3 进程级 | 退出 / 内存超阈值 / 磁盘超阈值 | 清空 DuckDB 临时 schema；\`VACUUM\` SQLite；删 \`preview-cache.db-wal\` |

**预算**

| 项 | 默认上限 | 超限策略 |
|---|---|---|
| DuckDB 临时表总大小 | 2 GB | LRU 淘汰非「当前 task 依赖」的表 |
| SQLite 预览库 | 1 GB | LRU 淘汰 \`recordSetKey\`，保留最近 3 个 graph |
| 单结果集预览缓存行数 | 50000 行或 8 MB | 只缓存前 N 行 + 记录 \`total\`；超出的窗口**直读 DuckDB 表**（R-19 的补充，避免千万行全量落 SQLite） |

**取消回滚（R-09）**

1. 置 \`aborted_\` + \`duckdb_interrupt()\`；
2. 正在写的表标名前缀 \`__tmp_abort_\`，task 结束统一 DROP；
3. 已写成但版本未确认的 \`recordSetKey\` 置 \`dirty\`，下次必定重算；
4. 发 \`taskDone(status: "cancelled")\`，UI 保留上一次成功结果。

### 8.6 预览分页的正确性前提（R-14）

双向键集分页要有**稳定排序键**，而 DuckDB 表**没有稳定 \`rowid\`**（\`rowid\` 在 \`UPDATE/DELETE\` 后会变，且不保证有序）。因此：

| 要求 | 实现 |
|---|---|
| 物化时追加序号列 | \`ALTER TABLE t ADD COLUMN __row_seq BIGINT\`，用 \`row_number() over ()\` 初始化，后续 append 时按 \`max(__row_seq)+1\` 续写 |
| SQLite 预览表 | \`CREATE TABLE preview(record_set_key TEXT, result_version TEXT, seq INTEGER, payload BLOB, PRIMARY KEY(record_set_key, seq))\` |
| 前向翻页 | \`WHERE seq > anchorSeq ORDER BY seq LIMIT n\` |
| 后向翻页 | \`WHERE seq < anchorSeq ORDER BY seq DESC LIMIT n\`，前端逆序渲染 |
| 版本校验 | 请求带 \`resultVersion\`，不等于当前则返回 \`STALE_RESULT\`，客户端丢弃窗口并重取首页 |
| \`total\` 语义 | **结果集总行数**（\`rowCount\`），不是已缓存行数；UI 用 \`cachedRows / total\` 显示「已缓存比例」 |

> 深滚动恒定耗时 = 键集分页 + 索引；若改用 \`LIMIT n OFFSET k\`，第 500 页会退化为全表扫描——这是原稿未点明的风险。

---
## 9. 类依赖与调用关系

### 9.1 依赖图

\`\`\`mermaid
flowchart TB
  subgraph Renderer
    S["Scheduler<br/>runTask / buildEtlTask"]
    GS["GraphStore（Pinia）"]
    MS["MetaStore（Pinia）"]
    EC["ExecutionClient"]
    PC["PreviewClient"]
    UI["画布 / NodeEditor / PreviewPanel"]
  end

  subgraph Executor["C++ 执行器（utilityProcess）"]
    Main["Addon 主线程<br/>MessagePortSender"]
    Q["RequestQueue"]
    Th["ExecThread"]
    R["EtlTaskRunner"]
    SS["StreamingSegmentRunner"]
    BS["BarrierSegmentRunner"]
    AB["ArrowBridge"]
    DB["DuckDBBridge"]
    CA["PreviewCache"]
    REG["OperatorRegistry"]
  end

  S --> GS
  S --> MS
  S --> EC
  PC --> EC
  UI --> PC
  UI --> MS

  EC -- "MessagePort" --> Main
  Main -- "submitTask / 关闭" --> Q
  Main --> Q --> Th
  Th --> R
  R --> REG
  R --> SS
  R --> BS
  SS --> AB
  BS --> AB
  BS --> DB
  AB --> DB
  R --> CA
  CA --> SQLITE[("SQLite WAL")]
  DB --> DUCK[("DuckDB")]
\`\`\`

**依赖方向铁律**：

- \`Renderer\` **永不**直接引用 \`cpp-executor\` 的任何 C++ 头文件或类型（跨语言只靠消息）；
- \`Scheduler\` 不依赖 \`ExecutionClient\` 的具体实例，只依赖注入的接口（便于单测 mock）；
- \`EtlTaskRunner\` 不依赖 \`PreviewCache\` 的具体表结构，只依赖 \`IPreviewCache\` 接口。

### 9.2 Renderer 侧调用

\`\`\`javascript
// Scheduler.runTask
const options = { mode: 'preview', targetNodeId, previewLimit: 5000, maxParallel: 1 };
const task = scheduler.buildEtlTask(graphId, targetNodeId, options);
const { taskId } = await executionClient.submitTask(task);

executionClient.onExecutionEvent((event) => {
  switch (event.eventType) {
    case 'nodeStart':   metaStore.markNodeRunning(event.nodeId); break;
    case 'nodeDone':    metaStore.updateNodeMeta(event.nodeId, event.result); break;
    case 'nodeSkipped': metaStore.markNodeSkipped(event.nodeId, event.causeNodeId); break;
    case 'taskDone':    finishTask(event.taskId, event.status, event.stats); break;
    case 'error':       showNodeError(event.nodeId, event.error); break;
  }
});

// 用户滚动预览
const win = await previewClient.fetchWindow(recordSetKey, {
  resultVersion,
  direction: 'forward',
  anchorSeq: 100,
  limit: 50,
});
// 若返回 STALE_RESULT：清空本地窗口 → 重新请求首页 → 提示「上游已更新」
\`\`\`

### 9.3 C++ 侧调用

\`\`\`cpp
// ── Addon 主线程：只做校验与入队，绝不做重活 ──────────────────
void HandleSubmitTask(const Napi::CallbackInfo& info) {
  EtlTask task = ParseTask(info[0]);
  if (task.protocolVersion != kProtocolVersion) {
    SendError(task.taskId, MakeError("PROTOCOL_MISMATCH", "执行器版本与任务不一致"));
    return;
  }
  // 一致性校验：task 的 executeMode hint 与 registry 必须一致（R-04）
  for (const auto& node : task.nodes) {
    if (OperatorRegistry::Get(node.nodeType).executeMode != node.executeMode) {
      SendError(task.taskId, MakeError("PLAN_SPEC_MISMATCH", "算子执行模式不一致", node.nodeId));
      return;
    }
  }
  SendEvent("taskAccepted", {{"taskId", task.taskId}});
  queue_.Push(RunTaskTask{task});          // 交给 ExecThread
}

// ── ExecThread：唯一句柄拥有者 ────────────────────────────────
void ExecThread::Loop() {
  while (!stop_) {
    if (auto task = queue_.TryPopReadTask()) { HandleReadTask(task); continue; }
    if (auto run = runQueue_.TryPop())        { runner_->RunTask(run->task); continue; }
    WaitForWork(5 /*ms*/);                   // 空闲不烧 CPU
  }
}

void EtlTaskRunner::RunTask(const EtlTask& task) {
  for (const auto& node : task.nodes) {
    if (aborted_.load()) { SendEvent("taskDone", {{"status", "cancelled"}}); return; }

    const OperatorSpec& spec = OperatorRegistry::Get(node.nodeType);
    EmitNodeStart(node.nodeId);
    try {
      const NodeResult result = (spec.executeMode == ExecuteMode::kStream)
                                  ? RunStreamNode(node)
                                  : RunBarrierNode(node);   // 屏障内部自带 chunk→table
      EmitNodeDone(node.nodeId, result);
    } catch (const CancelledError&) {
      EmitNodeDone(node.nodeId, {}, NodeStatus::kCancelled);
      SendEvent("taskDone", {{"status", "cancelled"}});
      return;
    } catch (const ExecutorError& e) {
      EmitError(node.nodeId, e);
      MarkDownstreamSkipped(node.nodeId);   // R-10：下游发 nodeSkipped
      SendEvent("taskDone", {{"status", "error"}});
      return;
    }
    CheckBatchBoundary();                   // 每节点结束也过一遍读队列，保证预览及时
  }
  SendEvent("taskDone", {{"status", "ok"}, {"stats", BuildStats()}});
}

// ── 事件上报：带背压（R-16） ─────────────────────────────────
void MessagePortSender::Emit(const ExecutionEvent& ev) {
  if (ev.eventType == "previewChunk" && pendingPreviewBytes_ > kMaxPendingBytes) {
    dropOldestPreviewChunk();               // 合并成「最新窗口」，置 coalesced=true
  }
  threadsafeFn_.NonBlockingCall(ToJs(ev));  // 工作线程绝不阻塞在 JS 回调上
}
\`\`\`

**为何用 \`NonBlockingCall\`**：\`BlockingCall\` 会让工作线程等主线程事件循环，一旦渲染进程卡顿（比如用户在拖拽节点），执行线程也被拖住，形成「UI 卡 → 计算卡 → UI 更卡」的正反馈。这是原稿未考虑的死锁风险。

### 9.4 消息流与背压边界

| 通道 | 方向 | 有界？ | 超限策略 |
|---|---|---|---|
| \`submitTask\` / \`cancelTask\` | R → E | 有界（并发 task ≤ 4） | 拒绝并返回 \`NODE_PARAM_INVALID\` |
| \`fetchPreviewWindow\` | R → E | 有界（RequestQueue 深度 ≤ 32） | 丢弃最旧请求 |
| \`previewChunk\` | E → R | 有界（32 MB / 64 批） | 合并或丢中间批，置 \`coalesced\` |
| \`nodeDone\` / \`taskDone\` | E → R | 无界但量小（≤ 节点数） | 不设限 |
| 日志 \`log\` | E → R | 有界（ring buffer 500 条/节点） | 丢 debug 级 |

---

## 10. 命名约定

### 10.1 概念名（冻结）

| 概念 | 定稿 | 说明 |
|---|---|---|
| 图 id | \`graphId\` | 替代 \`workflowId\` |
| 结果集标识 | \`recordSetKey\` | 单数；一个 key 对应一个结果集；**不含版本** |
| 结果版本 | \`resultVersion\` | 唯一的版本名，其余别名一律废弃 |
| 输入形态 | \`recordSetKind\`（类型为 \`PortKind\`） | \`chunk\` / \`table\` / \`json\` / \`text\` |
| 输出形态 | \`outputRecordSetKind\`（类型为 \`ResultKind\`） | \`db_table\` / \`sql_cte\` / \`json\` / \`text\` |
| 执行模式 | \`executeMode\` | \`stream\` / \`barrier\`，算子静态属性 |
| 执行结果 | \`result\` | 跨类传递统一 \`result\` |
| CTE 优化 | \`cteOptimize\` | 保留，暂不实现，默认 \`false\` |
| 预览分页 | \`fetchWindow\` | 双向键集分页 |
| 执行任务 | \`etlTask\`（类型 \`EtlTask\`） | 原 \`ExecutionPlan\`，含 \`nodes\` / \`edges\` / \`options\` |
| 边 | \`edge\` | 与 \`GraphStore.edges\` 同构，额外带 \`transformKind\` |
| 行序号 | \`seq\` / \`__row_seq\` | \`seq\` 为缓存列名，\`__row_seq\` 为 DuckDB 物理列名 |

### 10.2 函数动词（冻结）

| 动作 | 定稿 | 反例 |
|---|---|---|
| 保存 | \`save\` | \`persist\`（仅用于数据物化语境） |
| 读取（远程/分页） | \`fetch\` | \`load\`、\`query\` |
| 同步取 | \`get\` | \`read\` |
| 释放单个 | \`release\` | \`free\`、\`delete\` |
| 清空全部 | \`clear\` | \`reset\`（\`reset\` 仅用于状态机复位） |
| 构建 | \`build\` | \`create\`（\`create\` 仅用于实体创建） |
| 校验 | \`validate\` | \`check\` |
| 执行算子 | \`execute\` | \`run\` |
| 执行任务/计划 | \`run\` | \`execute\` |
| 订阅 | \`subscribe\` | \`on\`（返回 unsubscribe 才用 \`subscribe\`） |

### 10.3 命名风格

| 语境 | 风格 | 例 |
|---|---|---|
| JS 变量/字段/消息载荷 | camelCase | \`recordSetKey\`、\`taskId\` |
| C++ 成员 | trailing underscore | \`aborted_\`、\`previewCache_\` |
| C++ 类型/枚举值 | PascalCase / \`k\` 前缀 | \`ExecuteMode::kStream\` |
| CSS class | kebab-case + \`dc-\` 前缀 | \`dc-preview-panel\` |
| 数据库表 | snake_case + 前缀 | \`__tmp_<taskId>_<nodeId>\`、\`__barrier_<key>\` |
| 事件/消息 \`type\` | camelCase | \`nodeDone\`、\`fetchPreviewWindow\` |

> **一致性代价说明**：原稿 wire 层用 snake_case（\`node_done\`），JS 层用 camelCase，中间必须有转换表，且极易漏改（R-06 就是漏改的结果）。统一 camelCase 后省掉整层 codec，C++ 侧字符串直接 \`"nodeDone"\`，代价仅是 C++ 里不太像本地风格——可接受。

---
## 11. 待实现清单与验收标准

> 原稿只有优先级，没有「怎么算做完」。每项补 DoD（Definition of Done），全部为可测的布尔条件（R-35）。

### 11.1 契约层（P0）

| # | 任务 | DoD |
|---|---|---|
| C-1 | \`OperatorMeta\` / \`OperatorInputPort\` / \`NodeResult\` / \`OperatorContext\` / \`EtlTask\` 的 JSDoc + C++ 头文件 | 双端字段名 100% 一致，有 \`contract-diff.test.js\` 对比 JS typedef 与 C++ 头文件字段清单 |
| C-2 | \`operators/manifest.json\` 唯一真源 + 双端生成脚本 | 手改生成产物即 CI 失败；\`manifest\` 增字段后双端同步编译通过 |
| C-3 | \`ResultKind\` 加入 \`resultVersion\` / \`schemaVersion\`（必填） | 任一节点产出缺版本号即抛 \`INTERNAL\`，单测覆盖 |
| C-4 | \`TransformKind\` 10 条枚举 + \`resolveTransform()\` 推导函数 | 4×4 形态矩阵全覆盖用例，12 组合中 2 直连 + 10 转换，无 \`default\` 漏洞分支 |
| C-5 | \`ExecutorError\` 与错误码表 | 12 个 code 各有触发路径的单测；错误信息不含裸堆栈给用户 |

### 11.2 调度层

| # | 任务 | DoD |
|---|---|---|
| S-1 | \`Scheduler.runTask\` + \`buildEtlTask\` | 给定 6 节点样例图，产出任务拓扑序正确、\`Edge.transformKind\` 全部有值 |
| S-2 | \`_collectSubgraph\` / \`_topoSort\` / \`_decideIncremental\` / \`_collectInputs\` / \`_validateInputSupport\` | 环路检测报错；断点法单测覆盖 5 种场景（全命中/中间断/末端断/全断/源缺失） |
| S-3 | \`paramsHash\` 归一化（§8.2 六条规则） | 键序无关、\`1\` 与 \`1.0\` 同值、默认值填充、易变字段排除，各一条断言 |
| S-4 | \`MetaStore\` / \`GraphStore\` | \`executionRegions\` 结构有 typedef；节点删除后 \`MetaStore\` 无残留 |
| S-5 | \`isNodeReusable\` 三层判定 | 模拟「表被淘汰」场景 → 判定为不可复用并降级重建，不抛错 |

### 11.3 通信层

| # | 任务 | DoD |
|---|---|---|
| P-1 | \`port-bridge.js\` + preload \`wrapPort\` + \`getExecutorPort\` | 进程重启后可重新建连；端口不泄漏（\`port.close()\` 有调用） |
| P-2 | \`ExecutionClient\` + \`PreviewClient\` | \`getExecutorInfo\` 版本校验失败时禁用执行并提示；\`STALE_RESULT\` 自动重取首页 |
| P-3 | 协议字段一致性 | 消息 \`type\` 与载荷全 camelCase；事件必有 \`eventType\`；有 \`protocol.test.js\` 逐字段比对 |

### 11.4 C++ 执行器

| # | 任务 | DoD |
|---|---|---|
| E-1 | \`AddonEntry.cpp\` + \`napi_async_work\` + \`ThreadSafeFunction\`（\`NonBlockingCall\`） | 工作线程阻塞时不拖慢主线程事件循环（压测：渲染进程故意 sleep 200ms，\`fetchWindow\` 仍 < 50ms 返回） |
| E-2 | \`ExecThread\` + \`RequestQueue\`（单写者模型） | 主线程零句柄接触（代码审查 + TSan 跑 1 小时无告警） |
| E-3 | \`EtlTaskRunner\` | 取消 < 100 ms 生效（含 DuckDB 长查询 \`interrupt\`）；下游 \`nodeSkipped\` 全部发出 |
| E-4 | \`OperatorRegistry\`（manifest 生成） | 与任务的 \`executeMode\` 不一致时返回 \`PLAN_SPEC_MISMATCH\`，不静默纠正 |
| E-5 | \`DuckDBBridge\` / \`ArrowBridge\` / \`PreviewCache\` | 预览库 WAL 模式生效；\`__row_seq\` 深翻页第 500 页耗时与第 1 页相差 < 2 倍 |
| E-6 | Electron ABI 构建链 | \`electron-rebuild\` 后 \`.node\` 可在 \`utilityProcess\` 加载；macOS 签名包可运行 |

### 11.5 算子实现

| # | 案例 | DoD |
|---|---|---|
| O-1 | **Case 1（Batch→Batch）**：\`CsvReader → Filter → Formula\`，全程 Arrow 流 | 100 万行 CSV：无中间落表（DuckDB 表数量为 0）；峰值 RSS < 300 MB |
| O-2 | **Case 2（Batch→Barrier→Barrier）**：\`Filter → Join → Summarize\` | 验证 stream 端点写临时表、屏障链式查表；\`edgeTransform\` 事件数量与预期一致（2 条） |
| O-3 | **Case 3（工作流混合，新增，R-24）**：\`FolderScan → CsvReader → Filter → CsvWriter\` | 一个目录 10 个 CSV 自动并流；差异化的最小可演示路径 |
| O-4 | 后续：\`QaCheck\` / 动态参数 / \`TriggerManager\` / 列统计 | 各自 DoD 待细化，M2/M3 排期 |

### 11.6 性能与质量基线（新增，R-26）

| 指标 | 目标 | 测法 |
|---|---|---|
| 1000 万行 × 5 节点端到端 | < 90 s（SSD，8 核） | 固定数据集 \`bench/10m.csv\`，3 次取中位数 |
| 单节点增量预览（上游命中） | < 300 ms | 只改末端节点参数 |
| 预览深翻页（第 500 页） | 与首页同量级（< 2 倍） | \`fetchWindow\` 100 次平均 |
| 峰值 RSS（1000 万行 Join） | < 3 GB | 目标机器 16 GB |
| 取消响应 | < 100 ms | 手动 + 自动化 |
| 转换器契约测试通过率 | 10/10 | CI |

---

## 12. 关键取舍记录

| 取舍 | 决定 | 理由 | 代价（诚实标注） |
|---|---|---|---|
| Filter 是否自动下推 | 不自动下推，通用 Filter 走批处理 | 复杂度可控；大表过滤靠数据源 SQL \`WHERE\` | 千万行 CSV 反复 Filter 时性能不如 Alteryx 的谓词下推 |
| 数据源下推节点 | 不做 | 用户数据在 Excel / 远程 DB，不在 DuckDB 内 | 远端 DB 场景要靠 \`HttpPull\` 或导出后处理，体验割裂 |
| \`lazy\` 模式 | 保留字段，UI 隐藏，暂不实现 | \`cteOptimize\` 落地后再启用 | \`sql_cte\` 短期是半死状态，需 fallback 兜底（R-08） |
| \`executeMode\` 是否进 task | **进**，但仅作 hint，执行器以 registry 为准并校验 | Renderer 需要它做增量与物化决策（R-04 的信息不对称） | 多一处校验成本；manifest 变更需重算任务 |
| \`EtlTaskNode\` / \`Edge\` | 不存在 \`PlanNode\` / \`PlanEdge\`，直接用 \`EtlTaskNode\` / \`edge\` | IR 简洁，少一层映射 | 未来引入「任务优化器」时可能需中间 IR，届时再加 |
| 控制流 | n8n 式独立节点（\`foreach\` / \`switch\`），不做 Alteryx 容器 | 用户心智简单，画布一致 | 循环体内无法做整体物化优化，大循环性能弱 |
| 动态 Key JSON | 默认 \`LargeUtf8\`，预览出口 \`to_json\` | Arrow \`Struct\` 不支持动态 Key | 动态字段无法列式下推，只能全量解析 |
| 预览分页 | SQLite + \`seq\` 主键，双向键集分页 | 深滚动恒定耗时 | 需额外 \`__row_seq\` 列与写放大 |
| 大数据预览 | 单次载荷 5 MB 阈值；超限降 limit 或直读表窗口 | 平衡性能与体验 | 用户「看全量」需多次翻页或导出 |
| 线程模型 | 主线程接单，\`ExecThread\` 兑现（单写者） | 预览/取消不阻塞且不违反 DuckDB 线程安全 | 读请求有「一个批次」的排队延迟 |
| 并行度 | M1 串行，M2 屏障级并行 | 先保正确性；并行牵扯连接池与内存预算 | 多分支场景 M1 明显慢于潜在并行上限 |
| wire 命名 | 全 camelCase | 消除 snake↔camel 转换层（漏改风险） | C++ 侧命名风格不一致，需团队约定接受 |
| \`operatorImplVersion\` 进哈希 | 进 | 不改实现却改行为时缓存必须失效 | 每次发版全员缓存清空，首跑变慢（可用「语义版本」缓解：仅实现变更才 bump） |

---

## 13. 风险登记与开放问题

### 13.1 风险登记（按「影响 × 概率」排序）

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| K-1 | \`__row_seq\` 写放大与并发 append 竞争 | 大表物化慢 10~20% | 批量 append 时一次性算好区间，减少 \`max()\` 查询次数 |
| K-2 | DuckDB 单连接串行导致「预览等执行」 | 长任务中预览有秒级延迟 | M2 读连接（只读多 connection）；或预取窗口缓存 |
| K-3 | SQLite 预览库膨胀 | 磁盘占满、\`VACUUM\` 抖动 | §8.5 三级 GC + 容量上限 |
| K-4 | manifest 双端生成链路断裂 | 静默不一致 → 运行时 \`PLAN_SPEC_MISMATCH\` | CI 校验生成产物与 manifest 一致 |
| K-5 | Electron ABI / 签名问题导致 addon 加载失败 | 打包后功能全废，开发期不可见 | 打包流水线加「冒烟启动 + \`getExecutorInfo\` 探活」 |
| K-6 | 恶意或误配路径读写 | 数据泄露 / 覆盖用户文件 | 路径 allowlist（项目目录 + 显式授权），写出前二次确认 |
| K-7 | 动态 JSON 全量解析内存爆 | 单批超 128 MB 后 OOM | 强制流式解析 + \`OUT_OF_MEMORY\` 降 limit |
| K-8 | 用户把「增量预览」误当「结果一定最新」 | 旧结果误导决策 | UI 显示 \`resultVersion\` 与「上次运行时间」，缓存命中时给轻提示 |

### 13.2 开放问题（需产品/技术共同决策）

| # | 问题 | 备选 | 建议 |
|---|---|---|---|
| Q-1 | 增量是否跨会话持久化（关掉 App 再开还能命中缓存）？ | ① 仅进程内 ② 持久化到磁盘 | ② 但要绑定 \`operatorImplVersion\`，否则升级后脏命中；M3 再议 |
| Q-2 | \`maxParallel\` 默认给几？ | 1 / 核数-1 | M1 固定 1，M2 按屏障数动态 |
| Q-3 | 预览是否需要「采样模式」（千万行只看前 1000 行 + 计数）？ | 是/否 | 要，且默认开启；否则用户会误以为预览=全量 |
| Q-4 | 工作流算子的「文件变化」由谁监听（\`chokidar\` 还是轮询）？ | 渲染进程 / 主进程 | 主进程监听，转发事件；避免每台机器多份 watcher |
| Q-5 | 脚本算子的执行沙箱 | 同进程 \`eval\` / 子进程 / 容器 | 子进程 + 资源限额；\`eval\` 直接排除（安全） |
| Q-6 | \`sql_cte\` 是否本期直接删除 | 删 / 保留 fallback | 保留 fallback（改动小，且为 \`cteOptimize\` 留口） |

---

## 14. 附录

### 14.1 交接开场 Prompt（非规格正文，R-31）

> 我要继续开发 DataClean ETL 引擎，架构已冻结（见 v2.0 规格文档）。核心：Renderer（Vue3）负责调度决策，C++ 执行器（\`utilityProcess\` + Node-API Addon）同进程持有 DuckDB 与 SQLite 预览缓存，只通过 \`MessagePort\` 通信；数据交换唯一标准是 Arrow \`RecordBatch\`；端口级 4 条流转规则 + 10 个 \`TransformKind\` 转换器；增量基于 \`resultVersion = hash(operatorImplVersion, schemaVersion, dataVersion, paramsHash, sortedInputVersions)\`；预览用 SQLite \`seq\` 主键 + \`__row_seq\` 列做双向键集分页。
> 执行约束：Addon 主线程只接单，\`ExecThread\` 独占 DuckDB/SQLite 句柄（单写者 + 请求队列）；事件用 \`NonBlockingCall\` 并带背压；取消用 \`duckdb_interrupt()\`。
> 现在要落地 \`[具体文件]\`，请先给出该文件的接口签名与不变式，再给实现。

### 14.2 一页速查卡

| 我要做什么 | 看哪一节 |
|---|---|
| 新增一个算子 | §4.3（登记 manifest）→ §6.2（meta）→ §7.3（转换器推导） |
| 排查「结果没更新」 | §8.1 版本因子 → §8.3 三层判定 |
| 排查「预览翻页错位」 | §8.6（\`resultVersion\` 校验 + \`__row_seq\`） |
| 排查「取消没反应」 | §8.5（\`duckdb_interrupt\` + 批次边界检查） |
| 排查「打包后跑不起来」 | §5.5（ABI / asarUnpack / 签名）→ §13.1 K-5 |
| 加一个新消息 | §6.10（命名 camelCase）→ §6.11（错误码）→ §9.4（背压） |

### 14.3 变更提案流程

1. 任何契约字段变动，先改 \`operators/manifest.json\` 与本文件对应章节；
2. 双端生成脚本重跑，\`contract-diff.test.js\` 必须通过；
3. 记录到 §0 修订记录，标注影响的 \`resultVersion\` 因子（是否需强制清缓存）；
4. 涉及 §2.3 硬约束的改动，需单独评审，不得在实现中静默放宽。

---

**文档结束。** 本版为评审修订稿，落地前请先关闭第 1 章 P0 的 9 项；P1 可在 M1 开发中并行处理，P2 已在本版完成。
