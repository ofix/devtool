import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import StreamDataset from "../runtime/StreamDataset.js"
import StreamController from "../runtime/StreamController.js"

export default {
  type: "transpose",
  meta: {
    label: "Transpose",
    icon: "IconSwitch",
    color: "#10b981",
    category: "transform",
    inputs: 1,
    outputs: 1,
    inputCategory: DATA_CATEGORY.TABLE,
    outputCategory: DATA_CATEGORY.TABLE,
  },
  schema: [
    { field: "keepFields", label: "保留列", component: "fieldSelect", multiple: true },
    { field: "unpivotFields", label: "转置列", component: "fieldSelect", multiple: true },
  ],
  async execute(inputs, params, ctx) {
    const data = inputs[0]
    if (!data) return null

    let keepFields = params.keepFields || []
    let unpivotFields = params.unpivotFields || []

    if (typeof keepFields === "string")
      keepFields = keepFields
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)
    if (typeof unpivotFields === "string")
      unpivotFields = unpivotFields
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)

    if (unpivotFields.length === 0) return data

    const outCols = [
      ...keepFields.map(f => ({ name: f, type: "string" })),
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ]

    const columnMapping = {}
    keepFields.forEach(f => (columnMapping[f] = f))
    columnMapping["key"] = unpivotFields
    columnMapping["value"] = unpivotFields

    async function* transposeGenerator() {
      const controller = new StreamController(data.controller.sourceGenerator, "rendezvous")
      const iterator = controller.createIterator("transpose-node", ctx.signal)

      for await (const chunk of iterator) {
        if (ctx.signal.aborted) return

        // 宽表转长表，行数会膨胀，需要重新切块
        let outRowsBuffer = []
        const MAX_BUFFER = 5000

        for (const row of chunk.rows) {
          const base = {}
          keepFields.forEach(f => (base[f] = row[f]))

          for (const uf of unpivotFields) {
            outRowsBuffer.push({
              ...base,
              key: uf,
              value: row[uf],
            })

            // 达到上限则吐出
            if (outRowsBuffer.length >= MAX_BUFFER) {
              yield { columns: outCols, rows: outRowsBuffer }
              outRowsBuffer = []
            }
          }
        }

        if (outRowsBuffer.length > 0) {
          yield { columns: outCols, rows: outRowsBuffer }
        }
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }

    return new StreamDataset({
      dataCategory: DATA_CATEGORY.TABLE,
      columns: outCols,
      controller: { sourceGenerator: transposeGenerator, strategy: "rendezvous" },
      columnMapping,
    })
  },
}
