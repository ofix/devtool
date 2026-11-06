import { markRaw } from "vue"
import { getOperator } from "./operators/index.js"
import { inferDataCategory } from "./runtime/InferCategory.js"
import { DATA_CATEGORY } from "../constants/DataCategories.js"
import { JsonSchemaTree } from "./runtime/JsonSchemaTree.js"
import InMemoryDataset from "./runtime/InMemoryDataset.js"
import TaskContext from "./runtime/TaskContext.js"
import StreamController from "./runtime/StreamController.js"

export default class Engine {
  constructor({ metaStore, previewStore, graphStore }) {
    this.metaStore = metaStore
    this.previewStore = previewStore
    this.graphStore = graphStore

    // 执行期间的流转缓存
    this.runCache = new Map()
    // 👇 新增：全量源数据快照缓存 (key: `${filePath}::${encoding}`, value: { rows, columns })
    this.snapshotCache = new Map()
  }

  async runNode(nodeId, options = {}) {
    const node = this.graphStore.getNode(nodeId)
    if (!node) return null

    const op = getOperator(node.type)
    if (!op) return null

    const inputs = []
    const incoming = this.graphStore.getIncomingEdges(nodeId)

    if (op.meta.inputs > 0) {
      for (const edge of incoming) {
        let upstreamData = this.runCache.get(edge.source)

        if (!upstreamData) {
          const previewData = this.previewStore.getPreviewData(
            options.projectId || "default",
            edge.source,
          )
          if (previewData) {
            upstreamData = new InMemoryDataset({
              dataCategory: previewData.dataCategory || DATA_CATEGORY.TABLE,
              rows: previewData.rows || [],
              columns: previewData.columns || [],
            })
          }
        }

        if (!upstreamData) {
          inputs.push(
            new InMemoryDataset({ dataCategory: DATA_CATEGORY.TABLE, rows: [], columns: [] }),
          )
          continue
        }

        const expected = op.meta.inputCategory
        if (expected && expected !== "dynamic" && upstreamData.dataCategory !== expected) {
          throw new Error(
            `输入类型不匹配：算子 [${node.type}] 需要 [${expected}]，但上游是 [${upstreamData.dataCategory}]`,
          )
        }

        inputs.push(upstreamData)
      }

      if (incoming.length === 0) {
        this.metaStore.markStale(nodeId, "缺少上游连线")
        return null
      }
    }

    const ctx =
      options.taskContext ||
      new TaskContext(options.projectId || "default", options.mode || "preview")
    ctx.log = options.log || ((msg, level = "info") => console.log(`[${node.type}]`, msg))
    // 👇 将 snapshotCache 和 nodeId 注入 ctx，供 CSV Reader 等源节点读取/写入缓存
    ctx.snapshotCache = this.snapshotCache
    ctx.nodeId = nodeId

    try {
      const result = await op.execute(inputs, node.params || {}, ctx)
      if (!result) return null

      const finalCategory = result.dataCategory || inferDataCategory(result.rows)

      if (!result.columnMapping && result.columns) {
        result.columnMapping = {}
        for (const col of result.columns) {
          result.columnMapping[col.name] = col.name
        }
      }

      let finalDataset = result

      if (finalCategory === DATA_CATEGORY.TABLE) {
        if (result.isStream && (ctx.mode === "preview" || options.mode === "preview")) {
          const previewRows = []

          const streamControllerInstance = new StreamController(
            result.controller.sourceGenerator,
            result.controller.strategy || "rendezvous",
          )

          const iterator = streamControllerInstance.createIterator(
            `preview-interceptor-${nodeId}`,
            ctx.signal,
          )

          try {
            let scannedCount = 0

            for await (const chunk of iterator) {
              scannedCount += chunk.rows.length
              for (const row of chunk.rows) {
                previewRows.push(row)
                if (previewRows.length >= 1000) break
              }
              if (previewRows.length >= 1000) break

              // 防卡死：如果过滤条件极度稀疏，超过 50 万行强制截断
              if (scannedCount > 500000) {
                ctx.log(`[Engine] 节点 ${nodeId} 预览扫描超过 50 万行，强制截断展示`, "warn")
                break
              }
            }
          } finally {
            if (iterator.return) await iterator.return()
            streamControllerInstance.abort()
          }

          finalDataset = new InMemoryDataset({
            dataCategory: DATA_CATEGORY.TABLE,
            rows: previewRows,
            columns: result.columns,
          })
          finalDataset.columnMapping = result.columnMapping
        }
      }

      // 将原始流实例存入 runCache
      this.runCache.set(nodeId, result)

      let jsonSchemaTree = null
      let rowCount = -1

      if (finalCategory === DATA_CATEGORY.JSON) {
        if (result.json) {
          const builder = new JsonSchemaTree(result.json)
          jsonSchemaTree = markRaw(builder.build())
        }
        rowCount = Array.isArray(result.json) ? result.json.length : 1
      } else if (finalCategory === DATA_CATEGORY.TABLE) {
        if (!finalDataset.isStream) {
          rowCount = finalDataset.rows.length
        }
      }

      this.metaStore.updateMeta(nodeId, {
        rowCount: rowCount,
        columns: result.columns || [],
        dataCategory: finalCategory,
        jsonSchemaTree,
        schemaVersion: Date.now(),
        stale: false,
        staleReason: null,
        error: null,
      })

      if (!result.isStream || ctx.mode === "preview") {
        this.previewStore.setPreviewData(
          options.projectId || "default",
          nodeId,
          finalDataset,
          Date.now().toString(),
        )
      }

      return finalDataset
    } catch (err) {
      const errMsg = err.message || String(err)
      this.metaStore.setError(nodeId, errMsg)
      if (ctx.log) ctx.log(errMsg, "error")
      return null
    }
  }

  invalidateDownstream(nodeId, reason = "参数已变更") {
    const visited = new Set()
    const queue = [nodeId]
    while (queue.length > 0) {
      const id = queue.shift()
      if (visited.has(id)) continue
      visited.add(id)

      this.previewStore.clearCache("default-project", id)
      this.metaStore.markStale(id, reason)
      const outgoing = this.graphStore.getOutgoingEdges(id)
      for (const edge of outgoing) queue.push(edge.target)
    }
  }
}
