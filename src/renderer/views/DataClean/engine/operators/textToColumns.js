import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import StreamDataset from "../runtime/StreamDataset.js"
import StreamController from "../runtime/StreamController.js"

export default {
  type: "textToColumns",
  meta: {
    label: "Text to Columns",
    icon: "IconCut",
    color: "#0ea5e9",
    category: "parse",
    inputs: 1,
    outputs: 1,
    inputCategory: DATA_CATEGORY.TABLE,
    outputCategory: DATA_CATEGORY.TABLE,
  },
  schema: [
    { field: "sourceField", label: "拆分列", component: "fieldSelect" },
    { field: "delimiter", label: "分隔符", component: "input", defaultValue: "," },
    { field: "newFieldPrefix", label: "新列前缀", component: "input", defaultValue: "split" },
  ],
  async execute(inputs, params, ctx) {
    const data = inputs[0]
    if (!data) return null

    const { sourceField, delimiter = ",", newFieldPrefix = "split" } = params
    if (!sourceField) return data

    let maxParts = 1
    let outCols = []

    async function* splitGenerator() {
      const controller = new StreamController(data.controller.sourceGenerator, "rendezvous")
      const iterator = controller.createIterator("text-split-node", ctx.signal)

      for await (const chunk of iterator) {
        if (ctx.signal.aborted) return

        // 首块探测最大列数
        if (outCols.length === 0) {
          for (const row of chunk.rows) {
            const parts = String(row[sourceField] || "").split(delimiter)
            maxParts = Math.max(maxParts, parts.length)
          }
          const newCols = Array.from({ length: maxParts }).map((_, i) => ({
            name: `${newFieldPrefix}_${i + 1}`,
            type: "string",
          }))
          outCols = [...data.columns.filter(c => c.name !== sourceField), ...newCols]
        }

        const outRows = chunk.rows.map(row => {
          const newRow = {}
          for (const c of data.columns) {
            if (c.name !== sourceField) newRow[c.name] = row[c.name]
          }
          const parts = String(row[sourceField] || "").split(delimiter)
          for (let i = 0; i < maxParts; i++) {
            newRow[`${newFieldPrefix}_${i + 1}`] = parts[i] || null
          }
          return newRow
        })

        yield { columns: outCols, rows: outRows }
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }

    // 构建 ColumnMapping
    const columnMapping = { ...data.columnMapping }
    // 新列依赖 sourceField
    // (注意：如果是首块才会生成 outCols，更严谨的做法是在 Engine 层拦截并广播 Schema 变更)

    return new StreamDataset({
      dataCategory: DATA_CATEGORY.TABLE,
      columns: data.columns.filter(c => c.name !== sourceField), // 初始表头，运行时可能扩容
      controller: { sourceGenerator: splitGenerator, strategy: "rendezvous" },
      columnMapping,
    })
  },
}
