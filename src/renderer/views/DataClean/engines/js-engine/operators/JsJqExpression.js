import { BaseJsOperator } from "./BaseJsOperator.js"
// 假设你有一个封装好的 JQ 执行器
import { executeJq } from "../runtime/JqHelper.js"

export class JsJqExpression extends BaseJsOperator {
  async execute(inputs, params, ctx) {
    const inputData = inputs[0]
    if (!inputData) throw new Error("未接收到数据")

    // 1. 获取上游的 JSON（如果是 Table，会直接报错，符合强类型契约）
    const inputJson = await this.getUpstreamJson(inputData)
    const jqCode = params.jqCode || "."

    if (ctx.log) ctx.log(`[JQ] 执行表达式: ${jqCode}`)

    // 2. 调用 JQ 引擎处理
    let outJson
    try {
      outJson = await executeJq(inputJson, jqCode)
    } catch (e) {
      throw new Error(`JQ 语法错误: ${e.message}`)
    }

    // 3. 返回 JSON 句柄给下游
    // 注意：如果下游是 Table 算子，UI 层会拦截；如果下游是 JQ 或 JSON Extractor，就能正常接上。
    return this.buildJsonHandle(outJson)
  }
}
