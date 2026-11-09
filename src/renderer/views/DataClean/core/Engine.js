import { createEngineInstance as createJsEngine } from "../engines/js-engine/index.js";
import { createEngineInstance as createDuckEngine } from "../engines/duckdb-engine/index.js";
import { ENGINE_TYPE } from "../constants/NodeTypes.js";

export default class Engine {
  constructor({ metaStore, graphStore, previewStore, type = ENGINE_TYPE.DUCK_DB }) {
    this.metaStore = metaStore;
    this.graphStore = graphStore;
    this.previewStore = previewStore;
    this.type = type;
    this.engineInstance = null;
    this._switching = null;
  }

  async init() {
    if (this.engineInstance) return;
    if (this.type === ENGINE_TYPE.JS) {
      this.engineInstance = createJsEngine();
    } else if (this.type === ENGINE_TYPE.DUCK_DB) {
      this.engineInstance = createDuckEngine();
    } else {
      throw new Error(`未知的引擎模式: ${this.type}`);
    }
    await this.engineInstance.init();
  }

  async switchType(newType) {
    if (this.type === newType) return;
    if (this._switching) await this._switching;
    this._switching = (async () => {
      await this.destroy();
      this.type = newType;
      await this.init();
    })();
    try {
      await this._switching;
    } finally {
      this._switching = null;
    }
  }

  /**
   * 执行单个算子
   */
  async runNode(nodeType, inputs, params, ctx) {
    await this.init();
    const executor = this.engineInstance.getExecutor(nodeType);
    if (!executor) {
      throw new Error(`[Engine] 引擎 ${this.type} 未注册算子: ${nodeType}`);
    }
    return executor.execute(inputs, params, ctx);
  }

  /**
   * 提取预览数据
   */
  async getPreviewData(payload, limit = 1000) {
    await this.init();
    return await this.engineInstance.getPreviewData(payload, limit);
  }

  async destroy() {
    if (this.engineInstance) {
      await this.engineInstance.destroy();
      this.engineInstance = null;
    }
  }
}
