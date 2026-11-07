export default class Scheduler {
  constructor({ engine, graphStore, metaStore, previewStore }) {
    this.engine = engine
    this.graphStore = graphStore
    this.metaStore = metaStore
    this.previewStore = previewStore
  }

  async execute(projectId, targetNodeId, runMode, ctx) {
    // 1. 收集要运行的节点
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

    // 2. 拓扑排序
    const sortedNodes = this._topoSort(Array.from(nodesToRun))

    // 3. 执行并缓存 Handle
    const handleCache = new Map()

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

        // 从引擎获取对应的执行器
        const executor = this.engine.getExecutor(node.type)

        // 执行算子
        ctx.log(`准备执行节点: ${node.type} (${nodeId})`)
        const startTime = performance.now()

        const resultHandle = await executor.execute(inputs, node.params || {}, ctx)

        const duration = performance.now() - startTime
        ctx.log(`节点 ${node.type} 执行完毕，耗时 ${duration.toFixed(2)}ms`)

        // 存入缓存
        handleCache.set(nodeId, resultHandle)

        // 更新 UI 的节点元数据
        this.metaStore.updateMeta(nodeId, {
          columns: resultHandle.schema || [],
          rowCount: resultHandle.rowCount || -1,
          dataCategory: resultHandle.dataCategory,
          stale: false,
          error: null,
        })

        // 如果当前节点就是用户要看的目标节点
        if (nodeId === targetNodeId && runMode === "preview") {
          ctx.log(`正在拉取节点 ${node.type} 的预览数据...`)
          // 让引擎去拉取前 1000 行（根据具体引擎内部实现）
          const previewRows = await this.engine.getPreviewData(nodeId, resultHandle.payload, 1000)

          // 存进 UI Store
          this.previewStore.setPreviewData(
            projectId,
            nodeId,
            {
              rows: previewRows,
              columns: resultHandle.schema,
            },
            Date.now().toString(),
          )
        }
      }
    } catch (err) {
      ctx.log(`执行中断: ${err.message}`, "error")
      throw err
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
}
