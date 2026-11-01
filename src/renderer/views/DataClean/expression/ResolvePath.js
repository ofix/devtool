// JSON 路径解析：用于在行对象中取值

export function resolvePath(row, path) {
  if (!row || typeof row !== "object") return undefined

  // 简单拆分，支持 items[0].sku 和 items[*].sku
  // 这里为了性能，不采用完整正则解析，而是利用快速替换
  // 将 a.b[0].c 转换为 ["a", "b", "0", "c"]
  const parts = []
  let cur = ""
  let inBracket = false

  for (let i = 0; i < path.length; i++) {
    const ch = path[i]
    if (ch === "[") {
      inBracket = true
      continue
    }
    if (ch === "]") {
      inBracket = false
      continue
    }
    if (ch === "." && !inBracket) {
      if (cur) parts.push(cur)
      cur = ""
      continue
    }
    cur += ch
  }
  if (cur) parts.push(cur)

  let current = row
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (current === null || current === undefined) return undefined

    if (part === "*") {
      // 处理通配符，返回数组
      if (!Array.isArray(current)) return undefined
      const restPath = parts.slice(i + 1).join(".")
      // 返回提取后的数组
      return current.map(item => resolvePath(item, restPath))
    }

    current = current[part]
  }
  return current
}
