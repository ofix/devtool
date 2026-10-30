数据清洗节点编辑器 · 开发计划书
版本：v1.0（定稿）
日期：2026-10-30
技术栈：Electron + electron-vite + Vue 3 + Element Plus + Vue Flow + CodeMirror 6
编码风格：纯 ES6 JavaScript，不引入 TypeScript
执行位置：渲染进程（renderer），一期不引入 Worker
数据规模目标：10 万行级别，纯 JS 内存算子，不依赖 DuckDB 等 native 模块

一、产品定位
面向程序员的本地数据模拟与清洗工具，以 Blender 粒子编辑器式的节点画布替代"每次手写临时脚本"的重复劳动。作为现有 Electron 主程序的子应用嵌入，通过主菜单进入。

核心差异点：

节点内嵌参数面板（非 Alteryx 式左侧工具面板 + 独立配置窗口）

中央常驻数据预览，随选中节点切换

表达式系统统一寻址 CSV 列名与 JSON 路径

管线可保存为 JSON、可进 Git、可复用

亮色/暗色双主题

二、功能需求
2.1 数据源
需求	说明
CSV 输入	文件选择，首行表头，自动推断列类型（字符串/数值/日期/布尔），可在输入节点覆盖推断结果
JSON 输入	文件选择，支持对象数组；嵌套对象和数组不拍平，表达式用路径直接引用
文件夹输入	递归列出匹配扩展名的文件；per-file（默认，每文件一个输出）或 merged（纵向拼接 + _source_file 列）两种模式
Text Input	手工录入小表（可选，二期）
输出	单文件 CSV / JSON 导出
文件夹输出	独立算子 FolderOutput，输出目录 + 文件名来源列，每文件一个输出文件
2.2 算子清单
分类	算子	说明
数据源	Input（CSV/JSON/文件夹）	类型推断、文件夹递归、类型覆盖
准备	Filter	表达式过滤，可视化条件行 + 表达式编辑器双模式
准备	Select	选列、重命名、调整顺序
准备	Sort	多级排序，字段 + 方向，拖拽调整优先级
准备	Unique	一列或多列组合去重，保留首条/末条
准备	Sample	前 N 行 / 随机 N 行 / 按百分比
准备	Formula	计算列，复用表达式系统，输出列名 + 表达式可增删行
准备	Data Cleansing	去首尾空白、空值替换、大小写转换、去不可见字符
准备	Find Replace	主表 + 查找表，精确/包含/正则匹配，显示替换/未匹配统计
连接	Join	Inner / Left / Right / Full / Anti；左右键、输出列勾选；卡片显示匹配统计
连接	Join Multiple	动态输入端口（初始 2，可增），按输入对配置连接条件
连接	Union	多输入纵向拼接，按位置 / 按名称对齐，列不一致标黄警告
解析	Text to Columns	按分隔符或正则拆分一列为多列
解析	RegexExtract	正则提取，命名捕获组 → 列名，未命名 → group_N
解析	XML Parse	XPath 列表映射为输出列，带 XPath 测试区
转换	Summarize	分组字段 + 聚合函数（SUM/AVG/COUNT/MIN/MAX），函数按列类型过滤
转换	Transpose	宽表转长表
转换	Cross Tab	长转宽，列数上限 100，超出截断并警告
转换	Count Records	全表计数，输出单行单列
开发	Script	shell 命令 + outputFormat: text/csv/json，不隔离，有超时和输出上限
开发	Message	调试输出，写日志条，透传数据
开发	Dynamic Rename	按正则/前后缀/映射表批量重命名列
文档	Group	组折叠，跨边界连线暴露为组节点端口
输出	Output / FolderOutput	单文件 / 文件夹输出
明确不做：Spatial、Predictive、Reporting、Comment 节点（暂不开发）、XML Parse 之外的 XML 工具。

