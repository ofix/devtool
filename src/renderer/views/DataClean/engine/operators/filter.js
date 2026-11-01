// 增加：过滤前后的行数日志反馈
import { parse } from "../../expression/Parser.js"
import { typeCheck } from "../../expression/TypeCheck.js"
import { compile } from "../../expression/Compile.js"

export default {
  type: "filter",
  meta: {
    label: "Filter",
    icon: "IconFilter",
    color: "#f59e0b",
    category: "prepare",
    inputs: 1,
    outputs: 1,
    inputPortType: "table",
    outputPortType: "table",
  },
  schema: [{ field: "expression", label: "条件", component: "expression" }],
  execute(inputs, params, ctx) {
    const data = inputs[0]
    if (!data || !data.rows) return { rows: [], columns: [] }
    const exprText = params.expression
    if (!exprText || !exprText.trim()) return data

    let ast, fn
    try {
      ast = parse(exprText)
      if (data.columns && data.columns.length > 0) typeCheck(ast, data.columns)
      fn = compile(ast)
    } catch (err) {
      throw new Error(`表达式语法错误: ${err.message}`)
    }

    const filteredRows = []
    for (const row of data.rows) {
      try {
        if (fn(row)) filteredRows.push(row)
      } catch (e) {}
    }

    if (ctx && typeof ctx.log === "function") {
      ctx.log(`过滤前行数: ${data.rows.length}，过滤后行数: ${filteredRows.length}`)
    }
    return { rows: filteredRows, columns: data.columns }
  },
}
