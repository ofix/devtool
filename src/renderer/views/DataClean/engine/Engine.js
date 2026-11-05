// 增加严格的类型校验拦截，并支持字段血缘映射收集与流式数据自适应
import { markRaw } from "vue"
import { getOperator } from "./operators/index.js"
import { inferDataCategory } from "./runtime/InferCategory.js"
import { DATA_CATEGORY } from "../constants/DataCategories.js"
import { JsonSchemaTree } from "./runtime/JsonSchemaTree.js"
import InMemoryDataset from "./runtime/InMemoryDataset.js"

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
        // 如果上游没数据，构造一个空的 InMemoryDataset 传入
        inputs.push(
          new InMemoryDataset({ dataCategory: DATA_CATEGORY.TABLE, rows: [], columns: [] }),
        )
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

      if (!result) return null

      const finalCategory = result.dataCategory || inferDataCategory(result.rows)

      // ================= 血缘映射智能兜底 =================
      // 如果算子没有返回 columnMapping（比如 Filter/Sort 等直传算子），则自动按同名映射补全
      if (!result.columnMapping && result.columns) {
        result.columnMapping = {}
        for (const col of result.columns) {
          result.columnMapping[col.name] = col.name
        }
      }

      // ================= 数据结构自适应 =================
      let finalDataset = result
      // 如果算子返回的是纯对象（尚未改造的算子），将其包装成 InMemoryDataset
      if (
        !result.isStream &&
        !(result instanceof InMemoryDataset) &&
        result.dataCategory !== DATA_CATEGORY.JSON
      ) {
        finalDataset = new InMemoryDataset({
          dataCategory: finalCategory,
          rows: result.rows || [],
          columns: result.columns || [],
        })
        // 将兜底的 mapping 挂载到新实例上
        finalDataset.columnMapping = result.columnMapping
      } else {
        // 如果是已改造的实例，确保它带有 mapping（极少数可能遗漏）
        finalDataset.columnMapping = result.columnMapping
      }

      // ================= JSON Schema 构建 =================
      let jsonSchemaTree = null
      let rowCount = 0
      let jsonData = null

      if (finalCategory === DATA_CATEGORY.JSON) {
        jsonData = result.json || null
        if (jsonData) {
          const builder = new JsonSchemaTree(jsonData)
          jsonSchemaTree = markRaw(builder.build())
        }
        rowCount = Array.isArray(jsonData) ? jsonData.length : 1
      } else if (finalCategory === DATA_CATEGORY.TABLE) {
        // 流式数据无法提前知道总行数，设置为 -1，内存数据则取实际长度
        if (finalDataset instanceof InMemoryDataset) {
          rowCount = finalDataset.rows.length
        } else if (finalDataset.isStream) {
          rowCount = -1 // UI 层需处理 -1 的情况（显示“未知/流式中”）
        }
      }

      // 将实例写入缓存，供下游节点读取
      this.datasetStore.setDataset(nodeId, finalDataset)

      this.metaStore.updateMeta(nodeId, {
        rowCount: rowCount,
        columns: finalDataset.columns || [],
        dataCategory: finalCategory,
        jsonSchemaTree,
        formattedText: result.formattedText || null,
        isTruncated: result.isTruncated || false,
        stale: false,
        staleReason: null,
        error: null,
      })

      return finalDataset
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