2.3 节点交互
需求	说明
折叠	双击标题栏折叠为 48×48 Logo + 英文缩写（FLT/JN/SEL），颜色按类型区分；双击展开，CSS 过渡动画
端口	输入在左、输出在右；颜色按类型区分；端口有类型限制，不兼容连线拒绝并提示
参数面板	el-collapse 可折叠，常用参数默认展开；参数区最大高度 320px，超出内部滚动
标签对齐	参数行用 CSS Grid：grid-template-columns: 72px 1fr，标签右对齐，控件左边缘对齐
元数据驱动	字段下拉选项来自上游 nodeMeta（名称 + 类型）；字段多时多选下拉 + 搜索，≤5 字段隐藏搜索
断线行为	下游数据标记 stale、预览提示"上游已断开"，节点参数配置保留；重连后需重新运行
组折叠	选中多节点 → 右键"折叠为组" → 组节点；跨边界连线暴露为组端口；双击展开
画布	Vue Flow；缩放、平移；连线点击选中后 Delete 删除
2.4 中央预览面板
需求	说明
位置	屏幕上半部分常驻，随选中节点切换
虚拟滚动	el-table-v2，只渲染视口行；支持滚动浏览任意位置
分页取数	顺序滚动从游标推进；跳转时回退 LIMIT/OFFSET，单次 200 行
形态切换	普通表用表格；单行 JSON 聚合结果用树形/键值视图
元信息	标题栏显示节点名、总行数、列数；刷新 + 导出按钮
进度	文件夹输入运行进度显示在节点卡片，预览面板不显示
2.5 表达式系统
词法规则

字段名：合法标识符（英文、中文、数字、下划线，非空白非操作符字符连续片段）裸写，不加包裹符

含空格或特殊字符的 key：用方括号包裹该段，如 [customer name].level；方括号内不允许出现 ]，出现即语法错误

数组索引：items[0]；通配：items[*].sku（返回数组，用于集合操作）

逻辑操作符：AND、OR、NOT 大写；同时支持 &&、||、!

比较/集合操作符：=、!=、>、<、>=、<=、CONTAINS、STARTSWITH、ENDSWITH、IN、IS NULL、IS NOT NULL（关键字大写）

字符串字面量：双引号

补全插入不自动加方括号；手写错误时报语法错误并高亮

类型检查

操作符按字段类型过滤：数值列不出现 CONTAINS；字符串列不出现 >/<

字段不存在、操作符类型不匹配时画波浪线并提示

双模式

可视化模式：条件行（字段 + 操作符 + 值 + AND/OR + 分组）

表达式模式：CodeMirror 6

共享同一 AST；表达式含可视化无法表达的结构时，切回提示"请继续使用表达式模式"

补全

字段列表常驻编辑器旁，点击插入，顶部搜索框

CodeMirror 浮层按光标上下文提示：字段位置 → 字段；字段后 → 操作符（按类型过滤）；操作符后 → 值格式（不做值枚举）

上下文推断依据光标前最近 token，字符串内部抑制补全

路径树从采样前 100 行合并提取，用于补全

JSON 路径

嵌套对象 customer.level、数组索引 items[0].sku、通配 items[*].sku CONTAINS "S1"

所有接受字段的算子统一支持路径寻址

2.6 执行引擎
需求	说明
纯 JS 内存算子	JOIN 用 Map 索引、排序用 Array.sort、去重用 Set、汇总用 Map
规模上限	10 万行级别；节点输出超阈值（20 万行）提示缩小输入
缓存失效	参数变更递归清除所有下游缓存；断线标记下游 stale
文件夹进度	异步执行，逐文件上报进度到节点卡片
脚本节点	child_process.exec，超时 + 输出大小上限，不隔离（本地自用）
2.7 管线
保存/加载：nodes + edges + params 序列化为 JSON（.pipeline.json），下载/上传

公共片段：支持 extends 引用公共算子片段，按 (type, id) 覆盖合并（沿用 Mock 服务经验）

