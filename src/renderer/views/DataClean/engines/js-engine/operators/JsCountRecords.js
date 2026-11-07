import { BaseJsOperator } from "./BaseJsOperator.js"

export class JsCountRecords extends BaseJsOperator {
  async execute(inputs, params, ctx) {
    const inputData = inputs[0]
    if (!inputData) return null

    // 👇 核心修复 1：提取真实的流
    const streamDataset = inputData.payload.streamDataset
    const fieldName = params.newField || "count"

    const generator = async function* (self) {
      let count = 0

      // 👇 核心修复 2：使用 this.pullStream 拉取
      for await (const chunk of self.pullStream(streamDataset, ctx.nodeId, ctx)) {
        if (ctx.signal.aborted) return
        count += chunk.rows.length
        // 统计型算子，不向外吐数据，只做内部累加
      }

      // 全部读完，输出最终结果
      yield {
        columns: [{ name: fieldName, type: "number" }],
        rows: [{ [fieldName]: count }],
      }
    }

    if (ctx.log) ctx.log(`[JsCountRecords] 开始全量扫描计数...`)

    // 👇 核心修复 3：返回标准 DataHandle
    return this.buildHandle(
      [{ name: fieldName, type: "number" }],
      { [fieldName]: [] }, // 聚合列不继承单一血脉
      generator.bind(null, this),
    )
  }
}
