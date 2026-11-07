import { BaseJsOperator } from "./BaseJsOperator.js"
import { parse } from "../../../expression/Parser.js"
import { compile } from "../../../expression/Compile.js"

export class JsFormula extends BaseJsOperator {
  async execute(inputs, params, ctx) {
    const inputData = inputs[0]
    if (!inputData) return null
    const data = inputData.payload

    const { newField, expression } = params
    if (!newField || !expression) return inputData

    let fn
    try {
      fn = compile(parse(expression))
    } catch (err) {
      throw new Error(`公式语法错误: ${err.message}`)
    }

    const outCols = [...data.columns, { name: newField, type: "string" }]
    const columnMapping = { ...inputData.columnMapping, [newField]: [] }

    const generator = async function* (self) {
      for await (const chunk of self.pullStream(data, ctx.nodeId, ctx)) {
        const outRows = chunk.rows.map(row => {
          let val = null
          try {
            val = fn(row)
          } catch (e) {
            ctx.metrics.errorRows++
          }
          return { ...row, [newField]: val }
        })
        yield { columns: outCols, rows: outRows }
      }
    }

    return this.buildHandle(outCols, columnMapping, generator.bind(null, this))
  }
}