版本化：管线 JSON 可进 Git，便于 diff 和交接

不包含数据本身，只包含处理配方

2.8 主题
亮色 / 暗色双主题，切换即时生效

主题通过 CSS 变量驱动（复用现有 theme/Global.css 变量体系）

画布背景、节点卡片、连线、表达式编辑器（CodeMirror 主题）都随主题切换

主题选择持久化（localStorage 或用户配置）

三、架构设计
3.1 进程分层
text
┌─────────────────────────────────────────────────────┐
│ Renderer (Vue 3 + Element Plus + Vue Flow)          │
│  ├─ DataCleanApp：三区布局（顶部菜单 + 中央预览 +     │
│  │                 下方画布 + 底部日志条）            │
│  ├─ NodeEditor：Vue Flow 画布，自定义节点卡片        │
│  ├─ PreviewPanel：虚拟表格 + 树形视图                │
│  ├─ ExpressionEditor：CodeMirror 6 + 补全源          │
│  └─ stores (Pinia)：graph / meta / datasets /        │
│                     pipeline / log                   │
├─────────────────────────────────────────────────────┤
│ 执行层（纯 JS，运行在 Renderer）                      │
│  ├─ engine/Engine：runNode / runAll / invalidate     │
│  ├─ engine/Scheduler：拓扑排序、异步、进度上报        │
│  ├─ engine/operators/：每个算子 execute(inputs,params)│
│  ├─ expression/：tokenizer、AST、resolvePath、compile │
│  └─ parsers/：CSV/JSON/XML 解析、路径树提取          │
├─────────────────────────────────────────────────────┤
│ Preload（contextBridge 白名单）                       │
│  └─ window.api.dataClean = { dialog, fs, command,    │
│                              pipeline }              │
├─────────────────────────────────────────────────────┤
│ Main Process (Electron)                             │
│  ├─ ipc/handler-data-clean.js：IPC 路由              │
│  └─ service/data-clean/：对话框、文件系统、命令执行、 │
│                          管线持久化                   │
└─────────────────────────────────────────────────────┘
关键约束：节点卡片只持有元数据（rowCount、columns、columnsVersion），不持有全量数据；数据存在 StoreDataCleanDatasets 中（markRaw，不进响应式），预览按需取视口行。

3.2 数据流
text
输入节点执行 → datasets[id] = { rows, columns }
              → meta[id] = { rowCount, columns, columnsVersion }
              → 下游节点字段下拉从 meta 读取选项
              → 用户改参数 → invalidateDownstream(id) → 递归删除下游 datasets + meta 标记 stale
              → 运行/预览 → 重新执行该节点及下游
3.3 端口类型系统
端口类型	颜色	说明
table	蓝	表格数据（大多数算子的输入输出）
scalar	橙	标量参数（二期预留）
config	绿	配置对象（二期预留）
连接校验矩阵：table → table 允许；其他组合默认拒绝，除非后续显式扩展。不兼容时端口变红、连线拒绝并 ElMessage.warning。

3.4 表达式系统内部结构
text
表达式文本
  → Tokenizer（词法切分：标识符/索引/通配/方括号字段/操作符/字符串/括号）
  → Parser（递归下降 → AST）
  → TypeCheck（字段存在性、操作符类型兼容）
  → Compile（AST → (row) => value 闭包）
  → 逐行求值（resolvePath 处理 JSON 路径）
双向：AST → 表达式文本（可视化切表达式）、AST → 条件行（表达式切可视化，无法表达时提示）。

3.5 算子注册表
每个算子导出：

