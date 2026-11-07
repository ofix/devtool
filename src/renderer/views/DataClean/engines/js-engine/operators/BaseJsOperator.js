import { IExecutor } from "../../../core/contract/IExecutor.js"
import StreamDataset from "../runtime/StreamDataset.js"
import StreamController from "../runtime/StreamController.js"
import { DataHandle } from "../../../core/contract/DataHandle.js" // 👈 引入契约类

export class BaseJsOperator extends IExecutor {
  async *pullStream(payload, nodeId, ctx) {
    if (!payload || !payload.controller) {
      throw new Error("上游节点未提供有效的流数据")
    }
    const controller = new StreamController(payload.controller.sourceGenerator, "rendezvous")
    const iterator = controller.createIterator(nodeId, ctx.signal)

    for await (const chunk of iterator) {
      if (ctx.signal.aborted) return
      yield chunk
      await new Promise(r => setTimeout(r, 0))
    }
  }

  /**
   * 👇 核心改造：使用 DataHandle.jsStream 包装
   */
  buildHandle(schema, columnMapping, streamDataset, dataCategory = "table") {
    if (dataCategory === "json") {
      return DataHandle.jsStream({ schema, columnMapping, streamDataset, dataCategory: "json" })
    }
    return DataHandle.jsStream({ schema, columnMapping, streamDataset })
  }

  /**
   * 👇 新增：获取上游的 JSON 全量数据
   */
  async getUpstreamJson(inputData) {
    if (inputData.dataCategory !== "json") {
      throw new Error("上游数据不是 JSON 格式")
    }
    return inputData.payload.json
  }

  /**
   * 👇 新增：构建一个返回 JSON 的句柄
   */
  buildJsonHandle(json, formattedText = null) {
    return DataHandle.jsJson({ json, formattedText })
  }
}
