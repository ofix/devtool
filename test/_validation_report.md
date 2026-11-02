# 数据集校验报告  (seed=42，可复现)

## 1. 行数与表头
- 主表 bmc_alerts_main.csv : 303 行，17 列
- 维表 bmc_devices_dim.csv : 25 行，11 列
- 补充表 bmc_alerts_extra.csv : 50 行，11 列
- 主表字段数异常行: 0

## 2. Union 字段对齐差异（main vs extra）
- main 独有列: ['alert_id', 'device_type', 'event_time', 'ip_address', 'owner', 'rack', 'retry_count', 'tags', 'unit']
- extra 独有列: ['Alert_ID', 'EVENT_TIME', 'source']
- 列名大小写差异: []

## 3. 主表脏数据分布
- severity 原始取值分布（含大小写/空格）: {'warning': 102, 'info': 61, 'critical': 63, ' warning ': 9, 'debug': 22, 'WARNING': 3, 'Critical': 5, 'critical\u3000': 2, 'DEBUG': 4, 'warning\u3000': 4, 'Warning': 6, 'INFO': 8, ' critical ': 7, 'Info': 1, 'CRITICAL': 4, 'debug\u3000': 1, 'Debug': 1}
- owner 空值: 46 行  (表示: 空串/N/A/-/null)
- retry_count 空值: 19 行
- event_time 缺失: 19 行
- metric_value 非数值占位(N/A/--/null): 20 行, 样本: ['--', 'N/A', 'null']
- metric_value 真空值: 7 行
- event_time 格式分布:
    · US MM/DD/YYYY HH:MM: 59
    · <缺失>: 19
    · Slash YYYY/MM/DD HH:MM:SS: 41
    · ISO8601 Z: 64
    · Short YYYY-MM-DD HH:MM: 63
    · ISO YYYY-MM-DD HH:MM:SS: 57
- 重复 alert_id 个数: 12, 涉及行数: 26
- 整行重复组数: 3, 额外重复行数: 3
- tags 为空/- : 36 行; 含空标签段: 27 行
- raw_detail JSON 解析成功: 303, 失败: 0; 其中类型不一致(used_mb 字符串): 11

## 4. Join 匹配情况
- 维表设备数: 25; 主表出现设备数: 30
- 主表中【维表不存在】的设备（左连接未匹配）: ['SRV-026', 'SRV-027', 'SRV-028', 'SRV-029', 'SRV-030']
- 主表中属于孤儿设备的告警行数: 47

## 5. 维表脏数据
- firmware_version 空: 6
- memory_gb 非数值: 2