import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import { parse } from "../../expression/Parser.js"
import { compile } from "../../expression/Compile.js"
import StreamDataset from "../runtime/StreamDataset.js"
import StreamController from "../runtime/StreamController.js"

export default {
  type: "formula",
  meta: {
    label: "Formula",
    icon: "IconCalculator",
    color: "#eab308",
    category: "prepare",
    inputs: 1,
    outputs: 1,
    inputCategory: DATA_CATEGORY.TABLE,
    outputCategory: DATA_CATEGORY.TABLE,
  },
  schema: [
    { field: "newField", label: "输出列名", component: "input" },
    { field: "expression", label: "公式", component: "expression" },
  ],
  async execute(inputs, params, ctx) {
    const data = inputs[0]
    if (!data) return null

    const { newField, expression } = params
    if (!newField || !expression) return data

    let fn, ast
    try {
      ast = parse(expression)
      fn = compile(ast)
    } catch (err) {
      throw new Error(`公式语法错误: ${err.message}`)
    }

    // 此处简单推断类型，真实生产可通过首块数据探测
    const outCols = [...data.columns, { name: newField, type: "string" }]
    const columnMapping = {
      ...data.columnMapping,
      [newField]: [] /* 依赖由 AST 解析注入，此处简化 */,
    }

    async function* formulaGenerator() {
      const controller = new StreamController(data.controller.sourceGenerator, "rendezvous")
      const iterator = controller.createIterator("formula-node", ctx.signal)

      for await (const chunk of iterator) {
        if (ctx.signal.aborted) return

        const outRows = chunk.rows.map(row => {
          let val
          try {
            val = fn(row)
          } catch (e) {
            val = null
            ctx.metrics.errorRows++
          }
          return { ...row, [newField]: val }
        })

        yield { columns: outCols, rows: outRows }
        await new Promise(resolve => setTimeout(resolve, 0)) // 让出主线程
      }
    }

    return new StreamDataset({
      dataCategory: DATA_CATEGORY.TABLE,
      columns: outCols,
      controller: { sourceGenerator: formulaGenerator, strategy: "rendezvous" },
      columnMapping,
    })
  },
}
