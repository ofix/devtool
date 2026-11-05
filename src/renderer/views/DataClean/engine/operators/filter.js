import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import { parse } from "../../expression/Parser.js"
import { compile } from "../../expression/Compile.js"
import StreamDataset from "../runtime/StreamDataset.js"

export default {
  type: "filter",
  meta: {
    label: "Filter",
    icon: "IconFilter",
    color: "#f59e0b",
    category: "prepare",
    inputs: 1,
    outputs: 2,
    inputCategory: DATA_CATEGORY.TABLE,
    outputCategory: DATA_CATEGORY.TABLE,
  },
  schema: [{ field: "expression", label: "条件", component: "expression" }],
  async execute(inputs, params, ctx) {
    const data = inputs[0]
    if (!data) return null

    const exprText = params.expression
    // 如果无表达式，原样透传流
    if (!exprText || !exprText.trim()) {
      return data
    }

    let fn
    try {
      const ast = parse(exprText)
      fn = compile(ast)
    } catch (err) {
      throw new Error(`表达式语法错误: ${err.message}`)
    }

    // 👇 核心：定义流式处理生成器
    async function* filterGenerator() {
      let trueCount = 0,
        falseCount = 0
      for await (const chunk of data) {
        const trueRows = []
        const falseRows = []
        for (const row of chunk) {
          try {
            if (fn(row)) {
              trueRows.push(row)
              trueCount++
            } else {
              falseRows.push(row)
              falseCount++
            }
          } catch (e) {
            console.error("表达式求值错误", e)
          }
        }
        // 目前简化处理：只 yield 满足条件的数据。如果后续有 False 分支，需要更复杂的路由。
        if (trueRows.length > 0) {
          yield trueRows
        }
      }
      if (ctx?.log) ctx.log(`[Filter 流式] 满足: ${trueCount} 行, 不满足: ${falseCount} 行`)
    }

    return new StreamDataset({
      dataCategory: DATA_CATEGORY.TABLE,
      columns: data.columns,
      generator: filterGenerator,
    })
  },
}
