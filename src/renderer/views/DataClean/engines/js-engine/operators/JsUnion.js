import { BaseJsOperator } from "./BaseJsOperator.js"

export class JsUnion extends BaseJsOperator {
  async execute(inputs, params, ctx) {
    if (!inputs || inputs.length === 0) return null

    const skipError = params.skipErrorStream === true
    const baseSchema = inputs[0].schema
    const columnMapping = { ...inputs[0].columnMapping }

    const generator = async function* (self) {
      // 严格按照输入的顺序，串行拉取
      for (let i = 0; i < inputs.length; i++) {
        const inputData = inputs[i]
        if (!inputData) continue
        if (ctx.signal.aborted) return

        // 提取真实的流
        const streamDataset = inputData.payload.streamDataset
        if (!streamDataset) {
          if (ctx.log) ctx.log(`[JsUnion] 第 ${i} 路流为空，跳过`, "warn")
          continue
        }

        try {
          for await (const chunk of self.pullStream(streamDataset, ctx.nodeId, ctx)) {
            if (ctx.signal.aborted) return
            yield chunk
          }
        } catch (err) {
          ctx.metrics.errorRows++
          console.error(`[JsUnion] 第 ${i} 路流读取失败:`, err)

          if (!skipError) {
            // 默认策略：一票否决
            throw new Error(`Union 输入流 ${i} 异常终止: ${err.message}`)
          } else {
            // 容错策略：忽略该流，继续下一个
            if (ctx.log) ctx.log(`[JsUnion] 忽略异常流 ${i}，继续执行后续流`, "warn")
          }
        }
      }
    }

    if (ctx.log) ctx.log(`[JsUnion] 准备合并 ${inputs.length} 路数据流...`)

    return this.buildHandle(baseSchema, columnMapping, generator.bind(null, this))
  }
}
