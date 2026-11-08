import TaskContext from "./runtime/TaskContext.js"

export default class Scheduler {
  constructor({ engine, graphStore, metaStore, previewStore }) {
    this.engine = engine
    this.graphStore = graphStore
    this.metaStore = metaStore
    this.previewStore = previewStore
    this.activeTasks = new Map()
  }

  /**
   * 执行任务（全量或局部预览）
   */
  async runTask(projectId, targetNodeId = null, runMode = "preview", options = {}) {
    const ctx = new TaskContext(projectId, runMode, runMode === "preview" ? "high" : "low")
    ctx.log = options.log || ((msg, level = "info") => console.log(`[Scheduler]`, msg))

    // 收集节点
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

    // 拓扑排序
    const sortedNodes = this._topoSort(Array.from(nodesToRun))
    const handleCache = new Map()
    this.activeTasks.set(ctx.taskId, ctx)

    try {
      for (const nodeId of sortedNodes) {
        if (ctx.signal.aborted) throw new Error("任务被用户取消")
        const node = this.graphStore.getNode(nodeId)

        // 收集上游 inputs
        const inputs = []
        const inEdges = this.graphStore.getIncomingEdges(nodeId)
        for (const edge of inEdges) {
          const handle = handleCache.get(edge.source)
          if (handle) inputs.push(handle)
        }

        ctx.log(`执行节点: ${node.type} (${nodeId})`)
        const startTime = performance.now()

        // 👇 直接调用 Engine 去执行单节点
        const resultHandle = await this.engine.runNode(node.type, inputs, node.params || {}, ctx)

        const duration = performance.now() - startTime
        ctx.log(`节点执行完成，耗时 ${duration.toFixed(2)}ms`)

        handleCache.set(nodeId, resultHandle)

        // 更新元数据
        this.metaStore.updateMeta(nodeId, {
          columns: resultHandle.schema || [],
          rowCount: resultHandle.rowCount || -1,
          dataCategory: resultHandle.dataCategory,
          stale: false,
          error: null,
        })

        // 拉取预览
        if (nodeId === targetNodeId && runMode === "preview") {
          ctx.log(`正在拉取节点预览数据...`)
          const previewRows = await this.engine.getPreviewData(resultHandle.payload, 1000)

          if (resultHandle.dataCategory === "json") {
            this.previewStore.setPreviewData(
              projectId,
              nodeId,
              {
                json: previewRows,
                columns: [],
              },
              Date.now().toString(),
            )
          } else {
            this.previewStore.setPreviewData(
              projectId,
              nodeId,
              {
                rows: previewRows,
                columns: resultHandle.schema || [],
              },
              Date.now().toString(),
            )
          }
        }
      }
    } catch (err) {
      ctx.log(`执行中断: ${err.message}`, "error")
      throw err
    } finally {
      this.activeTasks.delete(ctx.taskId)
    }
  }

  abortTask(taskId) {
    const task = this.activeTasks.get(taskId)
    if (task) task.abort("用户主动取消")
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
}
