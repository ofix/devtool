#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""回读三张 CSV，量化脏数据分布、重复、未匹配、JSON 可解析性，输出校验报告。"""
import csv, json, os, re, sys
from collections import Counter

DIR = os.path.dirname(os.path.abspath(__file__))

def load(name):
    with open(os.path.join(DIR, name), encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        return rows, reader.fieldnames

main, main_cols = load("bmc_alerts_main.csv")
dim, dim_cols = load("bmc_devices_dim.csv")
extra, extra_cols = load("bmc_alerts_extra.csv")

report = []
def line(s=""):
    report.append(s)

line(f"# 数据集校验报告  (seed=42，可复现)\n")
line(f"## 1. 行数与表头")
line(f"- 主表 bmc_alerts_main.csv : {len(main)} 行，{len(main_cols)} 列")
line(f"- 维表 bmc_devices_dim.csv : {len(dim)} 行，{len(dim_cols)} 列")
line(f"- 补充表 bmc_alerts_extra.csv : {len(extra)} 行，{len(extra_cols)} 列")

# 字段数一致性
bad_main = [i for i,r in enumerate(main,2) if None in r or any(v is None for v in r.values())]
line(f"- 主表字段数异常行: {len(bad_main)}")

# 表头差异（Union 测试依据）
main_set, extra_set = set(main_cols), set(extra_cols)
line(f"\n## 2. Union 字段对齐差异（main vs extra）")
line(f"- main 独有列: {sorted(main_set - extra_set)}")
line(f"- extra 独有列: {sorted(extra_set - main_set)}")
line(f"- 列名大小写差异: {[c for c in main_set & extra_set if c != c.lower()]}")

line(f"\n## 3. 主表脏数据分布")
# severity 规范化
sev_raw = Counter(r["severity"] for r in main)
line(f"- severity 原始取值分布（含大小写/空格）: {dict(sev_raw)}")

# 空值表示
def nullish(v):
    return v.strip().lower() in ("", "n/a", "-", "--", "null")

def truly_blank(v):
    return v.strip() == ""

owner_null = sum(nullish(r["owner"]) for r in main)
retry_null = sum(nullish(r["retry_count"]) for r in main)
time_null = sum(nullish(r["event_time"]) for r in main)
line(f"- owner 空值: {owner_null} 行  (表示: 空串/N/A/-/null)")
line(f"- retry_count 空值: {retry_null} 行")
line(f"- event_time 缺失: {time_null} 行")

# metric_value 非数值（区分真空与异常占位）
def is_num(v):
    try:
        float(v); return True
    except Exception:
        return False
nonnum = [r["metric_value"] for r in main if not truly_blank(r["metric_value"]) and not is_num(r["metric_value"])]
line(f"- metric_value 非数值占位(N/A/--/null): {len(nonnum)} 行, 样本: {sorted(set(nonnum))}")
mv_null = sum(truly_blank(r["metric_value"]) for r in main)
line(f"- metric_value 真空值: {mv_null} 行")

# 日期格式混用
fmt_pat = {
    "ISO YYYY-MM-DD HH:MM:SS": r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$",
    "Slash YYYY/MM/DD HH:MM:SS": r"^\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}$",
    "US MM/DD/YYYY HH:MM": r"^\d{2}/\d{2}/\d{4} \d{2}:\d{2}$",
    "ISO8601 Z": r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$",
    "Short YYYY-MM-DD HH:MM": r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$",
}
fmt_cnt = Counter()
for r in main:
    t = r["event_time"].strip()
    if nullish(t):
        fmt_cnt["<缺失>"] += 1; continue
    hit = "其他"
    for name, pat in fmt_pat.items():
        if re.match(pat, t): hit = name; break
    fmt_cnt[hit] += 1
line(f"- event_time 格式分布:")
for k,v in fmt_cnt.items(): line(f"    · {k}: {v}")

# 重复 alert_id
id_cnt = Counter(r["alert_id"] for r in main)
dup_ids = {k:v for k,v in id_cnt.items() if v>1}
line(f"- 重复 alert_id 个数: {len(dup_ids)}, 涉及行数: {sum(v for v in dup_ids.values())}")

# 整行重复
row_cnt = Counter(tuple(r.items()) for r in main)
dup_rows = [v for v in row_cnt.values() if v>1]
line(f"- 整行重复组数: {len(dup_rows)}, 额外重复行数: {sum(v-1 for v in dup_rows)}")

# tags 空段
tags_empty = sum(r["tags"].strip()=="" or r["tags"].strip()=="-" for r in main)
tags_blankslot = sum(";;" in r["tags"] or r["tags"].endswith(";") for r in main)
line(f"- tags 为空/- : {tags_empty} 行; 含空标签段: {tags_blankslot} 行")

# raw_detail JSON 可解析
json_ok = json_bad = 0
type_mismatch = 0
for r in main:
    try:
        obj = json.loads(r["raw_detail"]); json_ok += 1
        if "used_mb" in obj and isinstance(obj["used_mb"], str): type_mismatch += 1
    except Exception:
        json_bad += 1
line(f"- raw_detail JSON 解析成功: {json_ok}, 失败: {json_bad}; 其中类型不一致(used_mb 字符串): {type_mismatch}")

# Join 未匹配
dim_ids = {r["device_id"] for r in dim}
main_ids = {r["device_id"] for r in main}
orphan = sorted(main_ids - dim_ids)
line(f"\n## 4. Join 匹配情况")
line(f"- 维表设备数: {len(dim_ids)}; 主表出现设备数: {len(main_ids)}")
line(f"- 主表中【维表不存在】的设备（左连接未匹配）: {orphan}")
line(f"- 主表中属于孤儿设备的告警行数: {sum(1 for r in main if r['device_id'] in orphan)}")

# 空值在维表
line(f"\n## 5. 维表脏数据")
line(f"- firmware_version 空: {sum(r['firmware_version'].strip()=='' for r in dim)}")
line(f"- memory_gb 非数值: {sum(nullish(r['memory_gb']) for r in dim)}")

# 写出报告
with open(os.path.join(DIR, "_validation_report.md"), "w", encoding="utf-8") as f:
    f.write("\n".join(report))
print("\n".join(report))
#（注：内容由AI生成）
