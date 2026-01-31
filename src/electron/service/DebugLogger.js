/**
 * 单例模式的日志管理类
 * 负责日志的缓存、管理、转发回调
 */
class DebugLogger {
  static instance = null;
  #logCache = [];
  #cacheLimit = 1000;
  #logCallback = null;
  // 新增：记录最后一次推送的日志索引（用于增量推送）
  #lastPushedIndex = 0;

  constructor(cacheLimit = 1000) {
    this.#cacheLimit = cacheLimit;
  }

  static getInstance(cacheLimit) {
    if (!DebugLogger.instance) {
      DebugLogger.instance = new DebugLogger(cacheLimit);
    }
    return DebugLogger.instance;
  }

  addLog(log) {
    console.log("新增日志: ", log);
    if (!log) return;
    const logItem = {
      id: `${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      type: log.type || 'log',
      timestamp: log.timestamp || new Date().toLocaleString(),
      args: log.args || []
    };
    this.#logCache.push(logItem);
    if (this.#logCache.length > this.#cacheLimit) {
      this.#logCache.shift();
      this.#lastPushedIndex = Math.max(0, this.#lastPushedIndex - 1); // 缓存截断时同步调整索引
    }
    if (typeof this.#logCallback === 'function') {
      this.#logCallback(logItem);
    }
  }

  // 新增：获取从lastPushedIndex到当前的增量日志，并更新lastPushedIndex
  getIncrementalLogs() {
    const incrementalLogs = this.#logCache.slice(this.#lastPushedIndex);
    this.#lastPushedIndex = this.#logCache.length; // 更新为当前最新索引
    return incrementalLogs;
  }

  // 新增：重置最后推送索引（清空日志时用）
  resetLastPushedIndex() {
    this.#lastPushedIndex = 0;
  }

  // 原有方法：保留
  getLogs() { return [...this.#logCache]; }
  clearLogs() {
    this.#logCache = [];
    this.resetLastPushedIndex(); // 清空时同步重置索引
  }
  setLogCallback(callback) { this.#logCallback = callback; }
  removeLogCallback() { this.#logCallback = null; }
  getLogCount() { return this.#logCache.length; }
  setCacheLimit(limit) {
    if (typeof limit === 'number' && limit > 0) {
      this.#cacheLimit = limit;
      if (this.#logCache.length > limit) {
        const removedCount = this.#logCache.length - limit;
        this.#logCache = this.#logCache.slice(-limit);
        this.#lastPushedIndex = Math.max(0, this.#lastPushedIndex - removedCount);
      }
    }
  }
}

// 导出单例实例（默认缓存1000条）
let debugLogger = DebugLogger.getInstance(3000);
export default debugLogger;