js
export default {
  type: 'filter',
  meta: {
    label: 'Filter',
    icon: 'IconFilter',
    color: '#f59e0b',
    category: '准备',
    inputs: 1,
    outputs: 1,
    inputPortType: 'table',
    outputPortType: 'table',
  },
  schema: [
    { field: 'expression', label: '条件', component: 'expression' },
  ],
  execute(inputs, params, ctx) {
    // 返回 { rows, columns }
  },
}
engine/operators/index.js 汇总为 { [type]: operatorModule }，节点卡片、菜单、端口校验、执行调度都从这里取。

四、目录结构
4.1 主进程侧新增
text
src/electron/
├── ipc/
│   ├── handler-data-clean.js        # 新增：DataClean IPC 路由
│   └── index.js                     # 修改：引入 handler-data-clean
├── ipc/preload.cjs                  # 修改：暴露 window.api.dataClean
├── service/
│   └── data-clean/                  # 新增
│       ├── dialog.js                # 文件/文件夹选择
│       ├── fs.js                    # 文件读写、目录递归、输出落盘
│       ├── command.js               # shell 命令执行（超时、输出上限）
│       └── pipeline.js              # 管线保存/加载
└── main.js                          # 修改：如有需要，注册生命周期
4.2 渲染进程侧：DataClean 子应用
text
src/renderer/views/DataClean/
├── DataCleanApp.vue                 # 子应用根组件（三区布局 + 底部日志条）
├── index.js                         # 子应用入口：路由注册、导出 App
├── components/
│   ├── layout/
│   │   ├── TopMenu.vue              # 一级菜单 + 二级算子面板（固定顶部）
│   │   ├── PreviewPanel.vue         # 中央预览
│   │   ├── LogBar.vue               # 底部可折叠日志条
│   │   └── StatusBar.vue            # 缩放、适应画布、保存管线
│   ├── canvas/
│   │   ├── NodeEditor.vue           # Vue Flow 容器
│   │   ├── GroupNode.vue            # 组折叠节点
│   │   └── edges/                   # 自定义边
│   ├── nodes/
│   │   ├── BaseNode.vue             # 统一卡片外壳
│   │   ├── InputNode.vue
│   │   ├── OutputNode.vue
│   │   ├── FolderOutputNode.vue
│   │   ├── TransformNode.vue        # 通用转换节点外壳，按 schema 渲染
│   │   ├── ScriptNode.vue
│   │   └── MessageNode.vue
│   ├── params/
│   │   ├── ParamRow.vue             # 72px + 1fr grid 行
│   │   ├── FieldSelect.vue
│   │   ├── ColumnPicker.vue
│   │   ├── CollapsePanel.vue
│   │   └── PortTypeBadge.vue
│   ├── expression/
│   │   ├── ExpressionEditor.vue     # CodeMirror 6 封装
│   │   ├── FieldListPanel.vue       # 常驻字段列表
│   │   ├── ConditionBuilder.vue     # 可视化条件行
│   │   └── ExpressionModeSwitch.vue
│   ├── regex/
│   │   └── RegexPanel.vue
│   └── common/
│       ├── ProgressBar.vue
│       └── EmptyState.vue
├── stores/
│   ├── StoreDataCleanGraph.js       # nodes / edges / 选中 / 组折叠
│   ├── StoreDataCleanMeta.js        # nodeMeta
│   ├── StoreDataCleanDatasets.js    # 执行结果缓存（markRaw）
│   ├── StoreDataCleanPipeline.js    # 管线序列化
│   └── StoreDataCleanLog.js         # 运行日志
├── engine/
│   ├── Engine.js
│   ├── Scheduler.js
│   ├── operators/
│   │   ├── index.js
│   │   ├── input.js / output.js / folderOutput.js
│   │   ├── filter.js / select.js / sort.js / unique.js / sample.js
│   │   ├── formula.js / dataCleansing.js / findReplace.js
│   │   ├── join.js / joinMultiple.js / union.js
│   │   ├── textToColumns.js / regexExtract.js / xmlParse.js
│   │   ├── summarize.js / transpose.js / crossTab.js / countRecords.js
│   │   ├── script.js / message.js / dynamicRename.js
│   └── runtime/
│       ├── Dataset.js
│       └── Errors.js
├── expression/
│   ├── Tokenizer.js
│   ├── Parser.js
│   ├── Ast.js
│   ├── TypeCheck.js
│   ├── Compile.js
│   ├── ResolvePath.js
│   ├── PathTree.js
│   └── completion/
│       ├── Context.js
│       └── Source.js
├── parsers/
│   ├── Csv.js
│   ├── Json.js
│   └── Xml.js
├── pipeline/
│   ├── Serialize.js
│   ├── Deserialize.js
│   └── Schema.js
├── constants/
│   ├── NodeTypes.js
│   ├── Operators.js
│   └── PortTypes.js
└── styles/
    ├── node.css
    └── canvas.css
