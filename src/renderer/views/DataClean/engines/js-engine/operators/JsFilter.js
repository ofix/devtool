import { BaseJsOperator } from "./BaseJsOperator.js"
import { parse } from "../../../expression/Parser.js"
import { compile } from "../../../expression/Compile.js"

export class JsFilter extends BaseJsOperator {
  async execute(inputs, params, ctx) {
    const inputData = inputs[0]
    if (!inputData) return null
    const data = inputData.payload.streamDataset // 👈 注意这里，数据藏在 streamDataset 里

    const exprText = params.expression
    if (!exprText || !exprText.trim()) return inputData

    let fn
    try {
      const ast = parse(exprText)
      fn = compile(ast)
    } catch (err) {
      throw new Error(`表达式语法错误: ${err.message}`)
    }

    const generator = async function* (self) {
      const controller = new StreamController(data.controller.sourceGenerator, "rendezvous")
      const iterator = controller.createIterator("filter-node", ctx.signal)

      for await (const chunk of iterator) {
        if (ctx.signal.aborted) return
        const trueRows = []
        for (const row of chunk.rows) {
          try {
            if (fn(row)) trueRows.push(row)
          } catch (e) {
            if (ctx.metrics) ctx.metrics.errorRows++
          }
        }
        if (trueRows.length > 0) {
          yield { columns: chunk.columns, rows: trueRows }
        }
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }

    // 使用 BaseJsOperator 里的 buildHandle
    return this.buildHandle(inputData.schema, inputData.columnMapping, generator.bind(null, this))
  }
}
