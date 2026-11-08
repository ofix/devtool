import { BaseJsOperator } from "./BaseJsOperator.js"

export class JsTextToColumns extends BaseJsOperator {
  async execute(inputs, params, ctx) {
    const inputData = inputs[0]
    if (!inputData) return null

    // 👇 核心修复 1：提取真实的 streamDataset 和原始 schema
    const streamDataset = inputData.payload.streamDataset
    const originalSchema = inputData.schema

    const { sourceField, delimiter = ",", newFieldPrefix = "split" } = params
    if (!sourceField) return inputData

    const generator = async function* (self) {
      let maxParts = 1
      let outCols = []
      let isFirstChunk = true

      for await (const chunk of self.pullStream(streamDataset, ctx.nodeId, ctx)) {
        // 首块探测最大列数
        if (isFirstChunk) {
          for (const row of chunk.rows) {
            const parts = String(row[sourceField] || "").split(delimiter)
            maxParts = Math.max(maxParts, parts.length)
          }
          const newCols = Array.from({ length: maxParts }).map((_, i) => ({
            name: `${newFieldPrefix}_${i + 1}`,
            type: "string",
          }))
          outCols = [...originalSchema.filter(c => c.name !== sourceField), ...newCols]
          isFirstChunk = false
        }

        const outRows = chunk.rows.map(row => {
          const newRow = {}
          for (const c of originalSchema) {
            if (c.name !== sourceField) newRow[c.name] = row[c.name]
          }
          const parts = String(row[sourceField] || "").split(delimiter)
          for (let i = 0; i < maxParts; i++) {
            newRow[`${newFieldPrefix}_${i + 1}`] = parts[i] || null
          }
          return newRow
        })

        yield { columns: outCols, rows: outRows }
      }
    }

    // 👇 核心修复 2：在 buildHandle 之前，必须为这个节点计算出新的 schema
    // 因为 Schema 推导发生在流执行时，这里我们可以先用一个空数组占位（UI 等运行结束后会更新）
    // 或者如果不想在 UI 出现闪变，可以提前依据规则推导出列
    const initialOutCols = [
      ...originalSchema.filter(c => c.name !== sourceField),
      { name: `${newFieldPrefix}_1`, type: "string" }, // 先给个占位，运行后 UI 会更新
    ]

    return this.buildHandle(initialOutCols, inputData.columnMapping, generator.bind(null, this))
  }
}
