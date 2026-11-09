import { BaseJsOperator } from "./BaseJsOperator.js"

export class JsUnique extends BaseJsOperator {
  async execute(inputs, params, ctx) {
    const inputData = inputs[0]
    if (!inputData) return null

    // 核心修复 1：从 inputData 直接取 schema，并从 payload 里提取真正的 streamDataset
    const schema = inputData.schema
    const streamDataset = inputData.payload.streamDataset

    let keyFields = params.keyFields || []
    if (keyFields.length === 0) {
      keyFields = schema.map(c => c.name)
    }

    const generator = async function* (self) {
      const seen = new Set()

      // 核心修复 2：传入 streamDataset
      for await (const chunk of self.pullStream(streamDataset, ctx.nodeId, ctx)) {
        const outRows = []
        for (const row of chunk.rows) {
          const key = keyFields.map(f => String(row[f])).join("|||")
          if (!seen.has(key)) {
            seen.add(key)
            outRows.push(row)
          }
        }
        if (outRows.length > 0) {
          // 使用正确的 schema 名
          yield { columns: schema, rows: outRows }
        }
      }
    }

    return this.buildHandle(schema, inputData.columnMapping, generator.bind(null, this))
  }
}
