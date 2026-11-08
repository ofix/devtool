import { IExecutor } from "../../../core/contract/IExecutor.js"
import StreamDataset from "../runtime/StreamDataset.js"
import StreamController from "../runtime/StreamController.js"
import { DataHandle } from "../../../core/contract/DataHandle.js"

export class BaseJsOperator extends IExecutor {
  /**
   * 从上游拉取流
   * @param {Object} streamDataset 上游的 StreamDataset 实例
   * @param {String} nodeId 当前节点 ID
   * @param {Object} ctx TaskContext
   */
  async *pullStream(streamDataset, nodeId, ctx) {
    if (!streamDataset || !streamDataset.controller) {
      throw new Error(`[BaseJsOperator] 上游节点未提供有效的流数据，nodeId: ${nodeId}`)
    }

    const controller = new StreamController(streamDataset.controller.sourceGenerator, "rendezvous")
    const iterator = controller.createIterator(nodeId, ctx.signal)

    try {
      for await (const chunk of iterator) {
        if (ctx.signal.aborted) return
        yield chunk
        await new Promise(r => setTimeout(r, 0))
      }
    } finally {
      if (iterator.return) await iterator.return()
      controller.abort()
    }
  }

  /**
   * 👇 核心修复：明确实例化 StreamDataset
   */
  buildHandle(schema, columnMapping, generator, dataCategory = "table") {
    // 1. 实例化 StreamDataset
    const streamDataset = new StreamDataset({
      dataCategory,
      columns: schema,
      controller: {
        sourceGenerator: generator,
        strategy: "rendezvous",
      },
    })

    // 2. 封装为 DataHandle
    return DataHandle.jsStream({
      schema,
      columnMapping,
      streamDataset, // 👈 传入的是实例，而不是函数
    })
  }

  /**
   * 构建 JSON 句柄
   */
  buildJsonHandle(json, formattedText = null) {
    return DataHandle.jsJson({ json, formattedText })
  }

  /**
   * 获取上游 JSON 数据
   */
  async getUpstreamJson(inputData) {
    if (inputData.dataCategory !== "json") {
      throw new Error("上游数据不是 JSON 格式")
    }
    return inputData.payload.json
  }
}