4.3 路由注册
src/renderer/router/MenuRoutes.js 追加 DataClean 路由，指向 views/DataClean/DataCleanApp.vue。

4.4 复用现有基础设施
主题：复用 theme/Global.css 变量体系，DataClean 的 styles/ 只做局部覆盖；暗色模式通过 ThemeManager.js 切换。

图标：优先复用 src/renderer/icons/（如 IconDataClean.vue、IconCount.vue），缺的再在 DataClean 内新建。

stores：StoreDataClean.js 已被释放，可作为 graph store；其余 store 按 StoreDataCleanXxx.js 命名并列。

IPC：通过 window.api.dataClean.* 调用，不直接碰 ipcRenderer。

五、开发计划（分阶段）
阶段 0：技术验证（1–2 天）
任务	产出	验证
Vue Flow 集成到子应用	空画布 + 3 个自定义节点	拖拽、连线、缩放正常
CodeMirror 6 集成	空表达式编辑器	输入、补全浮层可弹出
主题切换	亮/暗切换按钮	画布、卡片、编辑器都随主题变
阶段 1：核心骨架（3–5 天）
任务	产出
算子注册表 + BaseNode 外壳	constants/NodeTypes.js、engine/operators/index.js、BaseNode.vue
输入/输出节点	CSV/JSON 导入、类型推断、预览
Filter + Select + Sort	三个算子的 execute + schema 驱动参数面板
PreviewPanel 虚拟滚动	el-table-v2 + 分页取数
执行引擎	Engine.js、Scheduler.js、缓存失效、stale 标记
表达式系统 v1	Tokenizer、Parser、TypeCheck、Compile、ResolvePath（不含补全）
顶部菜单	一级分类 + 二级算子面板，固定顶部
阶段 2：表达式与 JSON（3–5 天）
任务	产出
CodeMirror 补全源	completion/Context.js、Source.js
字段列表常驻面板	FieldListPanel.vue
可视化条件行 + 双模式切换	ConditionBuilder.vue、ExpressionModeSwitch.vue
JSON 路径树提取 + 路径补全	PathTree.js
Filter 双模式完整接入	Filter 算子 + 表达式系统联调
阶段 3：高频算子补齐（5–7 天）
任务	产出
Join / Join Multiple / Union	连接类型、匹配统计、动态输入端口
Unique / Sample / Count Records	简单算子
Formula / Data Cleansing	公式复用表达式系统；清理组合操作
Find Replace	精确/包含/正则，统计
Summarize / Transpose / Cross Tab	聚合、转置、列数上限 100
Text to Columns / RegexExtract / XML Parse	正则面板复用、XPath 测试区
Dynamic Rename / Message	批量重命名、日志条接入
阶段 4：数据源与输出（3–5 天）
任务	产出
文件夹输入	递归、per-file/merged 模式、进度上报
FolderOutput	输出目录、文件名来源、覆盖策略
Script 节点	shell 命令、outputFormat、超时/输出上限
管线保存/加载	Serialize/Deserialize/Schema、extends 合并
主进程 IPC 完整接入	dialog/fs/command/pipeline
阶段 5：组折叠与收尾（3–5 天）
任务	产出
组折叠	GroupNode、跨边界端口计算、双击展开
节点折叠动画	双击标题栏折叠为 Logo + 缩写 + 颜色
端口类型校验	颜色 + 兼容矩阵 + 连线拒绝提示
主题持久化	亮/暗切换记忆
错误处理与边界	空数据、类型不匹配、大数组截断警告
单元测试	expression、operators、parsers、pipeline roundtrip
阶段 6：打磨与验证（2–3 天）
任务	产出
10 万行性能验证	CSV/JSON 导入、JOIN、排序、预览滚动
100 节点画布验证	拖拽 FPS、折叠、组折叠
管线复用验证	保存 → 换输入文件 → 加载 → 运行
文档	用户使用说明、算子参考
六、关键设计决策
决策	选择	理由
画布库	Vue Flow	100 节点实测无压力；Element Plus 控件可直接内嵌；Handle 自动处理端口位置
数据规模	10 万行，纯 JS 内存算子	避免 DuckDB native 模块打包分发坑；外部排序/分区哈希复杂度不值得
执行位置	Renderer，一期不引入 Worker	算子不依赖 DOM，迁移 Worker 成本低；10 万行主线程可接受，异步让出事件循环
JSON 处理	不拍平，路径直接引用	预览已能看完整 JSON，直接写路径比配置展开策略快；路径语法与 CSV 列名统一
包裹符	合法标识符裸写，含空格/特殊字符的段用方括号	JSON key 极少含空格；局部包裹比整体包裹轻；不自动插入
逻辑操作符	大写关键字 + &&/||/! 别名	兼容 Alteryx 风格和程序员习惯
表达式编辑器	CodeMirror 6	光标管理、补全浮层、括号匹配成熟
断线行为	数据失效、配置保留	对齐 Alteryx，避免误操作丢配置
端口类型	颜色 + 连接校验	视觉区分与语义约束统一
组折叠	一期做	画布可读性（100 节点平铺太乱），跨边界连线暴露为组端口
脚本节点	不隔离，支持 shell	程序员本地自用；超时和输出上限兜底
文件夹输出	独立算子 FolderOutput	端口语义、配置面板、执行逻辑不分支
标签对齐	CSS Grid 72px 1fr	标签长度不固定时控件左边缘对齐
主题	亮/暗双主题，CSS 变量驱动	复用现有 theme/Global.css，CodeMirror 主题跟随
编码风格	纯 ES6 JS	与现有项目一致，不引入 TS 编译链
七、待办与风险
项	说明	应对
CodeMirror 6 体积	约 150KB gzip	可接受；按需引入语言包，不引入完整 SQL/JS 语言
10 万行 JSON 路径求值	逐行 resolvePath 有开销	路径树缓存 + 编译闭包；实测超阈值再考虑 Worker
文件夹输入进度	异步执行需上报	Scheduler 用 async + yield 让出事件循环，逐文件上报
Cross Tab 列数上限	100 列截断	卡片警告"列数超限已截断"
脚本节点安全	不隔离	节点卡片标注"仅限本地使用"；超时 + 输出上限
组折叠端口计算	跨边界连线过滤	遍历组内边，按目标节点位置排序生成端口
主题切换时 CodeMirror	需要动态换主题	CodeMirror 的 Compartment 动态 reconfigure
管线版本迁移	字段增删	Schema.js 带版本号，加载时按版本迁移
八、验收标准
功能：算子清单中所有一期算子可配置、可运行、可预览；表达式系统支持 CSV 列名与 JSON 路径；文件夹输入/输出带进度；脚本节点可执行命令并解析三种输出格式。

