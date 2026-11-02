# KIME / Alteryx 测试数据集 · 算子测试清单

> 场景：BMC 服务器硬件告警日志（SNMP trap / syslog / IPMI），覆盖 Alteryx 常用工具箱算子与 KIME JSON 专属算子。
> 数据量：主表 303 行 × 17 列；维表 25 行 × 11 列；补充表 50 行 × 11 列。固定随机种子 `seed=42`，可复现。
> 编码：UTF-8 with BOM，逗号分隔，Excel / Alteryx / KIME 直接打开不乱码。

---

## 一、数据集文件清单

| 文件 | 行数 | 列数 | 用途 |
|---|---|---|---|
| `bmc_alerts_main.csv` | 303 | 17 | 告警主表，绝大多数算子的测试输入 |
| `bmc_devices_dim.csv` | 25 | 11 | 设备维表，Join 连接测试 |
| `bmc_alerts_extra.csv` | 50 | 11 | 补充告警表，Union 追加合并测试（列序不同、列缺失、多一列、列名大小写不同） |
| `alerts_by_ip.json` | 8 个 IP key / 30 条告警 | — | **动态 key map**（IP → 告警数组），Unnest Object 专项测试；含 1 个空数组、缺失字段、类型不一致 |
| `alerts_flat_array.json` | 30 条告警对象 | — | **纯平铺数组**，Unnest Array / JSONPath 递归查询专项测试 |
| `generate_test_data.py` | — | — | 确定性生成脚本，改种子/参数可再生成 |
| `validate_data.py` | — | — | 回读校验脚本，输出脏数据分布报告 |
| `_validation_report.md` | — | — | 本次生成后的校验快照 |

---

## 二、主表字段字典（`bmc_alerts_main.csv`）

| # | 字段 | 业务含义 | 原始类型 | 脏数据 / 测试点 | 主要对应算子 |
|---|---|---|---|---|---|
| 1 | `alert_id` | 告警唯一编号 `ALT-20261008-0022` | 文本 | **12 个 ID 重复**（共 26 行）；另有 3 行整行重复 | Unique、Record ID、Sort |
| 2 | `event_time` | 告警发生时间 | 文本（5 种格式混用） | 5 种格式：`YYYY-MM-DD HH:MM:SS`、`YYYY/MM/DD HH:MM:SS`、`MM/DD/YYYY HH:MM`、`YYYY-MM-DDTHH:MM:SSZ`、`YYYY-MM-DD HH:MM`；**19 行缺失**（空串 / `N/A` / `-`） | DateTime、Filter、Select 类型转换、Formula |
| 3 | `device_id` | 设备编号 `SRV-019` | 文本 | 30 台设备，其中 **5 台（SRV-026~030）不在维表**，共 47 行未匹配 | Join（内/左/右/全外连接）、分组汇总 |
| 4 | `device_type` | 设备类型 | 枚举文本 | server / switch / storage / fan / psu / cpu / memory | Filter、分组、Select |
| 5 | `ip_address` | 管理 IP | 文本 | 约 5% 行首尾带空格 | String Trim、Filter、Select |
| 6 | `rack` | 机柜机位 `R13-C01` | 文本 | 约 5% 小写；可拆分为机柜号 + 机位 | Text to Columns、String |
| 7 | `severity` | 告警级别 | 枚举文本 | **大小写混用 + 半角空格 + 全角空格**：`critical` / `Critical` / `CRITICAL` / ` critical ` / `critical　`；warning、info、debug 同理（55 行非标准写法） | String Trim + Lower、Filter、条件分支、汇总分组 |
| 8 | `metric` | 监控指标 | 枚举文本 | cpu_usage / mem_usage / disk_usage / temp / fan_speed / power_voltage / link_down | 分组、Filter、Select |
| 9 | `metric_value` | 指标数值 | 文本（应为数值） | **20 行非数值占位**（`N/A` / `--` / `null`），7 行真空；少量带首尾空格字符串数字 | Select 类型转换、Formula 数值计算、Filter 空值、Imputation 填充 |
| 10 | `unit` | 单位 | 文本 | % / ℃ / RPM / V / Mbps；link_down 指标对应 Mbps | Select、分组 |
| 11 | `message` | 告警描述 | 长文本 | 含逗号、分号、`[CRITICAL]` 前缀、首尾空格；短语重复可做去重/查找替换 | String、Text to Columns、Filter Contains、Regex |
| 12 | `status` | 处理状态 | 枚举文本 | active / acknowledged / resolved / closed；**30 行非标准**（全大写或前置空格） | Filter、String、条件分支 |
| 13 | `owner` | 负责人 | 文本 | **46 行空值**，四种占位混用：空串、`N/A`、`-`、`null` | 空值填充、Filter Is Null、分组计数 |
| 14 | `region` | 机房区域 | 枚举文本 | DC-Shenzhen-A / DC-Shenzhen-B / DC-Shanghai-C / DC-Beijing-D | 分组汇总、Cross Tab、Filter |
| 15 | `retry_count` | 重试次数 | 整数（文本） | 19 行空值 / `N/A` / `-` | Select 转整数、Formula、空值处理 |
| 16 | `tags` | 分号标签串 | 文本 | 分号分隔 1~3 个标签；**36 行空或 `-`**；27 行含**空标签段**（连续 `;;` 或结尾分号） | Text to Columns、Split、String Trim、Filter |
| 17 | `raw_detail` | 内嵌 JSON 字符串 | JSON 文本 | 100% 可解析；约 18% 行缺可选字段；11 行 `used_mb` 类型不一致（数字变字符串）；字段含嵌套 `port`/`partition`/`rail` 等 | **KIME 专属：JSON Parse、JSONPath 查询、Unnest Object、Unnest Array、类型探测** |

