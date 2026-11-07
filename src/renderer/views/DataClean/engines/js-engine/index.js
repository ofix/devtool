import { opMap } from "./operators/index.js"
import StreamController from "./runtime/StreamController.js"

export function createEngineInstance() {
  return {
    async init() {
      console.log("[JS Engine] 初始化完成")
    },
    async destroy() {
      console.log("[JS Engine] 销毁")
    },

    getExecutor(opType) {
      const Cls = opMap[opType]
      if (!Cls) throw new Error(`纯 JS 引擎暂不支持算子: ${opType}`)
      return new Cls()
    },

    /**
     * 提取预览数据
     * 在 JS 引擎里，直接从 StreamDataset 里拉取前 1000 行
     */
    async getPreviewData(payload, limit = 1000) {
      if (!payload || !payload.controller) return []

      const controller = new StreamController(payload.controller.sourceGenerator, "rendezvous")
      const iterator = controller.createIterator("preview", null)
      const rows = []
      try {
        for await (const chunk of iterator) {
          for (const row of chunk.rows) {
            rows.push(row)
            if (rows.length >= limit) break
          }
          if (rows.length >= limit) break
        }
      } catch (e) {
        console.warn("预览中断", e)
      } finally {
        if (iterator.return) await iterator.return()
        controller.abort()
      }
      return rows
    },
  }
}
