import { BaseJsOperator } from "./BaseJsOperator.js"

export class JsSample extends BaseJsOperator {
  async execute(inputs, params, ctx) {
    const inputHandle = inputs[0]
    if (!inputHandle) return null

    const n = parseInt(params.count, 10)
    if (isNaN(n) || n <= 0) return inputHandle

    // 元数据直接从顶层句柄拿，payload只放流引用
    const { schema, columnMapping } = inputHandle
    const upstreamStream = inputHandle.payload.streamDataset

    const stream = async function* () {
      let count = 0
      for await (const chunk of this.pullStream(upstreamStream, ctx.nodeId, ctx)) {
        const takeCount = Math.min(n - count, chunk.rows.length)
        const outRows = chunk.rows.slice(0, takeCount)
        count += takeCount

        if (outRows.length > 0) {
          yield { columns: schema, rows: outRows }
        }
        if (count >= n) break
      }
    }.bind(this)

    return this.buildHandle(schema, columnMapping, stream())
  }
}