### 主表 `raw_detail` 示例

```json
{"metric":"link_down","collected_at":"2026-10-28T09:12:24Z","source":"bmc-snmp","port":"eth5"}
{"metric":"mem_usage","collected_at":"2026-10-20T03:41:09Z","source":"bmc-snmp","used_mb":"59701"}
```

---

## 三、维表字段字典（`bmc_devices_dim.csv`）

| 字段 | 含义 | 脏数据 / 测试点 |
|---|---|---|
| `device_id` | 设备编号（Join 主键） | 25 台，与主表 `device_id` 关联 |
| `hostname` | 主机名 `host-srv-001` | 干净文本 |
| `model` | 机型 | 6 种机型枚举 |
| `vendor` | 厂商 | Huawei / Dell / HPE / Inspur / Supermicro / Lenovo |
| `firmware_version` | 固件版本 | **6 行空值** |
| `location` | 机房区域 | 与主表 `region` 可二次对照 |
| `purchase_date` | 采购日期 | **3 种格式混用**：`YYYY-MM-DD`、`YYYY/MM/DD`、`DD-MM-YYYY` |
| `warranty_end` | 保修截止日期 | 标准 `YYYY-MM-DD`，可做日期差计算 |
| `cpu_cores` | CPU 核数 | 整数枚举 8/16/24/32/48/64 |
| `memory_gb` | 内存 GB | **2 行 `N/A` 非数值** |
| `dim_status` | 设备状态 | active / spare / retired，可做 Join 后二次 Filter |

---

## 四、补充表结构差异（`bmc_alerts_extra.csv`，Union 测试专用）

与主表语义对应，但**故意打乱**，用于测试 Union 算子的字段名 / 顺序 / 类型对齐能力：

- 列名大小写不同：主表 `alert_id` ↔ 补充表 `Alert_ID`；`event_time` ↔ `EVENT_TIME`
- 列顺序完全不同
- 主表多出 9 列：`device_type`、`ip_address`、`rack`、`unit`、`owner`、`retry_count`、`tags`
- 补充表多出 1 列：`source`（syslog / snmp-trap / ipmi）

