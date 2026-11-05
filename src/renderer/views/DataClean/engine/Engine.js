// 增加严格的类型校验拦截，并支持字段血缘映射收集
import { markRaw } from "vue"
import { getOperator } from "./operators/index.js"
import { inferDataCategory } from "./runtime/InferCategory.js"
import { DATA_CATEGORY } from "../constants/DataCategories.js"
import { JsonSchemaTree } from "./runtime/JsonSchemaTree.js"

export default class Engine {
  constructor({ metaStore, datasetStore, graphStore }) {
    this.metaStore = metaStore
    this.datasetStore = datasetStore
    this.graphStore = graphStore
  }

  /**
   * 执行单个节点
   * 核心思想：节点执行产生数据和列映射(Mapping)，不直接修改全局血缘图，
   * 把建图的动作延迟到用户触发溯源查询时再执行。
   */
  async runNode(nodeId, context = {}) {
    const node = this.graphStore.getNode(nodeId)
    if (!node) return null

    const op = getOperator(node.type)
    if (!op) return null

    const inputs = []
    const incoming = this.graphStore.getIncomingEdges(nodeId)

    for (const edge of incoming) {
      const upstreamData = this.datasetStore.getDataset(edge.source)
      if (!upstreamData) {
        inputs.push({ dataCategory: DATA_CATEGORY.TABLE, rows: [], columns: [], json: null })
        continue
      }

      // 上游形态校验
      const expected = op.meta.inputCategory
      if (expected && expected !== "dynamic" && upstreamData.dataCategory !== expected) {
        throw new Error(
          `输入类型不匹配：算子需要 [${expected}]，但上游是 [${upstreamData.dataCategory}]`,
        )
      }

      inputs.push(upstreamData)
    }

    if (op.meta.inputs > 0) {
      const hasMissing = incoming.some(e => !this.datasetStore.getDataset(e.source))
      if (incoming.length === 0 || hasMissing) {
        this.metaStore.markStale(nodeId, "上游无数据")
        return null
      }
    }

    try {
      // 将 nodeId 注入到 ctx 中，供算子内部（如 SQL 解析）记录来源标识
      const result = await op.execute(inputs, node.params || {}, {
        log: context.log || (() => {}),
        rawText: resolveRawText(node, context),
        nodeId,
        datasetStore: this.datasetStore,
        metaStore: this.metaStore,
        graphStore: this.graphStore, // 传递图状态，供复杂算子（如 Join）查上游
      })

      const finalCategory = result.dataCategory || inferDataCategory(result.rows)

      if (!result.columnMapping && result.columns) {
        result.columnMapping = {}
        for (const col of result.columns) {
          result.columnMapping[col.name] = col.name
        }
      }

      // 👇 添加这两行打印
      console.log("【Engine 接收到的结果】", result)
      console.log("【Engine 接收到的 columnMapping】", result?.columnMapping)

      // 核心：智能兜底构建 columnMapping / jsonSchemaMapping
      let finalMapping = result.columnMapping

      const normalized = {
        dataCategory: finalCategory,
        rows: finalCategory === DATA_CATEGORY.TABLE ? result.rows || [] : [],
        columns: finalCategory === DATA_CATEGORY.TABLE ? result.columns || [] : [],
        json: finalCategory === DATA_CATEGORY.JSON ? result.json || null : null,
        formattedText: result.formattedText || null,
        isTruncated: result.isTruncated || false,
        // 把列映射字典随数据一起缓存下来，供后续图谱组装使用
        columnMapping: finalMapping,
      }

      let jsonSchemaTree = null
      if (finalCategory === DATA_CATEGORY.JSON && normalized.json) {
        const builder = new JsonSchemaTree(normalized.json)
        jsonSchemaTree = markRaw(builder.build())
      }

      // 写入缓存，让下游节点可以读
      this.datasetStore.setDataset(nodeId, normalized)

      this.metaStore.updateMeta(nodeId, {
        rowCount:
          finalCategory === DATA_CATEGORY.TABLE
            ? normalized.rows.length
            : finalCategory === DATA_CATEGORY.JSON
              ? Array.isArray(normalized.json)
                ? normalized.json.length
                : 1
              : 0,
        columns: normalized.columns,
        dataCategory: finalCategory,
        jsonSchemaTree,
        formattedText: normalized.formattedText,
        isTruncated: normalized.isTruncated,
        stale: false,
        staleReason: null,
        error: null,
      })

      return normalized
    } catch (err) {
      const errMsg = err.message || String(err)
      this.metaStore.setError(nodeId, errMsg)
      if (context.log) context.log(`[${node.type}] ${errMsg}`, "error")
      return null
    }
  }

  /**
   * 失效下游节点缓存
   * 当某个节点的参数变更时，必须向下游传播失效信号，清理掉旧的 Dataset。
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

  /**
   * 清空所有节点缓存
   * 通常在整个管线变更或重新加载工程时调用
   */
  invalidateAll() {
    for (const node of this.graphStore.nodes) {
      this.datasetStore.removeDataset(node.id)
      this.metaStore.markStale(node.id, "管线已变更")
    }
  }
}

function resolveRawText(node, context) {
  if (node.params && typeof node.params.rawText === "string") return node.params.rawText
  return context && context.rawText ? context.rawText : ""
}
