export class TrieNode {
  constructor(key, path) {
    this.key = key
    this.path = path
    this.children = new Map()
    this.types = new Set()
    this.arrayCount = 0
    this.arrayDepth = 0
    this.firstLine = -1
  }
}

export class Trie {
  constructor() {
    this.root = new TrieNode("root", "root")
  }

  insert(pathParts, type, arrayCount = 0, arrayDepth = 0, line = -1) {
    let current = this.root
    let currentPath = "root"

    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i]
      currentPath = currentPath === "root" ? part : `${currentPath}.${part}`

      if (!current.children.has(part)) {
        current.children.set(part, new TrieNode(part, currentPath))
      }
      current = current.children.get(part)

      if (current.firstLine === -1 && line !== -1) {
        current.firstLine = line
      }
    }

    current.types.add(type)
    if (type === "array") {
      current.arrayCount = Math.max(current.arrayCount, arrayCount)
      current.arrayDepth = Math.max(current.arrayDepth, arrayDepth)
    }
  }
}
