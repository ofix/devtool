// Union 算子
export default {
  type: "union",
  meta: {
    label: "Union",
    icon: "IconMerge",
    color: "#06b6d4",
    category: "join", // 归入连接类
    inputs: 2,
    outputs: 1,
    inputPortType: "table",
    outputPortType: "table",
  },
  schema: [],
  execute(inputs, params) {
    if (!inputs || inputs.length === 0) return { rows: [], columns: [] }

    const baseColumns = inputs[0].columns || []
    const allRows = []

    for (const data of inputs) {
      if (!data || !data.rows) continue
      for (const row of data.rows) {
        allRows.push(row)
      }
    }

    return { rows: allRows, columns: baseColumns }
  },
}
