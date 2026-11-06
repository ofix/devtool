import TaskContext from "./runtime/TaskContext.js"

export default class Scheduler {
  constructor({ graphStore, metaStore, engine }) {
    this.graphStore = graphStore
    this.metaStore = metaStore
    this.engine = engine

    this.taskQueue = []
    this.activeTasks = new Map()
    this.maxHighPriorityConcurrency = 3
  }

  async runTask(projectId, targetNodeId = null, mode = "preview", options = {}) {
    const priority = mode === "preview" ? "high" : "low"
    const ctx = new TaskContext(projectId, mode, priority)

    if (priority === "high" && this.activeTasks.size >= this.maxHighPriorityConcurrency) {
      return this._enqueueTask(projectId, targetNodeId, mode, ctx)
    }

    return this._executeChain(projectId, targetNodeId, mode, ctx, options)
  }

  _enqueueTask(projectId, targetNodeId, mode, ctx) {
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ projectId, targetNodeId, mode, ctx, resolve, reject })
    })
  }

  async _executeChain(projectId, targetNodeId, mode, ctx, options) {
    const nodesToRun = new Set()
    const collectUpstream = nodeId => {
      if (nodesToRun.has(nodeId)) return
      nodesToRun.add(nodeId)
      const inEdges = this.graphStore.getIncomingEdges(nodeId)
      for (const edge of inEdges) collectUpstream(edge.source)
    }

    if (targetNodeId) {
      collectUpstream(targetNodeId)
    } else {
      this.graphStore.nodes.forEach(n => nodesToRun.add(n.id))
    }

    const sortedNodes = this._topoSort(Array.from(nodesToRun))

    // 👇 每次执行前，清空 runCache（流实例），但不清空 snapshotCache（底层全量数据依然复用）
    this.engine.runCache.clear()
    if (targetNodeId) {
      this.engine.invalidateDownstream(targetNodeId)
    }

    this.activeTasks.set(ctx.taskId, ctx)

    try {
      for (const nodeId of sortedNodes) {
        if (ctx.signal.aborted) throw new Error("用户取消任务")

        await this.engine.runNode(nodeId, {
          ...options,
          projectId,
          mode,
          taskContext: ctx,
        })
      }
      return true
    } finally {
      this.activeTasks.delete(ctx.taskId)
      this.engine.runCache.clear()
      this._processQueue()
    }
  }

  _processQueue() {
    if (this.taskQueue.length > 0 && this.activeTasks.size < this.maxHighPriorityConcurrency) {
      const nextTask = this.taskQueue.shift()
      this._executeChain(nextTask.projectId, nextTask.targetNodeId, nextTask.mode, nextTask.ctx, {})
        .then(nextTask.resolve)
        .catch(nextTask.reject)
    }
  }

  _topoSort(nodeIds) {
    const visited = new Set()
    const result = []
    const visit = id => {
      if (visited.has(id)) return
      visited.add(id)
      const edges = this.graphStore.getIncomingEdges(id)
      for (const edge of edges) visit(edge.source)
      result.push(id)
    }
    for (const id of nodeIds) visit(id)
    return result
  }

  abortTask(taskId) {
    const task = this.activeTasks.get(taskId)
    if (task) task.abort("用户主动取消")
  }
}
