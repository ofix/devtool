#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KIME / Alteryx 测试数据集生成脚本
固定随机种子，可复现。产出三张 CSV（UTF-8 BOM，Excel/Alteryx 直接打开不乱码）：
  1. bmc_alerts_main.csv     300 行  告警主表（含脏数据、重复行、未匹配设备）
  2. bmc_devices_dim.csv      30 行  设备维表（Join 用）
  3. bmc_alerts_extra.csv     50 行  补充告警表（Union 用，列序不同/列缺失/多列）

算子覆盖范围见同目录 README_算子测试清单.md
"""

import csv
import json
import os
import random
from datetime import datetime, timedelta

SEED = 42
random.seed(SEED)

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

# ----------------------------------------------------------------------------
# 基础词库
# ----------------------------------------------------------------------------
DEVICE_TYPES = ["server", "switch", "storage", "fan", "psu", "cpu", "memory"]

METRICS = {
    "cpu_usage":     {"unit": "%",    "range": (15, 99),  "type": "float"},
    "mem_usage":     {"unit": "%",    "range": (20, 98),  "type": "float"},
    "disk_usage":    {"unit": "%",    "range": (35, 97),  "type": "float"},
    "temp":          {"unit": "℃",    "range": (35, 92),  "type": "float"},
    "fan_speed":     {"unit": "RPM",  "range": (800, 5200), "type": "int"},
    "power_voltage": {"unit": "V",    "range": (11.5, 13.2), "type": "float"},
    "link_down":     {"unit": "Mbps", "range": (0, 0),    "type": "int"},
}

MESSAGES = {
    "cpu_usage": [
        "CPU usage exceeds threshold",
        "CPU core {core} temperature high, utilization {val}%",
        "Scheduler delay detected, load average high",
        "cpu throttle triggered by thermal protection",
    ],
    "mem_usage": [
        "Memory usage above 90%, swap pressure high",
        "Out-of-memory killer invoked process {pid}",
        "Memory leak suspected on service {svc}",
        "Page fault rate elevated",
    ],
    "disk_usage": [
        "Disk partition {part} usage above threshold",
        "IO wait on mount point {part}, latency {ms}ms",
        "Filesystem {part} nearly full, inode warning",
    ],
    "temp": [
        "Sensor {sensor} reading {val}℃ above threshold 85℃",
        "Intake air temperature high, check cooling",
        "Motherboard thermal zone overheated",
    ],
    "fan_speed": [
        "Fan {fan} speed below expected {rpm} RPM",
        "Fan RPM abnormal, bearing noise reported",
        "PSU fan stalled, redundant fan active",
    ],
    "power_voltage": [
        "Voltage rail {rail} unstable: {val}V",
        "PSU {psu} input voltage deviation detected",
        "Battery backup voltage low",
    ],
    "link_down": [
        "Port {port} link down, negotiated 0 Mbps",
        "Ethernet link lost on {port}",
        "Fiber module signal loss",
    ],
}

STATUS_POOL = ["active", "acknowledged", "resolved", "closed"]
OWNER_POOL = ["张伟", "李娜", "王强", "刘洋", "陈静", "赵磊", "孙倩", "周斌",
              "吴敏", "郑浩", "冯雪", "蒋涛", "沈悦", "韩鹏", "曹阳"]
REGIONS = ["DC-Shenzhen-A", "DC-Shenzhen-B", "DC-Shanghai-C", "DC-Beijing-D"]
TAG_POOL = [
    "os:linux", "os:vmware", "role:db", "role:web", "role:storage",
    "env:prod", "env:staging", "team:infra", "critical-path", "auto-recovered",
    "high-latency", "hardware-fault",
]

# 维表内设备 25 台，主表额外出现 5 台不在维表（Join 未匹配测试）
DIM_DEVICE_IDS = [f"SRV-{i:03d}" for i in range(1, 26)]
ORPHAN_DEVICE_IDS = [f"SRV-{i:03d}" for i in range(26, 31)]
ALL_DEVICE_IDS = DIM_DEVICE_IDS + ORPHAN_DEVICE_IDS

VENDORS = ["Huawei", "Dell", "HPE", "Inspur", "Supermicro", "Lenovo"]
MODELS = ["RH2288 V5", "PowerEdge R750", "ProLiant DL380", "NF5280M6",
          "SYS-2029U", "ThinkSystem SR650"]


# ----------------------------------------------------------------------------
# 工具函数：脏数据注入
# ----------------------------------------------------------------------------
def _maybe(value, p=0.0, replacements=None):
    """按概率把正常值替换为空/异常表示。"""
    if random.random() < p:
        return random.choice(replacements)
    return value


def dirty_severity(level: str) -> str:
    """大小写混用 + 前后空格，模拟真实采集脏数据。"""
    roll = random.random()
    if roll < 0.08:
        return level.upper()
    if roll < 0.13:
        return level.capitalize()
    if roll < 0.18:
        return f" {level} "
    if roll < 0.21:
        return f"{level}　"  # 全角空格
    return level


def dirty_status(status: str) -> str:
    roll = random.random()
    if roll < 0.07:
        return status.upper()
    if roll < 0.12:
        return f" {status}"
    return status


def dirty_timestamp(dt: datetime) -> str:
    """4 种格式混用 + 少量缺失。"""
    r = random.random()
    if r < 0.05:
        return random.choice(["", "N/A", "-"])
    fmt = random.choice([
        "%Y-%m-%d %H:%M:%S",
        "%Y/%m/%d %H:%M:%S",
        "%m/%d/%Y %H:%M",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%d %H:%M",
    ])
    return dt.strftime(fmt)


def dirty_metric_value(metric: str) -> str:
    spec = METRICS[metric]
    low, high = spec["range"]
    if random.random() < 0.08:
        return random.choice(["N/A", "--", "", "null", "  "])
    if spec["type"] == "int":
        v = random.randint(low, high)
        if random.random() < 0.05:
            return f" {v} "
        return str(v)
    v = round(random.uniform(low, high), 2)
    if random.random() < 0.05:
        return f" {v} "
    return str(v)


def dirty_owner() -> str:
    r = random.random()
    if r < 0.06:
        return ""
    if r < 0.10:
        return "N/A"
    if r < 0.13:
        return "-"
    if r < 0.15:
        return "null"
    return random.choice(OWNER_POOL)


def dirty_tags() -> str:
    r = random.random()
    if r < 0.08:
        return ""
    if r < 0.11:
        return "-"
    n = random.randint(1, 3)
    tags = random.sample(TAG_POOL, n)
    if random.random() < 0.10:
        tags.append("")  # 空标签段，测试 Split 后空列
    if random.random() < 0.05:
        tags.append(" ")
    return ";".join(tags)


def build_raw_detail(metric: str, dt: datetime) -> str:
    """内嵌 JSON：结构稳定但偶尔缺字段、类型不一致，供 KIME JSON 算子测试。"""
    detail = {"metric": metric, "collected_at": dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
              "source": "bmc-snmp"}
    if metric == "cpu_usage":
        detail["core"] = random.randint(0, 15)
        detail["load"] = round(random.uniform(0.5, 9.8), 2)
    elif metric == "mem_usage":
        detail["used_mb"] = random.randint(2048, 131072)
        if random.random() < 0.2:
            detail["used_mb"] = str(detail["used_mb"])  # 类型不一致
    elif metric == "disk_usage":
        detail["partition"] = random.choice(["/dev/sda1", "/dev/nvme0n1p2", "/dev/md0"])
    elif metric == "temp":
        detail["sensor"] = random.choice(["TSENS0", "INLET", "CPUTMP", "PSUTMP"])
    elif metric == "fan_speed":
        detail["fan_id"] = random.randint(1, 6)
    elif metric == "power_voltage":
        detail["rail"] = random.choice(["12V", "5V", "3.3V"])
    elif metric == "link_down":
        detail["port"] = f"eth{random.randint(0, 7)}"
    # 20% 概率删除某个可选字段，模拟采集不全
    if random.random() < 0.20:
        detail.pop(random.choice(list(detail.keys())[2:]), None)
    return json.dumps(detail, ensure_ascii=False, separators=(",", ":"))


def fill_message(metric: str) -> str:
    tmpl = random.choice(MESSAGES[metric])
    msg = tmpl.format(
        core=random.randint(0, 15), val=random.randint(70, 99),
        pid=random.randint(1000, 9999), svc=random.choice(["nginx", "mysql", "redis", "k8s"]),
        part=random.choice(["/", "/var", "/data", "/boot"]), ms=random.randint(5, 500),
        sensor=random.choice(["TSENS0", "INLET"]), fan=random.randint(1, 6),
        rpm=random.randint(800, 5000), rail=random.choice(["12V", "5V"]),
        psu=random.choice(["A", "B"]), port=f"eth{random.randint(0, 7)}",
    )
    # 少量消息带逗号/分号/首尾空格，测试字符串拆分
    if random.random() < 0.10:
        msg = f"[{random.choice(['CRITICAL', 'WARN'])}] {msg}; action required"
    return msg


def make_ip() -> str:
    ip = f"10.0.{random.randint(0, 20)}.{random.randint(2, 254)}"
    if random.random() < 0.05:
        return f" {ip} "
    return ip


def make_rack() -> str:
    rack = f"R{random.randint(1, 20):02d}-{chr(65 + random.randint(0, 3))}{random.randint(1, 20):02d}"
    if random.random() < 0.05:
        return rack.lower()
    return rack


# ----------------------------------------------------------------------------
# 表1：主表 300 行
# ----------------------------------------------------------------------------
def generate_main() -> list[dict]:
    rows = []
    base = datetime(2026, 10, 1, 0, 0, 0)
    for i in range(300):
        dt = base + timedelta(
            days=random.randint(0, 30),
            hours=random.randint(0, 23),
            minutes=random.randint(0, 59),
            seconds=random.randint(0, 59),
        )
        metric = random.choice(list(METRICS.keys()))
        severity = random.choices(
            ["critical", "warning", "info", "debug"],
            weights=[25, 40, 25, 10], k=1)[0]
        rows.append({
            "alert_id": f"ALT-202610{random.randint(1, 31):02d}-{i + 1:04d}",
            "event_time": dirty_timestamp(dt),
            "device_id": random.choice(ALL_DEVICE_IDS),
            "device_type": random.choice(DEVICE_TYPES),
            "ip_address": make_ip(),
            "rack": make_rack(),
            "severity": dirty_severity(severity),
            "metric": metric,
            "metric_value": dirty_metric_value(metric),
            "unit": METRICS[metric]["unit"],
            "message": fill_message(metric),
            "status": dirty_status(random.choice(STATUS_POOL)),
            "owner": dirty_owner(),
            "region": random.choice(REGIONS),
            "retry_count": _maybe(str(random.randint(0, 5)), 0.07, ["", "N/A", "-"]),
            "tags": dirty_tags(),
            "raw_detail": build_raw_detail(metric, dt),
        })

    # --- 注入 12 行 alert_id 重复（同 ID 不同数据，测 Unique 按键去重） ---
    id_pool = [r["alert_id"] for r in rows[:30]]
    for idx in random.sample(range(300), 12):
        rows[idx]["alert_id"] = random.choice(id_pool)

    # --- 注入 3 行整行重复（测记录级去重） ---
    for _ in range(3):
        rows.append(dict(random.choice(rows[:50])))

    random.shuffle(rows)
    return rows


# ----------------------------------------------------------------------------
# 表2：维表 30 行（Join 用）
# ----------------------------------------------------------------------------
def generate_dim() -> list[dict]:
    rows = []
    base = datetime(2020, 1, 1)
    for i, dev in enumerate(DIM_DEVICE_IDS, start=1):
        purchase = base + timedelta(days=random.randint(0, 1800))
        warranty = purchase + timedelta(days=random.randint(1095, 2190))
        rows.append({
            "device_id": dev,
            "hostname": f"host-{dev.lower()}",
            "model": random.choice(MODELS),
            "vendor": random.choice(VENDORS),
            "firmware_version": f"{random.randint(1, 4)}.{random.randint(0, 9)}.{random.randint(0, 20)}",
            "location": random.choice(REGIONS),
            "purchase_date": purchase.strftime(random.choice(
                ["%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y"])),
            "warranty_end": warranty.strftime("%Y-%m-%d"),
            "cpu_cores": random.choice([8, 16, 24, 32, 48, 64]),
            "memory_gb": random.choice([32, 64, 128, 256, 512]),
            "dim_status": random.choice(["active", "spare", "retired"]),
        })
        if random.random() < 0.1:
            rows[-1]["firmware_version"] = ""
        if random.random() < 0.08:
            rows[-1]["memory_gb"] = "N/A"
    return rows


# ----------------------------------------------------------------------------
# 表3：补充表 50 行（Union 用：列序不同、多 source、少 tags、列名大小写不同）
# ----------------------------------------------------------------------------
def generate_extra(main_rows: list[dict]) -> list[dict]:
    extra = []
    samples = random.sample(main_rows, 50)
    for r in samples:
        # 故意改列名大小写、调换顺序、去掉 tags、新增 source
        extra.append({
            "Alert_ID": r["alert_id"],
            "EVENT_TIME": r["event_time"],
            "device_id": r["device_id"],
            "metric": r["metric"],
            "message": r["message"],
            "status": r["status"],
            "severity": r["severity"],
            "metric_value": r["metric_value"],
            "region": r["region"],
            "source": random.choice(["syslog", "snmp-trap", "ipmi"]),
            "raw_detail": r["raw_detail"],
        })
    return extra


# ----------------------------------------------------------------------------
# KIME 专属：JSON 样本（动态 key map + 纯数组）
# ----------------------------------------------------------------------------
def _alert_obj(seq: int) -> dict:
    metric = random.choice(list(METRICS.keys()))
    obj = {
        "id": f"J-ALERT-{seq:04d}",
        "level": random.choices(["critical", "warning", "info"], weights=[3, 5, 2], k=1)[0],
        "metric": metric,
        "value": round(random.uniform(*METRICS[metric]["range"]), 2),
        "ts": (datetime(2026, 10, 1) + timedelta(
            days=random.randint(0, 30), hours=random.randint(0, 23),
            minutes=random.randint(0, 59))).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": random.choice(["snmp-trap", "syslog", "ipmi"]),
        "detail": {
            "sensor": random.choice(["TSENS0", "INLET", "CPUTMP", "PSUTMP"]),
            "threshold": random.choice([85, 90, 95]),
        },
    }
    # 20% 行缺 source；10% 行 value 变字符串；15% 行缺 detail
    if random.random() < 0.20:
        obj.pop("source", None)
    if random.random() < 0.10:
        obj["value"] = str(obj["value"])
    if random.random() < 0.15:
        obj.pop("detail", None)
    return obj


def generate_json_samples() -> tuple[dict, list]:
    # 1) 动态 key map：IP -> 告警数组（Unnest Object 测试，含空数组）
    ip_map: dict[str, list] = {}
    seq = 1
    for octet in range(11, 19):
        ip = f"10.0.0.{octet}"
        if octet == 14:
            ip_map[ip] = []  # 空数组，测试空值分支
            continue
        n = random.randint(2, 5)
        ip_map[ip] = [_alert_obj(seq + i) for i in range(n)]
        seq += n
    # 2) 纯平铺数组（Unnest Array 测试）
    flat = [_alert_obj(seq + i) for i in range(30)]
    return ip_map, flat


# ----------------------------------------------------------------------------
# 写出
# ----------------------------------------------------------------------------
def write_csv(name: str, rows: list[dict], fieldnames: list[str]):
    path = os.path.join(OUT_DIR, name)
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_MINIMAL)
        w.writeheader()
        w.writerows(rows)
    print(f"[OK] {name}: {len(rows)} rows -> {path}")


def main():
    main_rows = generate_main()
    dim_rows = generate_dim()
    extra_rows = generate_extra(main_rows)

    main_fields = [
        "alert_id", "event_time", "device_id", "device_type", "ip_address",
        "rack", "severity", "metric", "metric_value", "unit", "message",
        "status", "owner", "region", "retry_count", "tags", "raw_detail",
    ]
    dim_fields = [
        "device_id", "hostname", "model", "vendor", "firmware_version",
        "location", "purchase_date", "warranty_end", "cpu_cores",
        "memory_gb", "dim_status",
    ]
    extra_fields = [
        "Alert_ID", "EVENT_TIME", "device_id", "metric", "message",
        "status", "severity", "metric_value", "region", "source", "raw_detail",
    ]

    write_csv("bmc_alerts_main.csv", main_rows, main_fields)
    write_csv("bmc_devices_dim.csv", dim_rows, dim_fields)
    write_csv("bmc_alerts_extra.csv", extra_rows, extra_fields)

    # KIME JSON 样本
    ip_map, flat = generate_json_samples()
    with open(os.path.join(OUT_DIR, "alerts_by_ip.json"), "w", encoding="utf-8") as f:
        json.dump(ip_map, f, ensure_ascii=False, indent=2)
    with open(os.path.join(OUT_DIR, "alerts_flat_array.json"), "w", encoding="utf-8") as f:
        json.dump(flat, f, ensure_ascii=False, indent=2)
    print(f"[OK] alerts_by_ip.json: {len(ip_map)} IP keys, "
          f"{sum(len(v) for v in ip_map.values())} alerts")
    print(f"[OK] alerts_flat_array.json: {len(flat)} alerts")

    # 统计快照，供校验文档引用
    summary = {
        "main_rows": len(main_rows),
        "dim_rows": len(dim_rows),
        "extra_rows": len(extra_rows),
        "orphan_devices": ORPHAN_DEVICE_IDS,
        "duplicate_alert_ids": sum(
            1 for x in main_rows if sum(y["alert_id"] == x["alert_id"] for y in main_rows) > 1),
    }
    with open(os.path.join(OUT_DIR, "_summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print("[SUMMARY]", json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
#（注：内容由AI生成）
