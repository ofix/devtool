import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import StreamDataset from "../runtime/StreamDataset.js"
import StreamController from "../runtime/StreamController.js"

export default {
  type: "regexExtract",
  meta: {
    label: "Regex Extract",
    icon: "IconRegex",
    color: "#f59e0b",
    category: "transform",
    inputs: 1,
    outputs: 1,
    inputCategory: DATA_CATEGORY.TABLE,
    outputCategory: DATA_CATEGORY.TABLE,
  },
  schema: [
    { field: "sourceField", label: "源列", component: "fieldSelect" },
    { field: "regex", label: "正则表达式", component: "input" },
    { field: "newField", label: "新列名", component: "input" },
  ],
  async execute(inputs, params, ctx) {
    const data = inputs[0]
    if (!data) return null

    const { sourceField, regex, newField } = params
    if (!sourceField || !regex || !newField) return data

    let regExp
    try {
      regExp = new RegExp(regex)
    } catch (e) {
      throw new Error("正则表达式不合法")
    }

    // 构建新的列结构
    const outCols = [...data.columns, { name: newField, type: "string" }]
    const columnMapping = { ...data.columnMapping, [newField]: sourceField }

    async function* extractGenerator() {
      const controller = new StreamController(data.controller.sourceGenerator, "rendezvous")
      const iterator = controller.createIterator("regex-node", ctx.signal)

      for await (const chunk of iterator) {
        if (ctx.signal.aborted) return

        const outRows = chunk.rows.map(row => {
          const match = String(row[sourceField] || "").match(regExp)
          return { ...row, [newField]: match ? match[1] || match[0] : null }
        })

        yield { columns: outCols, rows: outRows }
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }

    return new StreamDataset({
      dataCategory: DATA_CATEGORY.TABLE,
      columns: outCols,
      controller: { sourceGenerator: extractGenerator, strategy: "rendezvous" },
      columnMapping,
    })
  },
}
