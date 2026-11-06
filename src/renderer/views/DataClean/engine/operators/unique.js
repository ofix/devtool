import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import StreamDataset from "../runtime/StreamDataset.js"
import StreamController from "../runtime/StreamController.js"

export default {
  type: "unique",
  meta: {
    label: "Unique",
    icon: "IconListCheck",
    color: "#0ea5e9",
    category: "prepare",
    inputs: 1,
    outputs: 1,
    inputCategory: DATA_CATEGORY.TABLE,
    outputCategory: DATA_CATEGORY.TABLE,
  },
  schema: [{ field: "keyFields", label: "去重依据列", component: "fieldSelect", multiple: true }],
  async execute(inputs, params, ctx) {
    const data = inputs[0]
    if (!data) return null

    let keyFields = params.keyFields || []
    if (keyFields.length === 0) {
      keyFields = data.columns.map(c => c.name)
    }

    async function* uniqueGenerator() {
      const seen = new Set()
      const controller = new StreamController(data.controller.sourceGenerator, "rendezvous")
      const iterator = controller.createIterator("unique-node", ctx.signal)

      for await (const chunk of iterator) {
        if (ctx.signal.aborted) return

        const outRows = []
        for (const row of chunk.rows) {
          const key = keyFields.map(f => String(row[f])).join("|||")
          if (!seen.has(key)) {
            seen.add(key)
            outRows.push(row)
          }
        }

        if (outRows.length > 0) {
          yield { ...chunk, rows: outRows }
        }
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }

    return new StreamDataset({
      dataCategory: DATA_CATEGORY.TABLE,
      columns: data.columns,
      controller: { sourceGenerator: uniqueGenerator, strategy: "rendezvous" },
      columnMapping: data.columnMapping,
    })
  },
}
