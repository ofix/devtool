import { getOperator } from "./operators/index.js"
import TaskContext from "./runtime/TaskContext.js"

export default class Scheduler {
  constructor({ graphStore, metaStore, engine }) {
    this.graphStore = graphStore
    this.metaStore = metaStore
    this.engine = engine

    // FIFO 队列与并发控制
    this.taskQueue = []
    this.activeTasks = new Map()
    this.maxHighPriorityConcurrency = 3
  }

  /**
   * 触发全量运行 / 局部预览 (统一入口)
   */
  async runTask(projectId, targetNodeId = null, mode = "preview", options = {}) {
    const priority = mode === "preview" ? "high" : "low"
    const ctx = new TaskContext(projectId, mode, priority)

    // 高优任务并发控制
    if (priority === "high" && this.activeTasks.size >= this.maxHighPriorityConcurrency) {
      return this._enqueueTask(projectId, targetNodeId, mode, ctx)
    }

    return this._executeChain(projectId, targetNodeId, mode, ctx, options)
  }

  _enqueueTask(projectId, targetNodeId, mode, ctx) {
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ projectId, targetNodeId, mode, ctx, resolve, reject })
      console.log(`[Scheduler] 任务排队中，当前队列长度: ${this.taskQueue.length}`)
    })
  }

  /**
   * 执行子图或全图
   */
  async _executeChain(projectId, targetNodeId, mode, ctx, options) {
    // 1. 收集要执行的节点
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
      // 全量运行：选所有节点（或者只选叶子节点倒推）
      this.graphStore.nodes.forEach(n => nodesToRun.add(n.id))
    }

    // 2. 拓扑排序
    const sortedNodes = this._topoSort(Array.from(nodesToRun))

    // 3. 清理目标节点及其下游的旧缓存
    this.engine.invalidateDownstream(targetNodeId)

    // 4. 依次执行
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

  /**
   * 取消高优任务或挂起低优任务
   */
  abortTask(taskId) {
    const task = this.activeTasks.get(taskId)
    if (task) task.abort("用户主动取消")
  }
}