> 测试要点：Union 时按**字段名对齐**（而非列位置），缺失列自动填空，多余列保留；观察大小写不敏感匹配与未匹配列的表现。

---

## 五、算子测试用例清单

> 编号规则：`算子编号-序号`。每个用例给出：输入字段 → 配置操作 → 预期结果 → 校验点。Alteryx 算子名在后，KIME 对应算子在括号内标注。

### A. 输入与读取（Input Data / 数据源）

**A-1 基础 CSV 读取**
- 输入：`bmc_alerts_main.csv`
- 操作：选择逗号分隔、UTF-8（带 BOM）；不勾选首行作为数据
- 预期：303 行 × 17 列，`℃`、中文负责人姓名无乱码
- 校验点：首列表头为 `alert_id`；`message` 内含逗号仍被正确包围解析，字段数恒为 17

**A-2 多表同时读取**
- 输入：主表 + 维表 + 补充表
- 预期：三个数据集分别进入工作流，各自行数 303 / 25 / 50

---

### B. 字段选择与类型（Select / 选择；KIME：Select Columns）

**B-1 保留 / 删除列**
- 操作：只保留 `alert_id, event_time, device_id, severity, metric, metric_value, message, region, owner, tags, raw_detail`
- 预期：列数从 17 降到 11；其余列不进入下游

**B-2 文本 → 数值类型转换**
- 字段：`metric_value`
- 操作：Select 中将类型由 String 改为 Double；过滤前先清洗非数值占位
- 预期：合法数值列转为 Double；20 行 `N/A/--/null` 转为空或报错（观察工具的类型转换失败策略）
- 校验点：转换后可参与数值比较与聚合

**B-3 文本 → 整数类型转换**
- 字段：`retry_count` → Integer；19 行空值置空
- 校验点：空值不参与求和

**B-4 字段重命名**
- 操作：`metric_value` 重命名为 `value_num`；`event_time` 重命名为 `alarm_time`

**B-5 列位置重排**
- 操作：把 `severity` 移到 `device_id` 之后，测试 Select 的列序调整能力

---

### C. 清洗与标准化（Data Cleansing / Imputation；KIME：Cleanse / Null Fill）

**C-1 去除首尾空格（含全角空格）**
- 字段：`severity`、`status`、`ip_address`、`owner`、`message`
- 操作：Trim 前后空白；注意 `critical　` 末尾为**全角空格 U+3000**，确认工具是否一并清除
- 预期：` warning ` → `warning`，`critical　` → `critical`
- 校验点：清洗后 `severity` 只剩 4 个枚举值

**C-2 大小写标准化**
- 字段：`severity`、`status`
- 操作：统一转小写（Lowercase）
- 预期：`CRITICAL` / `Critical` / `critical` 归一为 `critical`；`CLOSED` → `closed`

**C-3 空值占位统一识别**
- 字段：`owner`、`metric_value`、`retry_count`、`event_time`
- 操作：把 `N/A`、`--`、`-`、`null` 四种占位统一替换为空（Null）
- 校验点：替换后各列空值数量与 `_validation_report.md` 一致（owner 46、retry_count 19、event_time 19、metric_value 真空 7 + 占位 20）

**C-4 空值填充（Imputation）**
- `owner`：用常量 `"未指派"` 填充空值
- `metric_value`：用该 `metric` 分组的中位数/均值填充；或按 `unit` 规则填 0
- `retry_count`：空值填 0
- 校验点：填充后下游分组不再出现 Null 组

**C-5 重复记录清洗**（配合 E 节 Unique 使用）

---

### D. 筛选（Filter / 筛选；KIME：Filter）

**D-1 单条件等值筛选**
- 条件：`severity`（清洗后）`== "critical"`
- 预期：仅 critical 级别告警

**D-2 数值范围筛选**
- 前置：`metric_value` 已转 Double
- 条件：`metric_value > 90 AND metric == "cpu_usage"`
- 校验点：空值行被排除；无 `N/A` 占位混入

