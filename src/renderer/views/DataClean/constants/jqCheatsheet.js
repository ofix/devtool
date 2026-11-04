export const JQ_CHEATSHEET = [
  {
    category: "1. 基础提取与重组",
    items: [
      {
        title: "提取指定字段",
        desc: "从复杂的告警对象中只提取关心的几个字段。",
        code: `.[] | {id, level, metric}`,
        input: [
          { id: "A01", level: "critical", metric: "cpu", value: 95, ts: "2026-10-01" },
          { id: "A02", level: "warning", metric: "mem", value: 80, ts: "2026-10-02" },
        ],
        output: [
          { id: "A01", level: "critical", metric: "cpu" },
          { id: "A02", level: "warning", metric: "mem" },
        ],
      },
      {
        title: "深层嵌套字段提取",
        desc: "提取嵌套在 detail 里的传感器名称。",
        code: `.[] | {id, sensor: .detail.sensor}`,
        input: [
          { id: 1, detail: { sensor: "INLET", threshold: 90 } },
          { id: 2, detail: { sensor: "CPU", threshold: 85 } },
        ],
        output: [
          { id: 1, sensor: "INLET" },
          { id: 2, sensor: "CPU" },
        ],
      },
      {
        title: "字段重命名",
        desc: "把旧的字段名映射为新的字段名。",
        code: `.[] | {new_id: .old_id, new_name: .name}`,
        input: [{ old_id: 1001, name: "Server-A" }],
        output: [{ new_id: 1001, new_name: "Server-A" }],
      },
      {
        title: "处理空值",
        desc: "如果 customer 为空，替换为 'Unknown'。",
        code: `.[] | .customer |= (. // "Unknown")`,
        input: [
          { id: 1, customer: "Alice" },
          { id: 2, customer: null },
        ],
        output: [
          { id: 1, customer: "Alice" },
          { id: 2, customer: "Unknown" },
        ],
      },
    ],
  },
  {
    category: "2. 过滤与筛选",
    items: [
      {
        title: "单条件过滤",
        desc: "只保留 critical 级别的告警。",
        code: `.[] | select(.level == "critical")`,
        input: [
          { id: 1, level: "warning" },
          { id: 2, level: "critical" },
        ],
        output: [{ id: 2, level: "critical" }],
      },
      {
        title: "多条件 AND 过滤",
        desc: "保留 critical 且 value 大于 50 的记录。",
        code: `.[] | select(.level == "critical" and .value > 50)`,
        input: [
          { id: 1, level: "critical", value: 30 },
          { id: 2, level: "critical", value: 80 },
          { id: 3, level: "warning", value: 90 },
        ],
        output: [{ id: 2, level: "critical", value: 80 }],
      },
      {
        title: "包含子串过滤",
        desc: "保留 message 里包含 'OOM' 的日志。",
        code: `.[] | select(.message | contains("OOM"))`,
        input: [
          { id: 1, message: "Killed by OOM" },
          { id: 2, message: "Normal exit" },
        ],
        output: [{ id: 1, message: "Killed by OOM" }],
      },
      {
        title: "正则匹配过滤",
        desc: "保留 IP 地址以 10.0 开头的记录。",
        code: `.[] | select(.ip | test("^10\\\\.0"))`,
        input: [
          { id: 1, ip: "10.0.0.1" },
          { id: 2, ip: "192.168.1.1" },
        ],
        output: [{ id: 1, ip: "10.0.0.1" }],
      },
    ],
  },
  {
    category: "3. 数组与对象转换",
    items: [
      {
        title: "数组去重",
        desc: "去除数组中的重复元素。",
        code: `.tags | unique`,
        input: {
          tags: ["A", "B", "A", "C", "B"],
        },
        output: ["A", "B", "C"],
      },
      {
        title: "数组排序",
        desc: "根据 price 字段对订单进行升序排序。",
        code: `sort_by(.price)`,
        input: [
          { item: "B", price: 30 },
          { item: "A", price: 10 },
        ],
        output: [
          { item: "A", price: 10 },
          { item: "B", price: 30 },
        ],
      },
      {
        title: "字符串转数组",
        desc: "将逗号分隔的字符串转为真正的 JSON 数组。",
        code: `.[] | .tags |= split(",")`,
        input: [{ id: 1, tags: "a,b,c" }],
        output: [{ id: 1, tags: ["a", "b", "c"] }],
      },
      {
        title: "字典转键值对数组",
        desc: "将对象转为 [{key, value}] 结构的数组。",
        code: `to_entries`,
        input: {
          a: 1,
          b: 2,
        },
        output: [
          { key: "a", value: 1 },
          { key: "b", value: 2 },
        ],
      },
      {
        title: "键值对数组转字典",
        desc: "把 [{key, value}] 结构还原为对象。",
        code: `from_entries`,
        input: [
          { key: "a", value: 1 },
          { key: "b", value: 2 },
        ],
        output: {
          a: 1,
          b: 2,
        },
      },
    ],
  },
  {
    category: "4. 动态 Key 与 Map",
    items: [
      {
        title: "动态 Key 展平为数组",
        desc: "处理以 IP 或 UUID 为 Key 的数据，转为带 ip 字段的平铺数组。",
        code: `to_entries[] | .key as $ip | .value[] | {ip: $ip} + .`,
        input: {
          "10.0.0.1": [{ id: 1, level: "critical" }],
          "10.0.0.2": [{ id: 2, level: "warning" }],
        },
        output: [
          { ip: "10.0.0.1", id: 1, level: "critical" },
          { ip: "10.0.0.2", id: 2, level: "warning" },
        ],
      },
      {
        title: "过滤掉空数组的键",
        desc: "清理掉没有数据的动态节点。",
        code: `with_entries(select(.value | length > 0))`,
        input: {
          "10.0.0.1": [{ id: 1 }],
          "10.0.0.2": [],
        },
        output: {
          "10.0.0.1": [{ id: 1 }],
        },
      },
      {
        title: "字典批量重命名 Key",
        desc: "把 Key 里的点号替换为下划线。",
        code: `with_entries(.key |= gsub("\\\\."; "_"))`,
        input: {
          "10.0.0.1": { id: 1 },
        },
        output: {
          "10_0_0_1": { id: 1 },
        },
      },
    ],
  },
  {
    category: "5. 数据重组与聚合",
    items: [
      {
        title: "分组统计数量",
        desc: "按 level 分组，统计每种级别的告警数量。",
        code: `group_by(.level) | map({level: .[0].level, count: length})`,
        input: [
          { id: 1, level: "warning" },
          { id: 2, level: "critical" },
          { id: 3, level: "warning" },
        ],
        output: [
          { level: "critical", count: 1 },
          { level: "warning", count: 2 },
        ],
      },
      {
        title: "分组求和",
        desc: "按 category 分组，计算总销售额。",
        code: `group_by(.category) | map({category: .[0].category, total: (map(.amount) | add)})`,
        input: [
          { category: "A", amount: 100 },
          { category: "B", amount: 200 },
          { category: "A", amount: 150 },
        ],
        output: [
          { category: "A", total: 250 },
          { category: "B", total: 200 },
        ],
      },
      {
        title: "取出 Top N",
        desc: "按 value 倒排，取出前 2 名。",
        code: `sort_by(.value) | reverse | .[0:2]`,
        input: [
          { id: 1, value: 10 },
          { id: 2, value: 50 },
          { id: 3, value: 30 },
        ],
        output: [
          { id: 2, value: 50 },
          { id: 3, value: 30 },
        ],
      },
      {
        title: "父子层级结构拍平",
        desc: "把订单里的商品数组炸开，变成多行。",
        code: `.[] as $order | $order.items[] | {order_id: $order.id, item: .name}`,
        input: [{ id: "O1", items: [{ name: "Apple" }, { name: "Banana" }] }],
        output: [
          { order_id: "O1", item: "Apple" },
          { order_id: "O1", item: "Banana" },
        ],
      },
    ],
  },
]
