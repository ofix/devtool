// ==== FILE: src/renderer/views/DataClean/engine/operators/filter.js ====
import { parse } from "../../expression/Parser.js"
import { compile } from "../../expression/Compile.js"

export default {
  type: "filter",
  meta: {
    label: "Filter",
    icon: "IconFilter",
    color: "#f59e0b",
    category: "prepare",
    inputs: 1,
    outputs: 2,
    inputPortType: "table",
    outputPortType: "table",
  },
  schema: [{ field: "expression", label: "条件", component: "expression" }],
  execute(inputs, params, ctx) {
    const data = inputs[0]
    if (!data || !data.rows) return { rows: [], columns: [], _falseRows: [] }

    const exprText = params.expression
    if (!exprText || !exprText.trim()) {
      return { rows: data.rows, columns: data.columns, _falseRows: [] }
    }

    let ast, fn
    try {
      ast = parse(exprText)
      fn = compile(ast)
    } catch (err) {
      throw new Error(`表达式语法错误: ${err.message}`)
    }

    const trueRows = []
    const falseRows = []
    for (const row of data.rows) {
      try {
        if (fn(row)) trueRows.push(row)
        else falseRows.push(row)
      } catch (e) {
        console.error("Error evaluating expression for row:", row, e)
      }
    }

    if (ctx && typeof ctx.log === "function") {
      ctx.log(`[Filter] 满足: ${trueRows.length} 行, 不满足: ${falseRows.length} 行`)
    }

    return {
      rows: trueRows,
      columns: data.columns,
      _falseRows: falseRows,
    }
  },
}