**D-3 组合 AND / OR 条件**
- 条件：`(severity == "critical" OR severity == "warning") AND status != "resolved" AND region == "DC-Shanghai-C"`
- 校验点：验证多条件嵌套括号优先级；清洗前 `CLOSED` 不匹配 `closed`，先清洗再筛选

**D-4 文本包含 / 不包含（Contains）**
- 条件：`message` Contains `"temperature"` 或 Contains `"fan"`
- 反向：`message` Not Contains `"link down"`

**D-5 空值筛选**
- 条件：`owner` Is Null（C-3 统一占位后执行）
- 预期：得到未指派告警子集，可再走 C-4 填充

**D-6 枚举多值筛选（In）**
- 条件：`device_type` In [ `"server"`, `"storage"`, `"switch"` ]

**D-7 日期范围筛选**
- 前置：`event_time` 已解析为 DateTime（见 F-1）
- 条件：`alarm_time` 在 2026-10-15 00:00 至 2026-10-25 23:59 之间
- 校验点：19 行缺失时间被排除在外

**D-8 条件分支（Branch / Condition，三路分流）**
- 路由：
  - 分支 1：`severity == "critical"`
  - 分支 2：`severity == "warning"`
  - 分支 3：其余（info / debug）
- 校验点：三路输出行数之和 = 清洗后总行数；无漏行

---

### E. 去重（Unique / 唯一记录；KIME：Deduplicate）

**E-1 按键去重（Unique Key）**
- 键：`alert_id`
- 操作：保留第一条（或最后一条）
- 预期：12 个重复 ID 被收敛，输出 291 行左右（303 − 12）
- 校验点：下游按 `alert_id` 计数无重复

**E-2 整行去重**
- 键：全部列
- 预期：剔除 3 行整行重复

**E-3 组合键去重**
- 键：`device_id + metric + event_time`
- 预期：观察同一设备同一指标同一时刻的重复上报被合并

---

### F. 日期处理（Date Time / 日期时间；KIME：DateTime）

**F-1 多格式日期解析**
- 字段：`event_time`
- 操作：日期解析器同时识别 5 种格式；19 行缺失置空并标记
- 校验点：解析成功行的时分秒正确；`MM/DD/YYYY` 与 `YYYY/MM/DD` 不会互相错配（重点核对美式格式行）

**F-2 日期字段拆分**
- 操作：从解析后的时间提取 `year`、`month`、`day`、`hour`、`weekday`
- 用途：按月/按小时分组聚合

**F-3 日期差计算**
- 场景：主表 `event_time` 与维表 `warranty_end`（Join 后）计算 `days_to_expire`；或计算告警距 2026-10-31 的天数
- 校验点：空日期行结果为空，不报错

**F-4 日期格式化输出**
- 操作：统一格式化为 `YYYY-MM-DD HH:mm:ss` 文本

**F-5 维表采购日期解析**
- 字段：`purchase_date`，3 种格式混用（含 `DD-MM-YYYY`），重点测试日月顺序歧义

---

### G. 公式与派生字段（Formula / 公式；KIME：Derived Column / Formula）

**G-1 字符串拼接**
- 派生：`device_label = device_id + " [" + region + "]"`
- 示例：`SRV-019 [DC-Shenzhen-A]`

**G-2 条件分级（IF / ELSEIF / ELSE）**
- 派生 `risk_level`：
  - `severity == "critical"` → `"P1"`
  - `severity == "warning"` → `"P2"`
  - `severity == "info"` → `"P3"`
  - 其余 → `"P4"`

**G-3 数值阈值判定**
- 派生 `over_threshold`：`metric_value >= 90` 为 `true`，否则 `false`；空值为 `null`

**G-4 指标差值计算**
- 派生 `threshold_gap = 90 - metric_value`（仅 cpu_usage / mem_usage / disk_usage）

