import { DATA_CATEGORY } from "../../constants/DataCategories.js"

export default {
  type: "union",
  meta: {
    label: "Union",
    icon: "IconMerge",
    color: "#06b6d4",
    category: "join", // 归入连接类
    inputs: 2,
    outputs: 1,
    inputCategory: DATA_CATEGORY.TABLE,
    outputCategory: DATA_CATEGORY.TABLE,
  },
  schema: [],
  execute(inputs, params) {
    if (!inputs || inputs.length === 0) return { rows: [], columns: [], columnMapping: {} }

    const baseColumns = inputs[0].columns || []
    const allRows = []

    // 构建多源映射字典
    const columnMapping = {}

    // 遍历所有输入，寻找同名字段的来源
    for (const data of inputs) {
      if (!data || !data.rows) continue

      // 收集行数据
      for (const row of data.rows) {
        allRows.push(row)
      }

      // 收集列映射
      for (const col of data.columns) {
        if (!columnMapping[col.name]) {
          columnMapping[col.name] = []
        }
        // 将来源字段推入数组。注意这里存的是字段名，因为具体的节点 ID
        // 在图计算时会结合 graphStore 的拓扑关系推导出来。
        // 但在当前架构下，如果多个上游节点有同一个字段名，单靠字段名会混淆。
        // 所以我们应该存 nodeId::fieldName 的结构吗？
        // 不，因为 columnMapping 是在 execute 里生成的，而 execute 里拿不到 nodeId。
        // 但 Engine.js 会注入 ctx.nodeId，所以我们需要把入参的边 ID 传进来。
        // 实际上，之前的图追踪是“顺着入边查找同名字段”。
        // 如果要精确到特定分支，我们可以只存字段名，由 LineageGraphManager 结合边的来源去匹配。
        columnMapping[col.name].push(col.name)
      }
    }

    // 去重（因为如果两路输入都有 host，上面会 push 两次）
    for (const key in columnMapping) {
      columnMapping[key] = [...new Set(columnMapping[key])]
    }

    return { rows: allRows, columns: baseColumns, columnMapping }
  },
}
