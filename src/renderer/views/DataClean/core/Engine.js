import { createEngineInstance as createJsEngine } from "../engines/js-engine/index.js";
import { createEngineInstance as createDuckEngine } from "../engines/duckdb-engine/index.js";
import { ENGINE_TYPE } from "../constants/NodeTypes.js";

export default class Engine {
  constructor({
    metaStore,
    graphStore,
    previewStore,
    nodeResultRegistry,
    duckdbClient,
    sqliteClient,
    memoryStore,
    type = ENGINE_TYPE.DUCK_DB,
  }) {
    this.metaStore = metaStore;
    this.graphStore = graphStore;
    this.previewStore = previewStore;

    this.nodeResultRegistry = nodeResultRegistry;
    this.duckdbClient = duckdbClient;
    this.sqliteClient = sqliteClient;
    this.memoryStore = memoryStore;

    this.type = type;
    this.engineInstance = null;
    this._initPromise = null;
    this._switching = null;
  }

  async init() {
    if (this.engineInstance) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      if (this.type === ENGINE_TYPE.JS) {
        this.engineInstance = createJsEngine();
      } else if (this.type === ENGINE_TYPE.DUCK_DB) {
        this.engineInstance = createDuckEngine();
      } else {
        throw new Error(`未知的引擎模式: ${this.type}`);
      }
      await this.engineInstance.init();
    })();

    try {
      await this._initPromise;
    } finally {
      this._initPromise = null;
    }
  }

  async switchType(newType) {
    if (this.type === newType) return;
    while (this._switching) await this._switching;

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

  async runNode(nodeType, inputs, params, ctx) {
    if (!this.engineInstance) {
      throw new Error("[Engine] 尚未 init，请先 await engine.init()");
    }
    const executor = this.engineInstance.getExecutor(nodeType);
    if (!executor) {
      throw new Error(`[Engine] 引擎 ${this.type} 未注册算子: ${nodeType}`);
    }
    return executor.execute(inputs, params, ctx);
  }

  getPreviewWindow(workflowId, nodeId, offset = 0, limit = 100) {
    return this.nodeResultRegistry.fetchWindow(workflowId, nodeId, offset, limit);
  }

  getPreviewWindowByCacheKey(cacheKey, offset = 0, limit = 100) {
    return this.nodeResultRegistry.fetchWindowByCacheKey(cacheKey, offset, limit);
  }

  fetchAll(workflowId, nodeId, chunkSize = 1000) {
    return this.nodeResultRegistry.fetchAll(workflowId, nodeId, chunkSize);
  }

  fetchAllByCacheKey(cacheKey, chunkSize = 1000) {
    return this.nodeResultRegistry.fetchAllByCacheKey(cacheKey, chunkSize);
  }

  getTableName(cacheKey) {
    return this.nodeResultRegistry.getTableName(cacheKey);
  }

  saveNodeResult(workflowId, nodeId, handle) {
    return this.nodeResultRegistry.saveNodeResult(workflowId, nodeId, handle);
  }

  hasResult(workflowId, nodeId) {
    return this.nodeResultRegistry.hasResult(workflowId, nodeId);
  }

  getResultHandle(workflowId, nodeId) {
    return this.nodeResultRegistry.getResultHandle(workflowId, nodeId);
  }

  releaseNodeByCacheKey(cacheKey) {
    return this.nodeResultRegistry.releaseNodeByCacheKey(cacheKey);
  }

  async destroy() {
    if (this.engineInstance) {
      await this.engineInstance.destroy();
      this.engineInstance = null;
    }
  }
}