**G-5 字符串截取 / 拆分公式**
- 从 `rack` 截取机柜号：`left(rack, 3)`；机位号：`right(rack, 3)`
- 从 `ip_address` 截取第三段网段

**G-6 负责人默认值公式**
- `owner_final = if IsNull(owner) then "未指派" else owner endif`

**G-7 时间戳格式化公式**（无独立 DateTime 算子时的备选）

---

### H. 排序（Sort / 排序；KIME：Sort）

**H-1 单字段降序**
- 字段：`metric_value` 降序，查看 Top 高负载告警

**H-2 多字段混合排序**
- 主键：`severity` 自定义顺序（critical → warning → info → debug）；次键：`event_time` 降序；三键：`metric_value` 降序
- 校验点：同级别内最新告警在前

**H-3 稳定排序验证**
- 排序后检查 `alert_id` 重复行的相对顺序是否符合"保留首条"约定

---

### I. 分组汇总（Summarize / 汇总；KIME：Aggregate / Group By）

**I-1 按指标分组计数与均值**
- 分组：`metric`
- 聚合：`Count` 告警数；`Avg(metric_value)`；`Max`；`Min`；`Median`；`StdDev`
- 校验点：空值不进入均值；`link_down` 数值恒为 0

**I-2 按机房 + 级别交叉统计**
- 分组：`region, severity`
- 聚合：`Count`；`Sum(retry_count)`；`Avg(metric_value)`

**I-3 按设备聚合 Top 告警**
- 分组：`device_id`；聚合 critical 数量、平均重试次数；按 critical 数降序取 Top 10

**I-4 空值组处理**
- 观察 `owner` 未填充时分组是否出现 Null 组；与 C-4 填充后结果对比

---

### J. 连接（Join / 连接；KIME：Join）

**J-1 内连接（Inner Join）**
- 左：主表；右：维表；键：`device_id`
- 预期：仅保留 SRV-001~025 匹配成功的行；SRV-026~030 共 47 行被剔除

**J-2 左连接（Left Join）**
- 预期：主表 303 行全部保留；未匹配行的维表字段为空；可观察未匹配子集

**J-3 右连接 / 全外连接**
- 预期：右连接保留维表全部 25 台；全外连接同时暴露两侧未匹配记录

**J-4 连接后二次筛选**
- 条件：`dim_status == "active" AND warranty_end > "2027-01-01"`

**J-5 非等值连接 / 多键连接**（可选进阶）
- 键：`device_id`；附加条件 `main.region == dim.location`，观察区域不一致的记录

---

### K. 追加合并（Union / 追加；KIME：Union / Append）

**K-1 同构表 Union**
- 输入：主表 + 补充表
- 操作：按字段名对齐（忽略列位置）；缺失列填空；`Alert_ID` 与 `alert_id` 按大小写不敏感匹配
- 预期：353 行；补充表独有 `source` 列在主表行为空；主表独有列在补充表行为空

**K-2 类型对齐检查**
- 校验：`metric_value` 在两表合并后类型一致；`source` 新列默认空文本

**K-3 合并后去重**
- 追加 E-1 按键去重，观察跨表重复 `alert_id` 被收敛

---

### L. 文本分列（Text to Columns / 文本转列；KIME：Split Column）

**L-1 分号拆分标签**
- 字段：`tags`；分隔符 `;`；拆分到多列 `tag_1, tag_2, tag_3`
- 校验点：27 行含空标签段，拆分后出现空列，需配合 Trim / 空列剔除
- 36 行空或 `-` 拆分结果全空

**L-2 机柜机位拆分**
- 字段：`rack`；分隔符 `-`；拆为 `rack_row`（R13）与 `rack_slot`（C01）

**L-3 消息前缀剥离**
- `message` 中 `[CRITICAL] ` / `[WARN] ` 前缀可用分隔符 `]` 拆为前缀列与正文列

---

### M. 字符串高级处理（String / 字符串；KIME：String Functions）

**M-1 查找替换**
- 将 `message` 中重复短语 `action required` 替换为 `待处理`

