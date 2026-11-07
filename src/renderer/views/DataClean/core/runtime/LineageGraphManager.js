export default class LineageGraphManager {
  /**
   * 向上追溯血缘 (基于 columnMapping)
   */
  static traceUpstream(startNodeId, startField, graphStore, datasetStore) {
    const result = []
    const queue = [{ nodeId: startNodeId, field: startField, depth: 0 }]
    const visited = new Set()

    while (queue.length > 0) {
      const current = queue.shift()
      const key = `${current.nodeId}::${current.field}`
      if (visited.has(key)) continue
      visited.add(key)

      result.push(current)

      const dataset = datasetStore.getDataset(current.nodeId)
      if (!dataset) continue

      // 从底层 Dataset 获取该节点的 ColumnMapping
      const mapping = dataset.columnMapping
      if (!mapping) continue

      const sourceField = mapping[current.field]
      if (!sourceField) continue

      const sources = Array.isArray(sourceField) ? sourceField : [sourceField]
      const inEdges = graphStore.getIncomingEdges(current.nodeId)

      for (const src of sources) {
        for (const edge of inEdges) {
          const upstreamData = datasetStore.getDataset(edge.source)
          if (upstreamData && upstreamData.columns.some(c => c.name === src)) {
            queue.push({ nodeId: edge.source, field: src, depth: current.depth + 1 })
          }
        }
      }
    }

    // 按照链路顺序翻转
    return result.reverse()
  }
}
