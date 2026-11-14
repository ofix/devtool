# DataClean ETL 引擎 C++ 侧架构交接文档

## 一、引擎需求目标与设计思想

### 需求目标

面向分析师的可视化 ETL，单机运行（macOS / ARM64 麒麟 V10）。

- 处理百万至千万行级数据。
- 支持节点级并发、流式/物化混合执行。
- 前端可随时预览任意已执行节点的全量数据。

### 核心设计思想

1. **编译与执行分离**：`GraphCompiler` 负责把 JSON DAG 编译成带拓扑序和类型推导的 `EtlTask`，`Scheduler` 和 `EtlEngine` 只负责执行，不关心图语义。
2. **单一调度真源**：C++ 侧是唯一的编译器和调度器，JS 端只负责 UI 和发送原始 Graph。
3. **端口类型统一**：统一使用 `PortDataKind`（`kChunk / kTable / kJson / kText`），消除历史遗留的 `PortKind / ResultKind` 分离。
4. **自动转换注入**：编译期根据上下游端口契约自动插入 `ChunkToTable` 等转换节点，运行期无需感知类型不匹配。
5. **内存 / 磁盘双态物化**：节点输出默认在内存缓冲，超阈值自动落盘 DuckDB；前端分页查询时，内存态走 C++ 指针切片，落盘态走 SQL。
6. **依赖本地化固化**：所有第三方库（DuckDB amalgamation、nlohmann、node-addon-api）均放入 `third_party/`，不依赖 `FetchContent` 或 Homebrew，保证跨平台可复现。

## 二、完整架构与调用关系

### 执行链路（从 JS 调用到数据产出）

```shell
JS 调用 executePipeline(json)
↓
Entry.cpp (NAPI AsyncWorker，后台线程)
↓
GraphCompiler::Compile(json, targetNodeId, outTask, &traces)
│  ├─ ParseGraph           : JSON → 内部 Graph 模型
│  ├─ ValidateGraphStructure: 算子存在性、端口越界、重复边、自环
│  ├─ CollectUpstream       : 子图裁剪（可选）
│  ├─ ValidateParams        : 参数存在性、类型、未知键
│  ├─ TopoSort              : 环检测 + 拓扑排序
│  ├─ InjectTransforms      : 自动插入类型转换节点
│  └─ BuildEtlTask          : 产出 EtlTask
↓
EtlEngine::Execute(task, outError)
│  ├─ MaterializedStore::EvictAll()   : 清空上一轮物化数据
│  ├─ 预创建所有边的 RequestQueue     : 节点间通信管道
│  └─ Scheduler::Run(task, callback)
│        │
│        ├─ 按入度调度节点
│        └─ 多线程调用 EtlEngine::ExecuteSingleNode(node)
│              ├─ 从上游 RequestQueue 拉取输入
│              ├─ 借 DuckDBSession 连接 → 创建 EngineContextImpl
│              ├─ OperatorRegistry::Create(node.operatorType)
│              ├─ op->BindParams / SetInputs / Execute(ctx)
│              ├─ MaterializedStore::Write(nodeId, array, schema, conn)
│              └─ 推结果到下游 RequestQueue，最后 Close()
↓
JS 调用 getNodeDataPage(nodeId, offset, limit)
↓
Entry.cpp
├─ MaterializedStore::GetState(nodeId)
├─ kBuffering → ReadMemoryPageJson（C++ 指针切片 → JSON）
└─ kSpilled   → ReadSpilledPage → DuckDBResultToJson
```

## 三、接口约定

### 1. 端口类型 PortDataKind

```cpp
enum class PortDataKind { kChunk, kTable, kCte, kJson, kText };
```

- `kChunk`：Arrow 记录批次，流式处理。
- `kTable`：DuckDB 临时表名（`std::string`），用于重计算。

转换规则通过 `PortTransformRegistry` 注册，编译器在 `InjectTransforms` 阶段自动插入转换节点。

### 2. 算子契约 OperatorSpec

```cpp
struct OperatorSpec {
    std::string_view typeName;
    ExecuteMode executeMode;          // kStream / kBarrier
    bool parallelSafe;
    uint32_t minInputPorts, maxInputPorts;
    PortContract inputPorts[8];       // acceptedKinds
    PortContract outputPorts[8];      // possibleResultKinds
    SchemaFieldContract schema[32];
    ParamContract params[16];         // key / kind / required
    std::string_view operatorImplVersion;
};
```

### 3. 算子基类 OperatorBase

```cpp
class OperatorBase {
    virtual void BindParams(const nlohmann::json& params) = 0;
    virtual void SetInputs(const std::vector<std::shared_ptr<void>>& inputs) = 0;
    virtual std::vector<std::shared_ptr<void>> Execute(OperatorContext& ctx) = 0;
};
```

