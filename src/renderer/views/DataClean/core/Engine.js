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

  async runNode(nodeType, inputPorts, params, ctx) {
    if (!this.engineInstance) {
      throw new Error("[Engine] 尚未 init，请先 await engine.init()");
    }
    const executor = this.engineInstance.getExecutor(nodeType);
    if (!executor) {
      throw new Error(`[Engine] 引擎 ${this.type} 未注册算子: ${nodeType}`);
    }
    return executor.execute(inputPorts, params, ctx);
  }

  getPreviewWindow(graphId, nodeId, offset = 0, limit = 100) {
    return this.nodeResultRegistry.fetchWindow(graphId, nodeId, offset, limit);
  }

  getPreviewWindowByRecordSetsKey(recordSetsKey, offset = 0, limit = 100) {
    return this.nodeResultRegistry.fetchWindowByRecordSetsKey(recordSetsKey, offset, limit);
  }

  fetchAll(graphId, nodeId, chunkSize = 1000) {
    return this.nodeResultRegistry.fetchAll(graphId, nodeId, chunkSize);
  }

  fetchAllByRecordSetsKey(recordSetsKey, chunkSize = 1000) {
    return this.nodeResultRegistry.fetchAllByRecordSetsKey(recordSetsKey, chunkSize);
  }

  fetchWindowByRecordSetsKey(recordSetsKey, offset = 0, limit = 100) {
    return this.nodeResultRegistry.fetchWindowByRecordSetsKey(recordSetsKey, offset, limit);
  }

  getTableName(recordSetsKey) {
    return this.nodeResultRegistry.getTableName(recordSetsKey);
  }

  saveNodeResult(graphId, nodeId, result) {
    return this.nodeResultRegistry.saveNodeResult(graphId, nodeId, result);
  }

  hasResult(graphId, nodeId) {
    return this.nodeResultRegistry.hasResult(graphId, nodeId);
  }

  getNodeResult(graphId, nodeId) {
    return this.nodeResultRegistry.getNodeResult(graphId, nodeId);
  }

  releaseNodeByRecordSetsKey(recordSetsKey) {
    return this.nodeResultRegistry.releaseNodeByRecordSetsKey(recordSetsKey);
  }

  async destroy() {
    if (this.engineInstance) {
      await this.engineInstance.destroy();
      this.engineInstance = null;
    }
  }
}
