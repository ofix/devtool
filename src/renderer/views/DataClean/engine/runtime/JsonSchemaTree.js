import { Trie } from "./Trie.js"

export class JsonSchemaTree {
  constructor(rawJson) {
    this.rawJson = rawJson
    this.trie = new Trie()
    this.currentLine = 1
  }

  build() {
    if (this.rawJson === null || this.rawJson === undefined) return []

    // 初始化根节点
    if (Array.isArray(this.rawJson)) {
      this.trie.insert([], "array", this.rawJson.length, 1, this.currentLine)
    } else if (typeof this.rawJson === "object") {
      this.trie.insert([], "object", 0, 0, this.currentLine)
    }

    // 扫描样本
    const sample = Array.isArray(this.rawJson) ? this.rawJson.slice(0, 1000) : [this.rawJson]
    for (const item of sample) {
      this._traverse(item, [], 0)
    }

    // 转换为 UI 结构
    return this._toUIArray(this.trie.root)
  }

  _traverse(val, currentPath, itemIndex) {
    if (val === null || val === undefined) {
      this.trie.insert(currentPath, "null", 0, 0, this.currentLine)
      return
    }

    if (Array.isArray(val)) {
      let depth = 1
      let cur = val
      while (Array.isArray(cur) && cur.length > 0) {
        cur = cur[0]
        if (Array.isArray(cur)) depth++
      }
      if (currentPath.length > 0) {
        this.trie.insert(currentPath, "array", val.length, depth, this.currentLine)
      }

      // 对于数组，内部元素统一挂载到 *
      const itemPath = [...currentPath, "*"]
      for (const item of val) {
        this._traverse(item, itemPath, itemIndex)
      }
      return
    }

    if (typeof val === "object") {
      this.trie.insert(currentPath, "object", 0, 0, this.currentLine)
      this.currentLine++
      for (const [key, childVal] of Object.entries(val)) {
        this.currentLine++
        this._traverse(childVal, [...currentPath, key], itemIndex)
      }
      this.currentLine++
      return
    }

    this.trie.insert(currentPath, typeof val, 0, 0, this.currentLine)
    this.currentLine++
  }

  _toUIArray(node) {
    const arr = []

    // 如果是根节点，强制返回一个 root 节点，把它的类型带出去
    if (node === this.trie.root) {
      const rootType = this._getTypeLabel(node)
      const countTag =
        node.types.has("array") && node.arrayCount > 0 ? `[${node.arrayCount}]` : null

      // 根节点的 children 其实是 * 节点下的内容
      const childrenArr = []
      for (const [key, child] of node.children.entries()) {
        if (key === "*") {
          // 将 * 的子元素展平放进根
          const subArr = this._toUIArray(child)
          childrenArr.push(...subArr)
        } else {
          // 如果根节点直接挂了非 * 的 key（如纯对象的属性）
          childrenArr.push(...this._toUIArray({ children: new Map([[key, child]]) }))
        }
      }

      return [
        {
          label: "root",
          typeLabel: rootType,
          countTag,
          path: "root",
          firstLine: 1,
          children: childrenArr,
        },
      ]
    }

    // 普通节点处理
    for (const [key, child] of node.children.entries()) {
      if (key === "*") {
        // 如果遇到 *，直接将其子元素往上提，不展示 *
        const subArr = this._toUIArray(child)
        arr.push(...subArr)
        continue
      }

      let typeLabel = this._getTypeLabel(child)
      let countTag =
        child.types.has("array") && child.arrayCount > 0 ? `[${child.arrayCount}]` : null

      arr.push({
        label: child.key,
        typeLabel,
        countTag,
        path: child.path,
        firstLine: child.firstLine,
        children: this._toUIArray(child),
      })
    }
    return arr
  }

  _getTypeLabel(node) {
    if (node.types.size === 0) return "unknown"
    if (node.types.has("array")) {
      return node.arrayDepth > 1 ? `[+${node.arrayDepth}]` : "[]"
    }
    if (node.types.has("object") && node.types.size === 1) return "{}"
    if (node.types.size === 1) return Array.from(node.types)[0]
    return `mixed(${Array.from(node.types).join("|")})`
  }
}