算子由 `OperatorRegistry::Create(typeName)` 创建，通过 `REGISTER_OPERATOR` 宏在算子 `.cpp` 末尾静态注册。

### 4. 执行上下文 OperatorContext

```cpp
class OperatorContext {
    virtual DuckDBSession::SessionConnection* GetSessionConnection() = 0;
    virtual std::string AllocateTempTableName(const std::string& prefix) = 0;
};
```

每次节点执行时由 `EtlEngine` 创建，生命周期与节点执行绑定。

### 5. 物化存储 MaterializedStore

```cpp
enum class State { kUnknown, kBuffering, kSpilled };

// 引擎写入：内存态存入 vector<ArrowArrayHolder>，超限则刷入 DuckDB
State Write(nodeId, ArrowArray*, ArrowSchema*, SessionConnection*);

// 前端分页：内存态走 JSON 切片，落盘态走 SQL
std::string ReadMemoryPageJson(nodeId, offset, limit);
std::unique_ptr<duckdb_result> ReadSpilledPage(nodeId, offset, limit, conn);

// 生命周期
void EvictNode(nodeId, conn);
void EvictAll(conn);
```

- 落盘阈值：5000 行 / 8MB 触发落盘。
- 表名规则：`node*result*<nodeId>`。

## 四、第三方依赖（全部本地化）

| 依赖                | 位置                          | 用途                                                                |
| ------------------- | ----------------------------- | ------------------------------------------------------------------- |
| DuckDB amalgamation | `third_party/duckdb/`         | 数据库执行引擎（`duckdb.cpp` 直接编入）                             |
| nlohmann/json       | `third_party/nlohmann/`       | JSON 解析与序列化                                                   |
| node-addon-api      | `third_party/node-addon-api/` | NAPI 头文件（仅 `napi.h` + `napi-inl.h` + `napi-inl.deprecated.h`） |
| Node.js 头文件      | 系统                          | `node_api.h` 通过 CMake `find_path` 定位                            |

> 约束：不引入 Apache Arrow C++ 库。所有 Arrow 数据操作通过 C Data Interface（`ArrowArray / ArrowSchema / ArrowArrayStream`）完成，避免跨平台编译负担。

## 五、核心类职责与成员函数实现思路

### 1. GraphCompiler

职责：JSON → `EtlTask` 的纯编译逻辑，无运行期副作用。
实现要点：

- `ParseGraph`：严格校验 JSON 结构，失败时返回带 `nodeId` 的错误。
- `ValidateParams`：先批量解析所有 `paramsRaw`，再用 `.at()` 校验，避免 `operator[]` 静默插入。
- `TopoSort`：Kahn 算法，环检测时输出具体环路径。
- `InjectTransforms`：遍历拓扑序，对类型不匹配的边，查 `PortTransformRegistry` 插入 `__conv_N` 节点。
- `BuildEtlTask`：用 `GraphIndex` 做 O(1) 查找，避免线性扫描。

### 2. Scheduler

职责：纯 DAG 并发调度，不碰业务数据。
实现要点：

- 维护 `pendingDeps` 计数器，入度为 0 时 dispatch。
- 线程池大小 = `hardware_concurrency() / 2`，防止 DuckDB 内部线程叠加导致 OOM。
- 节点完成后递减下游计数器，归零即派发。
- 错误传播：任一节点抛异常，标记 `hasError` 并通知主线程退出。

### 3. EtlEngine

职责：执行入口与资源编排。
实现要点：

- `Execute`：`EvictAll` → 建队列 → 启动 Scheduler。
- `ExecuteSingleNode`：
  - 从 `RequestQueue` 阻塞拉取输入直到 `Close()`。
  - 创建 `EngineContextImpl`（RAII 借还连接）。
  - `OperatorRegistry::Create + BindParams + SetInputs + Execute`。
  - `MaterializedStore::Write` 写入输出。
  - 推结果到下游队列并 `Close()`。

### 4. MaterializedStore

职责：节点输出物化与分页查询。
实现要点：

- `Write`：快路径判断 `kSpilled` 直写 DuckDB；慢路径判断阈值，超限时刷盘。
- `ReadMemoryPageJson`：遍历 `ArrowArray`，按行偏移切片，直接拼 JSON。
- `ReadSpilledPage`：DuckDB `LIMIT/OFFSET` 查询。
- `EvictNode / EvictAll`：释放内存或 `DROP TABLE`。

### 5. DuckDBSession

职责：DuckDB 实例与连接池管理。
实现要点：

- 使用 C API（`duckdb_open_ext / duckdb_connect / duckdb_query`）。
- `AppendArrowToTable`：通过 `duckdb_arrow_scan` 零拷贝写入。
- 连接池：`Acquire` 阻塞等待，`Release` 归还并 `notify_one`。

