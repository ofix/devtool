import { DATA_CATEGORY } from "../../constants/DataCategories.js"

export default {
  type: "select",
  meta: {
    label: "Select",
    icon: "IconList",
    color: "#0ea5e9",
    category: "prepare",
    inputs: 1,
    outputs: 1,
    inputCategory: DATA_CATEGORY.TABLE,
    outputCategory: DATA_CATEGORY.TABLE,
  },
  schema: [
    { field: "columns", label: "保留列", component: "columnPicker" },
    { field: "renameMap", label: "重命名", component: "renamePanel" },
  ],
  execute(inputs, params) {
    const data = inputs[0]
    if (!data || !data.rows) return { rows: [], columns: [], columnMapping: {} }

    let keepCols = params.columns || []
    if (!Array.isArray(keepCols)) keepCols = []

    if (keepCols.length === 0) keepCols = data.columns.map(c => c.name)

    const renameMap = {}
    if (params.renameMap && params.renameMap.trim()) {
      params.renameMap.split(",").forEach(pair => {
        const [oldName, newName] = pair.split(":").map(s => s.trim())
        if (oldName && newName) renameMap[oldName] = newName
      })
    }

    const outCols = []
    const validCols = new Set()
    // 记录输出字段与源头字段的映射字典
    const columnMapping = {}

    for (const c of data.columns) {
      if (keepCols.includes(c.name)) {
        const newName = renameMap[c.name] || c.name
        outCols.push({ name: newName, type: c.type })
        validCols.add(c.name)
        // 记录当前字段的来源（如果是改了名，映射到老名字；如果没改，映射到自己）
        columnMapping[newName] = c.name
      }
    }

    const outRows = data.rows.map(row => {
      const newRow = {}
      for (const oldName of validCols) {
        const newName = renameMap[oldName] || oldName
        newRow[newName] = row[oldName]
      }
      return newRow
    })

    return { rows: outRows, columns: outCols, columnMapping }
  },
}
