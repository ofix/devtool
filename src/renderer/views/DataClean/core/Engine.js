import { createEngineInstance as createJsEngine } from "../engines/js-engine/index.js"
import { createEngineInstance as createDuckEngine } from "../engines/duckdb-engine/index.js"
import Scheduler from "./Scheduler.js"
import TaskContext from "./runtime/TaskContext.js"

export default class Engine {
  constructor({ metaStore, graphStore, previewStore, mode = "js" }) {
    this.metaStore = metaStore
    this.graphStore = graphStore
    this.previewStore = previewStore
    this.mode = mode
    this.engineInstance = null
  }

  /**
   * 初始化引擎实例
   */
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
    console.log(`[Engine] 当前运行模式: ${this.mode.toUpperCase()}`)
  }

  /**
   * 切换引擎
   */
  async switchMode(newMode) {
    if (this.mode === newMode) return
    await this.destroy()
    this.mode = newMode
    await this.init()
  }

  /**
   * 运行任务（全量或局部预览）
   * @param {String} projectId
   * @param {String} targetNodeId 目标节点（如果是全量运行则传 null）
   * @param {String} runMode 'preview' | 'execute'
   */
  async runTask(projectId, targetNodeId = null, runMode = "preview", options = {}) {
    await this.init() // 确保引擎就绪

    const ctx = new TaskContext(projectId, runMode, runMode === "preview" ? "high" : "low")
    ctx.log = options.log || ((msg, level = "info") => console.log(`[Engine]`, msg))

    const scheduler = new Scheduler({
      engine: this,
      graphStore: this.graphStore,
      metaStore: this.metaStore,
      previewStore: this.previewStore,
    })

    return await scheduler.execute(projectId, targetNodeId, runMode, ctx)
  }

  /**
   * 提供给 Scheduler 调用的执行器工厂
   */
  getExecutor(opType) {
    return this.engineInstance.getExecutor(opType)
  }

  /**
   * 统一预览入口（UI 层只调这个，屏蔽底层是流还是 SQL）
   */
  async getPreviewData(nodeId, payload, limit = 1000) {
    if (this.mode === "js") {
      // 纯 JS 引擎由 EngineInstance 负责从流中抽 1000 行
      return await this.engineInstance.getPreviewData(payload, limit)
    } else {
      // DuckDB 引擎去查 SQL
      return await this.engineInstance.getPreviewData(payload, limit)
    }
  }

  /**
   * 销毁引擎
   */
  async destroy() {
    if (this.engineInstance) {
      await this.engineInstance.destroy()
      this.engineInstance = null
    }
  }
}
