// 修复：在执行前，确保节点参数被正确加载，并在出错时提供详细日志
export function topoSort(nodes, edges) {
  const indegree = new Map()
  const adj = new Map()
  const nodeIds = new Set()

  for (const n of nodes) {
    indegree.set(n.id, 0)
    adj.set(n.id, [])
    nodeIds.add(n.id)
  }
  for (const e of edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue
    indegree.set(e.target, indegree.get(e.target) + 1)
    adj.get(e.source).push(e.target)
  }
  const queue = []
  for (const [id, deg] of indegree.entries()) {
    if (deg === 0) queue.push(id)
  }
  const order = []
  while (queue.length > 0) {
    const id = queue.shift()
    order.push(id)
    for (const next of adj.get(id)) {
      const deg = indegree.get(next) - 1
      indegree.set(next, deg)
      if (deg === 0) queue.push(next)
    }
  }
  return order
}

export function hasCycle(nodes, edges) {
  return topoSort(nodes, edges).length !== nodes.length
}

export default class Scheduler {
  constructor(engine) {
    this.engine = engine
    this.running = false
  }

  async runAll(nodes, edges, context = {}) {
    if (this.running) return
    this.running = true
    try {
      if (hasCycle(nodes, edges)) {
        if (context.log) context.log("检测到环路，无法执行", "error")
        return
      }
      const order = topoSort(nodes, edges)
      for (let i = 0; i < order.length; i++) {
        const id = order[i]
        // 取出最新的参数快照传给 Engine
        const node = nodes.find(n => n.id === id)
        if (!node) continue

        const nodeContext = {
          log: context.log,
          rawText: context.rawTextByNode ? context.rawTextByNode[id] : undefined,
        }

        // Engine 执行
        await this.engine.runNode(id, nodeContext)

        if (context.onProgress) {
          context.onProgress({ current: i + 1, total: order.length, nodeId: id })
        }
        await new Promise(r => setTimeout(r, 0))
      }
    } finally {
      this.running = false
    }
  }

  async runFrom(startId, nodes, edges, context = {}) {
    if (this.running) return
    this.running = true
    try {
      if (hasCycle(nodes, edges)) return
      const order = topoSort(nodes, edges)
      const idx = order.indexOf(startId)
      if (idx < 0) return

      const sub = order.slice(idx)
      for (let i = 0; i < sub.length; i++) {
        const id = sub[i]
        const node = nodes.find(n => n.id === id)
        if (!node) continue

        const nodeContext = {
          log: context.log,
          rawText: context.rawTextByNode ? context.rawTextByNode[id] : undefined,
        }
        await this.engine.runNode(id, nodeContext)
        if (context.onProgress) {
          context.onProgress({ current: i + 1, total: sub.length, nodeId: id })
        }
        await new Promise(r => setTimeout(r, 0))
      }
    } finally {
      this.running = false
    }
  }
}
