import { opMap } from "./operators/index.js"

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
     */
    async getPreviewData(payload, limit = 1000) {
      // 核心修复：从 payload.streamDataset 里取
      const streamDataset = payload?.streamDataset
      if (!streamDataset || !streamDataset.controller) {
        console.warn("[JS Engine] 预览失败：找不到有效的 streamDataset，payload:", payload)
        return []
      }

      const rows = []
      try {
        // 直接调用生成器工厂，不经过 StreamController 避免多播死锁
        const iterator = streamDataset.controller.sourceGenerator()

        for await (const chunk of iterator) {
          if (!chunk || !chunk.rows) continue
          for (const row of chunk.rows) {
            rows.push(row)
            if (rows.length >= limit) break
          }
          if (rows.length >= limit) break
        }
      } catch (e) {
        console.error("[JS Engine] 预览拉取异常:", e)
      }

      console.log(`[JS Engine] 预览拉取完成，获取 ${rows.length} 行`)
      return rows
    },
  }
}
