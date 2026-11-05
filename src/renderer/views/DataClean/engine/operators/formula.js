// Formula 算子：计算列，复用表达式系统
import { DATA_CATEGORY } from "../../constants/DataCategories.js"
import { parse } from "../../expression/Parser.js"
import { compile } from "../../expression/Compile.js"

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
  execute(inputs, params, ctx) {
    const data = inputs[0]
    if (!data || !data.rows) return { rows: [], columns: [], columnMapping: {} }

    const { newField, expression } = params
    if (!newField || !expression) return data

    let fn, ast
    try {
      ast = parse(expression)
      fn = compile(ast)
    } catch (err) {
      throw new Error(`公式语法错误: ${err.message}`)
    }

    const outRows = data.rows.map(row => {
      let val
      try {
        val = fn(row)
      } catch (e) {
        val = null
      }
      return { ...row, [newField]: val }
    })

    let newColType = "string"
    if (outRows.length > 0 && typeof outRows[0][newField] === "number") newColType = "number"
    if (outRows.length > 0 && typeof outRows[0][newField] === "boolean") newColType = "boolean"

    const outCols = [...data.columns, { name: newField, type: newColType }]

    // 构建血缘映射字典
    // 因为公式可以依赖任意数量的原有列，这里最简单的做法是：
    // 1. 原有列：直传映射
    // 2. 新增列：尝试从 AST 中提取依赖字段（如果 AST 树结构支持），否则标记为空数组

    const columnMapping = {}
    // 原有的列直传
    for (const c of data.columns) {
      columnMapping[c.name] = c.name
    }

    // 尝试提取依赖字段
    let dependencies = []
    try {
      // 这里的 extractVariables 是一个假设的方法，通常 AST 库都会提供
      // 如果你的 Parser 能提供字段提取能力，替换这里即可
      if (typeof ast.extractVariables === "function") {
        dependencies = ast.extractVariables()
      } else if (ast.type === "Identifier") {
        dependencies = [ast.name]
      } else if (ast.type === "BinaryExpression") {
        const left = ast.left.type === "Identifier" ? [ast.left.name] : []
        const right = ast.right.type === "Identifier" ? [ast.right.name] : []
        dependencies = [...left, ...right]
      }
    } catch (e) {
      console.warn("无法从公式中提取血缘依赖", e)
    }

    // 新列记录依赖来源
    columnMapping[newField] = dependencies

    return { rows: outRows, columns: outCols, columnMapping }
  },
}
