// 词法分析器：将表达式字符串转为 Token 数组
// 规则：支持裸写字段、方括号字段、AND/OR/NOT、比较符、字符串常量、数字、括号

const KEYWORDS = [
  "AND",
  "OR",
  "NOT",
  "CONTAINS",
  "STARTSWITH",
  "ENDSWITH",
  "IN",
  "IS",
  "NULL",
  "TRUE",
  "FALSE",
]
const OPERATORS = ["=", "!=", ">", "<", ">=", "<=", "&&", "||", "!"]

export function tokenize(text) {
  const tokens = []
  let i = 0
  const len = text.length

  while (i < len) {
    const ch = text[i]

    // 跳过空白
    if (/\s/.test(ch)) {
      i++
      continue
    }

    // 括号
    if (ch === "(" || ch === ")") {
      tokens.push({ type: "Paren", value: ch })
      i++
      continue
    }

    // 字符串双引号
    if (ch === '"') {
      let str = ""
      i++
      while (i < len && text[i] !== '"') {
        if (text[i] === "\\") {
          str += text[i + 1]
          i += 2
        } else {
          str += text[i]
          i++
        }
      }
      if (i >= len) throw new Error("字符串未闭合")
      i++ // 跳过结尾的双引号
      tokens.push({ type: "String", value: str })
      continue
    }

    // 方括号字段 [customer name]
    if (ch === "[") {
      let str = ""
      i++
      while (i < len && text[i] !== "]") {
        str += text[i]
        i++
      }
      if (i >= len) throw new Error("方括号未闭合")
      i++ // 跳过 ]
      tokens.push({ type: "Field", value: str, isBracket: true })
      continue
    }

    // 数字
    if (/[0-9]/.test(ch) || (ch === "-" && /[0-9]/.test(text[i + 1]))) {
      let num = ""
      if (ch === "-") {
        num += "-"
        i++
      }
      while (i < len && /[0-9.]/.test(text[i])) {
        num += text[i]
        i++
      }
      tokens.push({ type: "Number", value: num })
      continue
    }

    // 操作符（多字符优先）
    let matchedOp = false
    for (const op of OPERATORS) {
      if (text.slice(i, i + op.length) === op) {
        tokens.push({ type: "Operator", value: op })
        i += op.length
        matchedOp = true
        break
      }
    }
    if (matchedOp) continue

    // 标识符（字段、关键字或通配符）
    if (/[a-zA-Z_\u4e00-\u9fa5]/.test(ch)) {
      let id = ""
      while (i < len && /[a-zA-Z0-9_\u4e00-\u9fa5.*\[\]]/.test(text[i])) {
        // 遇到方括号处理嵌套 (如 items[0])
        if (text[i] === "[") {
          let bracket = ""
          while (i < len && text[i] !== "]") {
            bracket += text[i]
            i++
          }
          bracket += "]"
          i++
          id += bracket
        } else {
          id += text[i]
          i++
        }
      }

      // 判断是不是关键字
      const upper = id.toUpperCase()
      if (KEYWORDS.includes(upper)) {
        // 检查 IS NULL 组合
        if (upper === "IS") {
          let nextIdx = i
          while (nextIdx < len && /\s/.test(text[nextIdx])) nextIdx++
          if (text.slice(nextIdx, nextIdx + 4).toUpperCase() === "NULL") {
            tokens.push({ type: "Operator", value: "IS NULL" })
            i = nextIdx + 4
            continue
          } else if (text.slice(nextIdx, nextIdx + 7).toUpperCase() === "NOT NULL") {
            tokens.push({ type: "Operator", value: "IS NOT NULL" })
            i = nextIdx + 7
            continue
          }
        }
        tokens.push({ type: "Keyword", value: upper })
      } else {
        tokens.push({ type: "Field", value: id, isBracket: false })
      }
      continue
    }

    throw new Error(`无法识别的字符: ${ch}`)
  }

  tokens.push({ type: "EOF", value: null })
  return tokens
}
