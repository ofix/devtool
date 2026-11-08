import { createEngineInstance as createJsEngine } from "../engines/js-engine/index.js"
import { createEngineInstance as createDuckEngine } from "../engines/duckdb-engine/index.js"

export default class Engine {
  constructor({ metaStore, graphStore, previewStore, mode = "js" }) {
    this.metaStore = metaStore
    this.graphStore = graphStore
    this.previewStore = previewStore
    this.mode = mode
    this.engineInstance = null
  }

  async init() {
    if (this.engineInstance) return
    if (this.mode === "js") {
      this.engineInstance = createJsEngine()
    } else if (this.mode === "duckdb") {
      this.engineInstance = createDuckEngine()
    } else {
      throw new Error(`未知的引擎模式: ${this.mode}`)
    }
    await this.engineInstance.init()
  }

  async switchMode(newMode) {
    if (this.mode === newMode) return
    await this.destroy()
    this.mode = newMode
    await this.init()
  }

  /**
   * 执行单个算子
   */
  async runNode(nodeType, inputs, params, ctx) {
    await this.init()
    const executor = this.engineInstance.getExecutor(nodeType)
    return await executor.execute(inputs, params, ctx)
  }

  /**
   * 提取预览数据
   */
  async getPreviewData(payload, limit = 1000) {
    await this.init()
    return await this.engineInstance.getPreviewData(payload, limit)
  }

  async destroy() {
    if (this.engineInstance) {
      await this.engineInstance.destroy()
      this.engineInstance = null
    }
  }
}