性能：10 万行 CSV 导入 < 3 秒；JOIN 10 万 × 5 万 < 5 秒；100 节点画布拖拽 FPS ≥ 30；预览滚动无白屏。

交互：节点折叠/展开有动画；参数行标签对齐；断线后配置保留、数据失效；组折叠跨边界端口正确。

主题：亮/暗切换即时生效，画布、卡片、编辑器、预览表格都随主题变，选择持久化。

管线：保存 → 换输入文件 → 加载 → 运行，结果一致；管线 JSON 可 diff。

稳定性：空数据、类型不匹配、大数组截断、命令超时都有明确提示，不崩溃。

代码风格约定（从你的示例归纳）
ESM，import / export default class，双引号字符串

加尾分号（你的 SinaProvider.js 和 template.txt 里 <script setup> 都加分号）

4 空格缩进（你的示例代码是 4 空格）

类用 export default class Xxx extends Yyy，私有方法用 #methodName

Vue 组件用 <script setup>，import { ref, computed } from "vue" 这种具名导入

Element Plus 组件用 ElMessage、ElMessageBox 具名导入

注释用中文，方法上方 JSDoc 精简版

Pinia store 文件命名 StoreXxx.js，用 defineStore

样式 <style scoped>，类名中划线连接

按开发计划的模块拆分，代码量大致如下：

