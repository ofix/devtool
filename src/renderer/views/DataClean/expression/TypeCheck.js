// 类型检查：校验字段存在性、操作符与类型是否兼容
// 返回 AST 节点，如果有错则抛出 Error

const STRING_OPS = ["CONTAINS", "STARTSWITH", "ENDSWITH"]
const NUMBER_OPS = [">", "<", ">=", "<="]

export function typeCheck(ast, columns) {
  const colMap = new Map(columns.map(c => [c.name, c.type]))

  function walk(node) {
    if (node.type === "Literal") return "unknown"

    if (node.type === "Identifier") {
      // 忽略 JSON 路径的后缀部分，只看根字段是否存在
      const rootName = node.name.split(".")[0].split("[")[0]
      if (!colMap.has(rootName)) {
        throw new Error(`字段 "${rootName}" 不存在`)
      }
      return colMap.get(rootName)
    }

    if (node.type === "UnaryExpression") {
      walk(node.argument)
      return "boolean"
    }

    if (node.type === "BinaryExpression") {
      const leftType = walk(node.left)
      const rightType = walk(node.right)
      const op = node.operator

      if (["AND", "&&", "OR", "||"].includes(op)) {
        return "boolean"
      }

      if (STRING_OPS.includes(op)) {
        if (leftType === "number" || leftType === "boolean" || leftType === "date") {
          throw new Error(`数值或日期字段不支持 ${op} 操作符`)
        }
      }
      if (NUMBER_OPS.includes(op)) {
        if (leftType === "string" || leftType === "boolean") {
          throw new Error(`字符串或布尔字段不支持 ${op} 操作符`)
        }
      }
      return "boolean"
    }
    return "unknown"
  }

  walk(ast)
  return ast // 如果没抛错，返回原 AST
}
