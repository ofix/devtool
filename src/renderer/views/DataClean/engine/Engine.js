import { markRaw } from "vue"
import { getOperator } from "./operators/index.js"
import { inferDataCategory } from "./runtime/InferCategory.js"
import { DATA_CATEGORY } from "../constants/DataCategories.js"
import { JsonSchemaTree } from "./runtime/JsonSchemaTree.js"
import InMemoryDataset from "./runtime/InMemoryDataset.js"
import TaskContext from "./runtime/TaskContext.js"

export default class Engine {
  constructor({ metaStore, datasetStore, graphStore }) {
    this.metaStore = metaStore
    this.datasetStore = datasetStore
    this.graphStore = graphStore
  }

  /**
   * 执行单个节点（支持全量与预览双模式）
   * @param {String} nodeId 节点ID
   * @param {Object} options { projectId, mode: 'preview' | 'execute', taskId, abortSignal }
   */
  async runNode(nodeId, options = {}) {
    const node = this.graphStore.getNode(nodeId)
    if (!node) return null

    const op = getOperator(node.type)
    if (!op) return null

    // 1. 获取当前节点的上游数据 (inputs)
    const inputs = []
    const incoming = this.graphStore.getIncomingEdges(nodeId)

    for (const edge of incoming) {
      const upstreamData = this.datasetStore.getDataset(edge.source)
      if (!upstreamData) {
        // 上游没数据，构造一个空的内存 Dataset 垫底
        inputs.push(
          new InMemoryDataset({ dataCategory: DATA_CATEGORY.TABLE, rows: [], columns: [] }),
        )
        continue
      }

      // 严格类型校验
      const expected = op.meta.inputCategory
      if (expected && expected !== "dynamic" && upstreamData.dataCategory !== expected) {
        throw new Error(
          `输入类型不匹配：算子 [${node.type}] 需要 [${expected}]，但上游是 [${upstreamData.dataCategory}]`,
        )
      }

      inputs.push(upstreamData)
    }

    // 如果节点有输入，但连上游都没有，说明上游没跑完或者断线了
    if (
      op.meta.inputs > 0 &&
      (incoming.length === 0 || incoming.some(e => !this.datasetStore.getDataset(e.source)))
    ) {
      this.metaStore.markStale(nodeId, "上游无数据")
      return null
    }

    // 2. 创建任务上下文（从 options 继承，如果没有则新建）
    const ctx =
      options.taskContext ||
      new TaskContext(options.projectId || "default", options.mode || "preview")

    // 注入日志方法
    ctx.log = options.log || ((msg, level = "info") => console.log(`[${node.type}]`, msg))

    try {
      // 3. 执行算子
      const result = await op.execute(inputs, node.params || {}, ctx)
      if (!result) return null

      const finalCategory = result.dataCategory || inferDataCategory(result.rows)

      // 4. 智能兜底构建 columnMapping（防算子遗漏）
      if (!result.columnMapping && result.columns) {
        result.columnMapping = {}
        for (const col of result.columns) {
          result.columnMapping[col.name] = col.name
        }
      }

      // 5. 数据处理与截断拦截
      let finalDataset = result

      if (finalCategory === DATA_CATEGORY.TABLE) {
        // 如果是流式数据，且在 preview 模式下，主动截断前 1000 行
        if (result.isStream && (ctx.mode === "preview" || options.mode === "preview")) {
          const previewRows = []

          // 使用 StreamController 拉取前 1000 行
          const controller = result.controller
          const iterator = controller.createIterator(`preview-interceptor-${nodeId}`, ctx.signal)

          try {
            for await (const chunk of iterator) {
              for (const row of chunk.rows) {
                previewRows.push(row)
                if (previewRows.length >= 1000) break
              }
              if (previewRows.length >= 1000) break
            }
          } finally {
            // 无论是否截断，强制关闭迭代器，触发底层 abort
            if (iterator.return) await iterator.return()
          }

          // 将流转换为内存数据集，存入缓存
          finalDataset = new InMemoryDataset({
            dataCategory: DATA_CATEGORY.TABLE,
            rows: previewRows,
            columns: result.columns,
          })
          finalDataset.columnMapping = result.columnMapping
        }
      }

      // 6. 更新 Metadata（包含 Schema 广播）
      let jsonSchemaTree = null
      let rowCount = -1 // 流式默认 -1

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
        // 只有在第一次拿到 schema，或者 schema 变化时才广播（防抖动）
        schemaVersion: Date.now(),
        stale: false,
        staleReason: null,
        error: null,
      })

      // 7. 写入 Store
      this.datasetStore.setDataset(nodeId, finalDataset)

      return finalDataset
    } catch (err) {
      const errMsg = err.message || String(err)
      this.metaStore.setError(nodeId, errMsg)
      if (ctx.log) ctx.log(errMsg, "error")
      return null
    }
  }

  /**
   * 全量运行结束后的清理（由 Scheduler 调用）
   */
  invalidateDownstream(nodeId, reason = "参数已变更") {
    const visited = new Set()
    const queue = [nodeId]
    while (queue.length > 0) {
      const id = queue.shift()
      if (visited.has(id)) continue
      visited.add(id)
      this.datasetStore.removeDataset(id)
      this.metaStore.markStale(id, reason)
      const outgoing = this.graphStore.getOutgoingEdges(id)
      for (const edge of outgoing) queue.push(edge.target)
    }
  }
}