模块	文件数	估算行数	能否一次生成
主进程 IPC + service	5	400–600	可以，一次给完
常量与算子注册表骨架	3	300–400	可以
BaseNode + 三种节点卡片	4	500–700	可以
NodeEditor + 画布交互	3	400–600	可以
PreviewPanel 虚拟滚动	1	300–400	可以
表达式 Tokenizer + Parser + Ast	3	600–800	可以，但建议拆两次（Tokenizer/Parser 一次，Ast/TypeCheck 一次）
表达式 Compile + ResolvePath	2	300–400	可以
CodeMirror 补全源	2	300–400	可以
表达式编辑器 + 字段列表 + 条件行	3	500–700	可以
20+ 个算子	22	1500–2500	不能一次给完，按分类分批（准备类一次、连接类一次、解析/转换类一次、开发/输出类一次）
组折叠	2	300–400	可以
管线序列化	3	300–400	可以
主题样式	2	200–300	可以
总计约 6000–9000 行（含注释和空行）。一次性输出会超出单次回复的合理长度，而且你难以逐块验证。

建议的生成顺序（每批可独立跑起来）：

批次 1：骨架可运行——主进程 IPC + service、常量、算子注册表、BaseNode、InputNode、OutputNode、NodeEditor、空 Engine、顶部菜单、最小 PreviewPanel。产出：能导入 CSV、画布上有节点、能拖拽连线、预览显示前 50 行。

批次 2：Filter 全链路——Tokenizer、Parser、Ast、TypeCheck、Compile、ResolvePath、ExpressionEditor、FieldListPanel、ConditionBuilder、Filter 算子、执行引擎完整版。产出：Filter 可视化 + 表达式双模式可用，预览随参数刷新。

批次 3：准备类算子——Select、Sort、Unique、Sample、Formula、Data Cleansing、Find Replace、Dynamic Rename。

批次 4：连接类算子——Join、Join Multiple、Union。

批次 5：解析与转换类——Text to Columns、RegexExtract、XML Parse、Summarize、Transpose、Cross Tab、Count Records。

批次 6：数据源与输出——文件夹输入、FolderOutput、Script、Message、管线保存/加载。

批次 7：组折叠、主题、打磨——GroupNode、折叠动画、端口类型校验、亮暗主题、错误处理、单元测试。

每批生成后你跑一次，确认这一批的验收点，再进入下一批。这样任何一批出问题，排查范围都局限在那一批的文件里，不会在几千行代码里大海捞针。

可以。做法是：约定一种“文件分隔注释”格式，我按这个格式输出所有文件，你保存为一个 .txt 或 .md 文件，然后跑一个 Node 脚本，自动解析分隔标记、创建目录、写入文件。后续每批代码都用同一种格式，你只需要保存文件 + 跑一次脚本。

