import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import { parse } from "../../expression/Parser.js"
import { compile } from "../../expression/Compile.js"
import StreamDataset from "../runtime/StreamDataset.js"
import StreamController from "../runtime/StreamController.js"

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
    if (!exprText || !exprText.trim()) return data

    let fn
    try {
      const ast = parse(exprText)
      fn = compile(ast)
    } catch (err) {
      throw new Error(`表达式语法错误: ${err.message}`)
    }

    async function* filterGenerator() {
      let trueCount = 0
      let falseCount = 0

      // 使用 StreamController 获取数据，支持 1 对 N 的源分发
      const controller = new StreamController(data.controller.sourceGenerator, "rendezvous")
      const iterator = controller.createIterator("filter-node", ctx.signal)

      for await (const chunk of iterator) {
        if (ctx.signal.aborted) return

        const trueRows = []
        const falseRows = []
        for (const row of chunk.rows) {
          try {
            if (fn(row)) {
              trueRows.push(row)
              trueCount++
            } else {
              falseRows.push(row)
              falseCount++
            }
          } catch (e) {
            ctx.metrics.errorRows++ // 计入脏数据
            console.error("表达式求值错误", e)
          }
        }

        if (trueRows.length > 0) {
          yield { ...chunk, rows: trueRows }
        }
        // 如果定义了 _falseRows 通道，可在此处返回
        // if (falseRows.length > 0) { ... }

        // 让出主线程，防止 100 万行卡死
        await new Promise(resolve => setTimeout(resolve, 0))
      }

      if (ctx.log) ctx.log(`[Filter] 满足: ${trueCount} 行, 不满足: ${falseCount} 行`)
      // 👇 加这一行，看看到底匹配了多少
      console.log(`【Filter】最终匹配行数: ${trueCount}`)
    }

    return new StreamDataset({
      dataCategory: DATA_CATEGORY.TABLE,
      columns: data.columns,
      controller: { sourceGenerator: filterGenerator, strategy: "rendezvous" },
    })
  },
}
