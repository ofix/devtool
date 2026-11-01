// Cross Tab 算子：长转宽 (Pivot)
export default {
  type: "crossTab",
  meta: {
    label: "Cross Tab",
    icon: "IconGrid",
    color: "#f43f5e",
    category: "transform",
    inputs: 1,
    outputs: 1,
    inputPortType: "table",
    outputPortType: "table",
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
    if (!data || !data.rows) return { rows: [], columns: [] }

    const { rowField, colField, valField, aggFunc = "SUM" } = params
    if (!rowField || !colField || !valField) return data

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

    return { rows: outRows, columns: outCols }
  },
}