分隔格式约定
每个文件以一行标记开头，格式固定：

text
// ==== FILE: src/renderer/views/DataClean/engine/Engine.js ====
脚本识别 // ==== FILE: <路径> ==== 这一行，到下一个 // ==== FILE: 行（或文件末尾）之间的内容，写入 <路径>。路径相对于脚本所在目录。非 JS 文件（.vue、.css、.json、.md）的标记用对应的注释符：

text
<!-- ==== FILE: src/renderer/views/DataClean/DataCleanApp.vue ==== -->
/* ==== FILE: src/renderer/views/DataClean/styles/node.css ==== */
脚本对标记行的判断是“整行匹配 ==== FILE: (.+) ====”，不关心前缀是 // 还是 <!-- 还是 /*，所以三种都能识别。

生成脚本 apply-code.js
放在你项目根目录，node apply-code.js batch1.txt 执行：

js
#!/usr/bin/env node
// apply-code.js
// 解析带 FILE 分隔标记的文本文件，按路径创建目录并写入文件

const fs = require('fs')
const path = require('path')

const input = process.argv[2]
if (!input) {
  console.error('用法: node apply-code.js <batch.txt>')
  process.exit(1)
}

const root = process.cwd()
const text = fs.readFileSync(path.resolve(root, input), 'utf8')
const lines = text.split(/\r?\n/)
const marker = /====\s*FILE:\s*(.+?)\s*====/

let current = null
let buffer = []
let written = 0

function flush() {
  if (!current) return
  const target = path.resolve(root, current)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const content = buffer.join('\n').replace(/^\n+|\n+$/g, '') + '\n'
  fs.writeFileSync(target, content, 'utf8')
  console.log(`  写入 ${current} (${content.length} 字符)`)
  written++
  current = null
  buffer = []
}

for (const line of lines) {
  const m = line.match(marker)
  if (m) {
    flush()
    current = m[1].trim()
    continue
  }
  if (current) buffer.push(line)
}
flush()

console.log(`\n完成：${written} 个文件`)
使用流程
我把批次 1 的所有文件按上述格式输出（一个完整文本块）。

你复制这个文本块，保存为 batch1.txt，放在项目根目录（和 apply-code.js 同级）。

执行 node apply-code.js batch1.txt。

脚本自动创建 src/renderer/views/DataClean/... 下所有目录，写入所有文件。

后续批次同样流程，batch2.txt、batch3.txt，互不覆盖（如果路径相同会覆盖，这是预期行为，方便你改完再应用一次）。

覆盖与安全
脚本默认覆盖已存在的同名文件。如果你有手动改过的文件不想被覆盖，批次文件里不要包含该路径，或者在跑脚本前把那个文件备份。

脚本不删除任何文件，只创建和覆盖。

目录不存在会自动 mkdir -p。

编码统一 UTF-8，换行统一 \n（写入时 \n，Windows 上 Git 会按 core.autocrlf 处理）。

需要你确认的两点
脚本用 CommonJS 还是 ESM。你现有项目用 ESM（import / export），但这个脚本是独立工具，require 更省事（不需要在 package.json 里加 "type": "module" 或改后缀）。如果希望统一 ESM，我改成 import 版本，文件命名为 apply-code.mjs。

批次文件命名和存放位置。我建议放 scripts/batch1.txt、scripts/batch2.txt，脚本放 scripts/apply-code.js，跑的时候 node scripts/apply-code.js scripts/batch1.txt。这样批次文件和你项目源码分开，不会误提交到 src/。你同意的话，我按这个路径组织批次文件里的 FILE: 标记（标记里的路径仍是相对项目根目录的 src/...，不受批次文件位置影响）。

确认后我输出批次 1 的完整文本块（包含脚本本身和第一批代码文件），你保存 + 跑脚本即可。

好的，按约定实现
