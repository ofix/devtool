import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import StreamDataset from "../runtime/StreamDataset.js"

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
  async execute(inputs, params, ctx) {
    const data = inputs[0]
    if (!data) return null

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
    const columnMapping = {}

    for (const c of data.columns) {
      if (keepCols.includes(c.name)) {
        const newName = renameMap[c.name] || c.name
        outCols.push({ name: newName, type: c.type })
        validCols.add(c.name)
        columnMapping[newName] = c.name
      }
    }

    // 流式处理生成器
    async function* selectGenerator() {
      for await (const chunk of data) {
        const outRows = chunk.map(row => {
          const newRow = {}
          for (const oldName of validCols) {
            const newName = renameMap[oldName] || oldName
            newRow[newName] = row[oldName]
          }
          return newRow
        })
        yield outRows
      }
    }

    // 返回流式 Dataset，把 mapping 挂载在实例上
    const resultStream = new StreamDataset({
      dataCategory: DATA_CATEGORY.TABLE,
      columns: outCols,
      generator: selectGenerator,
    })
    resultStream.columnMapping = columnMapping

    return resultStream
  },
}