### 6. RequestQueue<T>

职责：节点间线程安全数据管道。
实现要点：

- 有界队列（默认容量 100），满时 `Push` 阻塞（背压）。
- `Close()` 广播 EOS，`Pop` 返回 `std::optional<T>`。
- 移动语义避免数据拷贝。

### 7. OperatorRegistry / PortTransformRegistry

职责：算子与转换规则的静态注册表。
实现要点：

- 单例 + 互斥锁。
- `REGISTER_OPERATOR / REGISTER_PORT_TRANSFORM` 宏在程序启动时静默注册。
- `Create / Rules` 提供查询接口。

### 8. Entry.cpp

职责：NAPI 边界，JS 与 C++ 的唯一通道。
实现要点：

- `ExecutePipeline`：`Napi::AsyncWorker` 异步执行，返回 Promise，绝不阻塞主线程。
- `GetNodeDataPage`：根据 `MaterializedStore::GetState` 分派内存 JSON 或 DuckDB 分页。
- `OnNodeDeleted`：调用 `EvictNode` 精确释放资源。
- `DuckDBResultToJson`：逐单元格读取 `duckdb_result`，转 JSON 字符串。

## 六、需要改进与迭代的地方

### 高优先级（正确性 / 稳定性）

- `AppendArrowToTable` 的完整实现：当前 `DuckDBSession` 中接收单个 `ArrowArray` 的落盘逻辑尚未闭环，需要实现 `CreateStreamFromSingleArray` 辅助函数，将 `ArrowArray + ArrowSchema` 包装成 `ArrowArrayStream` 传给 `duckdb_arrow_scan`。
- `DuckDBResultToJson` 的类型覆盖：目前只覆盖了基础数值和字符串，`DECIMAL`、`DATE`、`TIMESTAMP`、`LIST`、`STRUCT` 需要补充或统一走 `duckdb_value_varchar` 兜底。
- `MemoryPageJson` 的多列支持：`ExtractRowsFromArray` 当前只处理单列，需要按 `schema->n_children` 遍历所有列，并支持 validity bitmap 判断 NULL。
- 请求队列的扇出语义：当前队列 key 是 `nodeId:port`，如果一个输出端口连多个下游，队列会被竞争消费。需要改为按边建队列（`fromNode:fromPort->toNode:toPort`），或明确约束“一个输出端口只连一个下游”。

### 中优先级（性能 / 可维护性）

- Scheduler 的流式改造：当前 `ExecuteSingleNode` 是全量拉取输入后才执行，`kStream` 算子退化为批处理。未来可让 `kStream` 算子边 Pop 边处理，降低内存峰值。
- `RequestQueue` 的容量调优：100 是经验值，需要根据实际数据块大小和并发度调整。
- 编译期埋点 TraceStep：已实现耗时统计，但尚未接入前端展示。可在 `Entry.cpp` 返回 JSON 报告。
- CLI 独立执行：`EtlEngine` 和 `GraphCompiler` 已与 NAPI 解耦，可以写一个 main.cpp 直接读 JSON 文件执行，验证“CLI 独立可跑”原则。

### 低优先级（体验 / 扩展性）

- Filter 合并优化：在 `GraphCompiler` 中增加一个 pass，识别连续的 Filter 节点并合并条件，减少数据扫描次数。
- DOT 图导出：在 `GraphCompiler` 编译完成后导出 Graphviz DOT 文件，便于调试 DAG 结构。
- 节点复制时的数据深拷贝：前端复制节点后，如果需要立即复用原节点的物化数据，需要在 `MaterializedStore` 中实现深拷贝（内存态 ArrowArray 复制，落盘态 `CREATE TABLE AS SELECT`）。
- `PortTransformRegistry` 的链式转换：当前只支持单层转换（`kChunk → kTable`），未来可支持多跳（`kChunk → kJson → kTable`），需要将 `ResolvePortKind` 改为 BFS 搜索。

## 七、构建与运行

```shell
# macOS
./build_mac.sh
# 麒麟
./build_kylin.sh

# 或手动
rm -rf build
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j4
```

关键 CMake 设置：
`CMAKE_CXX_STANDARD 20 + CMAKE_CXX_STANDARD_REQUIRED ON + CMAKE_CXX_EXTENSIONS OFF`
`target_compile_features(dataclean_executor PRIVATE cxx_std_20)` 强制标准，防 Apple Clang 静默降级
`third_party/duckdb/duckdb.cpp` 直接编入 target
不链接 `node-addon-api / nlohmann_json / duckdb` 的 CMake target，仅靠 include 路径和源文件
