// Cross Tab 算子：长转宽 (Pivot)
import { DATA_CATEGORY } from "../../constants/DataCategories.js"
export default {
  type: "crossTab",
  meta: {
    label: "Cross Tab",
    icon: "IconGrid",
    color: "#f43f5e",
    category: "transform",
    inputs: 1,
    outputs: 1,
    inputCategory: DATA_CATEGORY.TABLE,
    outputCategory: DATA_CATEGORY.TABLE,
  },
  schema: [
    { field: "rowField", label: "行字段", component: "fieldSelect", multiple: false },
    { field: "colField", label: "列字段", component: "fieldSelect", multiple: false },
    { field: "valField", label: "值字段", component: "fieldSelect", multiple: false },
    {
      field: "aggFunc",
      label: "聚合函数",
      component: "select",
      options: [
        { label: "SUM", value: "SUM" },
        { label: "COUNT", value: "COUNT" },
        { label: "MAX", value: "MAX" },
      ],
    },
  ],
  execute(inputs, params) {
    const data = inputs[0]
    if (!data || !data.rows) return { rows: [], columns: [], columnMapping: {} }

    const { rowField, colField, valField, aggFunc = "SUM" } = params
    if (!rowField || !colField || !valField) {
      // 参数不完整，原样透传
      const columnMapping = {}
      data.columns.forEach(c => (columnMapping[c.name] = c.name))
      return { ...data, columnMapping }
    }

    const pivotMap = new Map()
    const uniqueCols = new Set()

    for (const row of data.rows) {
      const rKey = String(row[rowField])
      const cKey = String(row[colField])
      const val = Number(row[valField])

      uniqueCols.add(cKey)

      if (!pivotMap.has(rKey)) {
        pivotMap.set(rKey, {})
      }
      const pRow = pivotMap.get(rKey)

      if (!pRow[cKey]) {
        pRow[cKey] = { sum: 0, count: 0, max: -Infinity }
      }
      const state = pRow[cKey]
      if (!isNaN(val)) {
        state.sum += val
        state.max = Math.max(state.max, val)
      }
      state.count++
    }

    // 列数限制 100
    const colArray = Array.from(uniqueCols).slice(0, 100)
    const outCols = [
      { name: rowField, type: "string" },
      ...colArray.map(c => ({ name: String(c), type: "number" })),
    ]

    const outRows = []
    for (const [rKey, pRow] of pivotMap.entries()) {
      const newRow = { [rowField]: rKey }
      for (const c of colArray) {
        const state = pRow[c]
        if (!state) {
          newRow[c] = null
        } else {
          if (aggFunc === "SUM") newRow[c] = state.sum
          else if (aggFunc === "COUNT") newRow[c] = state.count
          else if (aggFunc === "MAX") newRow[c] = state.max === -Infinity ? null : state.max
        }
      }
      outRows.push(newRow)
    }

    // 构建血缘映射字典
    const columnMapping = {}

    // 行字段：直传
    columnMapping[rowField] = rowField

    // 动态生成的列（如 A, B）：它们的值来源于 valField 的聚合计算
    // 注意，这里的血缘本质上指向了 valField。但在图谱追踪时，如果有多个动态列，它们都会指向同一个 valField 源头。
    for (const c of colArray) {
      // 因为列名是动态的（比如是 "A"），但它的源头是上游的 valField
      // 这里我们先记录值为 valField。
      // 进阶提示：如果为了 UI 能精确展示“A 列其实来源于 colField=A 且 valField 的值”，
      // 可以在这里用数组形式保留依赖：[valField, colField]
      columnMapping[c] = [valField, colField]
    }

    return { rows: outRows, columns: outCols, columnMapping }
  },
}