**M-2 正则提取（Regex Match / Extract）**
- 从 `message` 提取端口号：`eth\d+`；提取分区路径：`/dev/[a-z0-9]+`
- 从 `ip_address` 校验 IPv4 格式

**M-3 大小写转换 / 首字母大写**
- `device_type` 首字母大写展示

**M-4 子串与长度**
- `length(message)`；`substring` 截取前 40 字符做摘要列

**M-5 去除非字母数字**
- 清洗 `message` 中的标点用于关键词统计

---

### N. 抽样与记录标识（Sample / Record ID）

**N-1 记录编号**
- 新增自增 `row_no`（1~303），验证排序前后编号稳定性

**N-2 随机抽样**
- 按 10% 比例随机抽样；固定随机种子可复现

**N-3 Top N 记录**
- 按 `metric_value` 降序取前 20 条

---

### O. 交叉表与转置（Cross Tab / Transpose）

**O-1 交叉表（Cross Tab）**
- 行：`region`；列：`severity`；值：`Count`
- 预期：4 行 × 4 级别列的告警矩阵，可直接做热力图/柱状图

**O-2 长表转宽表 / 宽表转长表（Transpose）**
- 将 `metric` 各指标值转成宽表列；再反向转回长表，验证可逆性

---

### P. KIME 专属 · JSON 处理算子（重点）

> 输入字段：`raw_detail`（内嵌 JSON 字符串）。这是 KIME 区别于 Alteryx 的核心能力区。

**P-1 JSON 解析（JSON Parse）**
- 操作：把 `raw_detail` 字符串解析为结构化 JSON 对象；自动探测顶层类型（Object）
- 校验点：303 行全部解析成功；11 行 `used_mb` 为字符串类型，类型探测应标出"类型不一致"

**P-2 JSONPath / 路径取值**
- 主表 `raw_detail` 提取：`$.metric`、`$.source`、`$.collected_at`、`$.port`、`$.partition`、`$.rail`、`$.sensor`
- `alerts_flat_array.json`：递归查询所有 `level`、提取 `[*].detail.sensor`；缺失 `detail` 的对象返回空
- 校验点：字段缺失行返回空，不抛异常；对比 KIME 可视化点选路径与手写路径结果一致

**P-3 类型探测与视图自动切换**
- 操作：解析后自动判断——顶层 Object 展示 JSON 树；若某行是数组则切换表格视图
- 校验点：缺失可选字段的行在树视图中显示空节点

**P-4 Unnest Object（对象展开，动态 key map 专用）**
- 输入：`alerts_by_ip.json`，结构 `{ "10.0.0.11": [...], "10.0.0.12": [...], ... }`，其中 `10.0.0.14` 为空数组
- 操作：一键展开为 `key`（IP）+ `value`（告警数组）两列；对应 jq `to_entries`
- 校验点：key 不丢失（这是 JMESPath `*` 做不到的点）；空数组 IP 展开后 value 为空数组，不报错
- 现状样本：8 个 IP、30 条告警；7 条缺 `source`、7 条缺 `detail`、3 条 `value` 为字符串

**P-5 Unnest Array（数组炸开）**
- 输入：接 P-4 展开后的 `value` 列；或直接用 `alerts_flat_array.json`（30 条平铺告警对象）
- 操作：数组炸开为多行；接 P-4 时每行继承外层 `key`（IP）
- 对应 jq：`to_entries | map(.key as $ip | .value[] | {ip: $ip, ...})`
- 校验点：炸开后行数 = 数组元素总数；缺失 `detail` 的行在嵌套展开时返回空节点

**P-6 JSON 条件过滤**
- 在 JSON 子节点层面筛选：`used_mb > 50000`、`sensor == "INLET"`；对比 D 节整行 Filter 的粒度差异

**P-7 JSON 派生 / 字段注入**
- 解析后新增 `json_collected_date`（从 `collected_at` 截取日期）；注入常量 `source_system = "KIME"`

