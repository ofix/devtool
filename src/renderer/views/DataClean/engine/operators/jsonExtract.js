import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import StreamDataset from "../runtime/StreamDataset.js"
import StreamController from "../runtime/StreamController.js"

function getValueByPath(obj, path) {
  if (!path) return obj
  const cleanPath = path.trim().replace(/^\./, "")
  const parts = cleanPath.split(/\.|\[|\]/).filter(Boolean)
  let current = obj
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    current = current[part]
  }
  return current
}

export default {
  type: "jsonExtract",
  meta: {
    label: "JSON Extract",
    icon: "IconExtract",
    color: "#0ea5e9",
    category: "json",
    inputs: 1,
    outputs: 1,
    inputCategory: DATA_CATEGORY.JSON,
    outputCategory: DATA_CATEGORY.TABLE,
  },
  schema: [{ field: "fields", label: "提取字段", component: "jsonFieldPicker" }],
  async execute(inputs, params, ctx) {
    const inputJson = inputs[0]?.json
    if (!inputJson) throw new Error("未接收到 JSON 数据")

    const dataArray = Array.isArray(inputJson) ? inputJson : [inputJson]
    const fields = params.fields || []
    if (fields.length === 0) throw new Error("请至少选择一个提取字段")

    const outCols = fields.map(f => ({ name: f.alias || f.path, type: "string" }))
    const columnMapping = {}
    fields.forEach(f => (columnMapping[f.alias || f.path] = f.path))

    async function* extractGenerator() {
      const outRowsBuffer = []
      const MAX_BUFFER = 5000

      for (const item of dataArray) {
        if (ctx.signal.aborted) return

        const newRow = {}
        for (const f of fields) {
          newRow[f.alias || f.path] = getValueByPath(item, f.path)
        }
        outRowsBuffer.push(newRow)

        if (outRowsBuffer.length >= MAX_BUFFER) {
          yield { columns: outCols, rows: outRowsBuffer }
          outRowsBuffer.length = 0
        }
      }

      if (outRowsBuffer.length > 0) {
        yield { columns: outCols, rows: outRowsBuffer }
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
