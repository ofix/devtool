import { buildCacheKey } from "./CacheKey.js";
import { STORE_TYPE } from "./CachePolicy.js";

/**
 * 节点结果注册表（单版本模型）
 *
 * 约束：
 * - recordSetsKey = graphId:nodeId，同一节点只保留最新结果；
 * - 节点重跑时旧结果被释放，不支持多版本缓存；
 * - 只负责登记与路由，不执行 SQL、不攒批。
 */
export class NodeResultRegistry {
  constructor({ memoryStore, sqliteClient, duckdbClient }) {
    this.memoryStore = memoryStore;
    this.sqliteClient = sqliteClient;
    this.duckdbClient = duckdbClient;
    /** @type {Map<string, { result: import("./NodeResult.js").NodeResult, type: string, tableName?: string, columns: any[], rowCount: number }>} */
    this.nodeIndex = new Map();
  }

  saveNodeResult(graphId, nodeId, result) {
    if (!result.storeType) {
      throw new Error(`节点 ${nodeId} 的 NodeResult 缺少 storeType，无法登记`);
    }
    const recordSetsKey = buildCacheKey({ graphId, nodeId });
    const prev = this.nodeIndex.get(recordSetsKey);
    if (prev) {
      this._releaseByInfo(prev).catch(err =>
        console.warn(`[Registry] 释放旧结果失败: ${recordSetsKey}`, err),
      );
    }
    this.nodeIndex.set(recordSetsKey, {
      result,
      type: result.storeType,
      tableName: result.payload?.tableName,
      columns: result.columns ?? [],
      rowCount: result.rowCount ?? 0,
    });
  }

  hasResult(graphId, nodeId) {
    return this.nodeIndex.has(buildCacheKey({ graphId, nodeId }));
  }

  getNodeResult(graphId, nodeId) {
    const recordSetsKey = buildCacheKey({ graphId, nodeId });
    const info = this.nodeIndex.get(recordSetsKey);
    if (!info) throw new Error(`节点 ${nodeId}（${recordSetsKey}）无结果`);
    return info.result;
  }

  getTableName(recordSetsKey) {
    return this.nodeIndex.get(recordSetsKey)?.tableName ?? null;
  }

  getInfo(recordSetsKey) {
    const info = this.nodeIndex.get(recordSetsKey);
    if (!info) return null;
    return {
      type: info.type,
      tableName: info.tableName,
      columns: info.columns,
      rowCount: info.rowCount,
    };
  }

  async fetchWindow(graphId, nodeId, offset = 0, limit = 100) {
    return this.fetchWindowByRecordSetsKey(buildCacheKey({ graphId, nodeId }), offset, limit);
  }

  async fetchWindowByRecordSetsKey(recordSetsKey, offset = 0, limit = 100) {
    const info = this.nodeIndex.get(recordSetsKey);
    if (!info) throw new Error(`无结果: ${recordSetsKey}`);
    switch (info.type) {
      case STORE_TYPE.MEMORY:
        return this.memoryStore.fetchWindow(recordSetsKey, offset, limit);
      case STORE_TYPE.SQLITE:
        return this.sqliteClient.fetchWindow(info.tableName, offset, limit);
      case STORE_TYPE.DUCKDB:
        return this.duckdbClient.fetchWindow(info.tableName, offset, limit);
      default:
        throw new Error(`未知存储类型: ${info.type}`);
    }
  }

  async *fetchAll(graphId, nodeId, chunkSize = 1000) {
    yield* this.fetchAllByRecordSetsKey(buildCacheKey({ graphId, nodeId }), chunkSize);
  }

  async *fetchAllByRecordSetsKey(recordSetsKey, chunkSize = 1000) {
    const info = this.nodeIndex.get(recordSetsKey);
    if (!info) throw new Error(`无结果: ${recordSetsKey}`);
    switch (info.type) {
      case STORE_TYPE.MEMORY:
        yield* this.memoryStore.fetchAll(recordSetsKey, chunkSize);
        break;
      case STORE_TYPE.SQLITE:
        yield* this.sqliteClient.fetchAll(info.tableName, chunkSize);
        break;
      case STORE_TYPE.DUCKDB:
        yield* this.duckdbClient.fetchAll(info.tableName, chunkSize);
        break;
      default:
        throw new Error(`未知存储类型: ${info.type}`);
    }
  }

  async releaseNodeByRecordSetsKey(recordSetsKey) {
    const info = this.nodeIndex.get(recordSetsKey);
    if (!info) return;
    this.nodeIndex.delete(recordSetsKey);
    await this._releaseByInfo(info);
  }

  async releaseNode(graphId, nodeId) {
    await this.releaseNodeByRecordSetsKey(buildCacheKey({ graphId, nodeId }));
  }

  async releaseGraph(graphId) {
    const prefix = `${graphId ?? "_"}:`;
    for (const [recordSetsKey, info] of [...this.nodeIndex.entries()]) {
      if (!recordSetsKey.startsWith(prefix)) continue;
      this.nodeIndex.delete(recordSetsKey);
      await this._releaseByInfo(info);
    }
  }

  async clear() {
    for (const [recordSetsKey, info] of [...this.nodeIndex.entries()]) {
      this.nodeIndex.delete(recordSetsKey);
      await this._releaseByInfo(info);
    }
  }

  async _releaseByInfo(info) {
    if (info.type === STORE_TYPE.MEMORY) {
      await this.memoryStore.release(info.result?.recordSetsKey ?? info.tableName);
    } else if (info.type === STORE_TYPE.SQLITE) {
      await this.sqliteClient.dropTable(info.tableName);
    } else if (info.type === STORE_TYPE.DUCKDB) {
      await this.duckdbClient.dropTable(info.tableName);
    }
  }
}