**P-8 导出 jq 表达式（KIME 导出能力验证）**
- 前置：P-1 → P-2 → P-6 → P-7 链路全部分步预览通过
- 操作：一键导出等价 jq 脚本；执行导出前做结果等价校验（KIME 结果 vs WASM jq 结果）
- 校验点：链路含无法映射的算子时导出按钮置灰并给出提示；导出脚本在 jqplay 运行结果与 KIME 预览一致

---

## 六、端到端推荐流水线（一条工作流串起绝大多数算子）

```
Input(bmc_alerts_main.csv)
  → Select(保留 11 列)
  → Cleanse(Trim 全角/半角空格, severity/status 转小写, N/A/--/-/null 统一为空)
  → DateTime(解析 event_time 五格式, 提取 month/hour)
  → Formula(派生 risk_level、over_threshold、device_label)
  → Filter(severity in critical/warning AND status != resolved)
  → Left Join(bmc_devices_dim.csv ON device_id)
  → Imputation(owner 填"未指派", metric_value 按分组均值填充)
  → Text to Columns(tags 按 ; 拆分)
  → Unique(按 alert_id 去重, 保留首条)
  → Sort(severity 自定义序, event_time 降序)
  → Summarize(按 region × severity 计数/均值)
  → Cross Tab(region 行 × severity 列)
```

补充并行支路：
```
主表 → JSON Parse(raw_detail) → JSONPath 取值 → Unnest Array → JSON Filter → 导出 jq
主表 Union bmc_alerts_extra.csv → 跨表去重
```

---

## 七、脏数据坑点速查表

| 坑点 | 出现位置 | 数量（本次快照） | 正确处理顺序 |
|---|---|---|---|
| 级别大小写混用 | `severity` | 55 行非标准写法 | 先 Trim → Lower，再 Filter / 分组 |
| 状态大小写/空格 | `status` | 30 行 | 同上 |
| 四种空值占位 | `owner` | 46 行（空串 / N/A / - / null） | 先统一替换为 Null，再填充或筛选 |
| 数值列混入占位 | `metric_value` | 20 行占位 + 7 行真空 | 先清洗占位 → 再转 Double → 再计算 |
| 日期五格式混用 | `event_time` | 284 行可解析 + 19 行缺失 | 先解析 → 缺失行单独标记，再做日期筛选 |
| 美式日期歧义 | `event_time`（MM/DD/YYYY） | 59 行 | 解析器需显式指定区域格式 |
| 空标签段 | `tags` | 27 行 | 分列后 Trim + 剔除空列 |
| 重复主键 | `alert_id` | 12 个 ID / 26 行 | 清洗标准化之后再 Unique |
| 整行重复 | 全表 | 3 行 | 全列 Unique |
| Join 未匹配设备 | `device_id` | 5 台 / 47 行 | 用 Left Join 暴露，不要直接 Inner Join 后才发现丢行 |
| JSON 字段缺失 | `raw_detail` | 约 20% 行 | 路径取值容错返回空，不中断流水线 |
| JSON 类型不一致 | `raw_detail.used_mb` | 11 行（数字变字符串） | 类型探测标出，必要时显式转换 |

> 最新数量以 `_validation_report.md` 为准（重新生成后会刷新）。

---

## 八、复现与扩展

```bash
cd kime_alteryx_test_data
python3 generate_test_data.py    # 按 seed=42 重新生成三张 CSV + 两份 JSON
python3 validate_data.py         # 回读 CSV 并输出脏数据分布报告
```

- 修改 `generate_test_data.py` 顶部 `SEED` 可换一批数据；调整各 `dirty_*` 函数概率可增减脏数据比例。
- `alerts_by_ip.json` / `alerts_flat_array.json` 由同一脚本生成；如需更多动态 key、嵌套层级或大数组，扩展 `generate_json_samples()` 即可。
- 如需独立的多对象嵌套 / 数组套数组样本，可基于 `_alert_obj` 再叠加一层 `children` 字段。
