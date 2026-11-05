/**
 * 字段血缘图计算引擎
 * 采用 BFS（广度优先搜索）逆流而上，动态拼装 DAG（有向无环图）
 */
export default class LineageGraphManager {
  /**
   * 回溯完整血缘路径
   * @param {String} startNodeId 起点节点（通常是用户点击的那个预览面板对应的节点）
   * @param {String} startField 起点字段
   * @param {Object} graphStore Pinia Graph Store
   * @param {Object} datasetStore Pinia Dataset Store
   * @returns {Array} 拍平的链路节点列表 [{ nodeId, field, action, from }]
   */
  static traceUpstream(startNodeId, startField, graphStore, datasetStore) {
    console.log("========== 开始血缘追踪 ==========")
    console.log("起点 Node:", startNodeId, "起点 Field:", startField)

    const result = []
    const queue = [{ nodeId: startNodeId, field: startField, depth: 0, action: "target" }]
    const visited = new Set()

    while (queue.length > 0) {
      const current = queue.shift()
      const visitKey = `${current.nodeId}::${current.field}`
      if (visited.has(visitKey)) continue
      visited.add(visitKey)

      result.push({
        nodeId: current.nodeId,
        field: current.field,
        depth: current.depth,
        action: current.action,
      })

      const incomingEdges = graphStore.getIncomingEdges(current.nodeId)

      // 源头节点，停止向上
      if (incomingEdges.length === 0) {
        console.log(`[BFS] 节点 ${current.nodeId} 没有上游连线，判定为源头，停止追溯。`)
        continue
      }

      const dataset = datasetStore.getDataset(current.nodeId)
      console.log(
        `[BFS] 当前节点 ${current.nodeId} 的 dataset 状态:`,
        dataset ? "有数据" : "无数据",
      )

      if (!dataset) {
        console.log(`[BFS] ❌ 停止：节点 ${current.nodeId} 的 dataset 为空！`)
        continue
      }

      console.log(`[BFS] 当前节点 ${current.nodeId} 的 columnMapping:`, dataset.columnMapping)

      if (!dataset.columnMapping) {
        console.log(`[BFS] ❌ 停止：节点 ${current.nodeId} 的 columnMapping 为 undefined！`)
        continue
      }

      const mapping = dataset.columnMapping[current.field]
      if (!mapping) {
        console.log(`[BFS] ❌ 停止：在 mapping 中找不到当前字段 ${current.field}！`)
        continue
      }

      const sources = Array.isArray(mapping) ? mapping : [mapping]

      for (const srcField of sources) {
        for (const edge of incomingEdges) {
          const upstreamData = datasetStore.getDataset(edge.source)
          if (!upstreamData) {
            console.log(`[BFS] ⚠️ 上游节点 ${edge.source} 无数据，跳过。`)
            continue
          }

          const hasCol = upstreamData.columns && upstreamData.columns.some(c => c.name === srcField)
          console.log(`[BFS] 检查上游节点 ${edge.source} 是否有字段 '${srcField}':`, hasCol)

          if (hasCol) {
            queue.push({
              nodeId: edge.source,
              field: srcField,
              depth: current.depth + 1,
              action: srcField === current.field ? "pass" : "rename",
            })
          }
        }
      }
    }

    console.log("========== 追踪结束，最终链路 ==========", result.reverse())
    return result.reverse()
  }

  /**
   * 影响分析（顺流而下）
   * @param {String} startNodeId 起点节点
   * @param {String} startField 起点字段
   * @param {Object} graphStore
   * @param {Object} datasetStore
   */
  static traceDownstream(startNodeId, startField, graphStore, datasetStore) {
    const result = []
    const queue = [{ nodeId: startNodeId, field: startField, depth: 0 }]
    const visited = new Set()

    while (queue.length > 0) {
      const current = queue.shift()
      const visitKey = `${current.nodeId}::${current.field}`
      if (visited.has(visitKey)) continue
      visited.add(visitKey)

      result.push(current)

      // 找下游节点
      const outgoingEdges = graphStore.getOutgoingEdges(current.nodeId)
      for (const edge of outgoingEdges) {
        const downstreamData = datasetStore.getDataset(edge.target)
        if (!downstreamData || !downstreamData.columnMapping) continue

        // 遍历下游节点的 mapping，看看谁依赖了 current.field
        for (const [targetField, sourceMapping] of Object.entries(downstreamData.columnMapping)) {
          const sources = Array.isArray(sourceMapping) ? sourceMapping : [sourceMapping]
          if (sources.includes(current.field)) {
            queue.push({
              nodeId: edge.target,
              field: targetField,
              depth: current.depth + 1,
            })
          }
        }
      }
    }
    return result
  }
}
