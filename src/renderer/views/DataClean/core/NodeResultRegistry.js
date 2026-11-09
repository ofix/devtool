import { buildCacheKey } from "./CacheKey.js";
import { STORE_TYPE } from "./CachePolicy.js";

/**
 * 节点结果注册表（单版本模型）
 *
 * 约束：
 * - cacheKey = workflowId:nodeId，同一节点只保留最新结果；
 * - 节点重跑时旧结果被释放，不支持多版本缓存、不支持历史回滚；
 * - 只负责登记与路由，不执行 SQL、不攒批。
 */
export class NodeResultRegistry {
  constructor({ memoryStore, sqliteClient, duckdbClient }) {
    this.memoryStore = memoryStore;
    this.sqliteClient = sqliteClient;
    this.duckdbClient = duckdbClient;
    /** @type {Map<string, { handle: import("./contract/DataHandle.js").DataHandle, type: string, tableName?: string, columns: any[], rowCount: number }>} */
    this.nodeIndex = new Map();
  }

  /**
   * 登记算子执行结果（DataHandle）。
   * 单版本模型：同 cacheKey 的旧结果先释放，再登记新结果。
   */
  saveNodeResult(workflowId, nodeId, handle) {
    if (!handle.storeType) {
      throw new Error(`节点 ${nodeId} 的 DataHandle 缺少 storeType，无法登记`);
    }
    const cacheKey = buildCacheKey({ workflowId, nodeId });
    const prev = this.nodeIndex.get(cacheKey);
    if (prev) {
      // 覆盖前释放旧结果，避免旧表/旧内存残留
      this._releaseByInfo(prev).catch(err =>
        console.warn(`[Registry] 释放旧结果失败: ${cacheKey}`, err),
      );
    }
    this.nodeIndex.set(cacheKey, {
      handle,
      type: handle.storeType,
      tableName: handle.payload?.tableName,
      columns: handle.schema ?? [],
      rowCount: handle.rowCount ?? 0,
    });
  }

  hasResult(workflowId, nodeId) {
    return this.nodeIndex.has(buildCacheKey({ workflowId, nodeId }));
  }

  getResultHandle(workflowId, nodeId) {
    const cacheKey = buildCacheKey({ workflowId, nodeId });
    const info = this.nodeIndex.get(cacheKey);
    if (!info) throw new Error(`节点 ${nodeId}（${cacheKey}）无结果`);
    return info.handle;
  }

  getTableName(cacheKey) {
    return this.nodeIndex.get(cacheKey)?.tableName ?? null;
  }

  getInfo(cacheKey) {
    const info = this.nodeIndex.get(cacheKey);
    if (!info) return null;
    return {
      type: info.type,
      tableName: info.tableName,
      columns: info.columns,
      rowCount: info.rowCount,
    };
  }

  /**
   * 预览分页（workflowId + nodeId）
   */
  async fetchWindow(workflowId, nodeId, offset = 0, limit = 100) {
    const cacheKey = buildCacheKey({ workflowId, nodeId });
    return this.fetchWindowByCacheKey(cacheKey, offset, limit);
  }

  /**
   * 预览分页（cacheKey 直接路由，供 ctx.fetchWindow 用）
   */
  async fetchWindowByCacheKey(cacheKey, offset = 0, limit = 100) {
    const info = this.nodeIndex.get(cacheKey);
    if (!info) throw new Error(`无结果: ${cacheKey}`);
    switch (info.type) {
      case STORE_TYPE.MEMORY:
        return this.memoryStore.fetchWindow(cacheKey, offset, limit);
      case STORE_TYPE.SQLITE:
        return this.sqliteClient.fetchWindow(info.tableName, offset, limit);
      case STORE_TYPE.DUCKDB:
        return this.duckdbClient.fetchWindow(info.tableName, offset, limit);
      default:
        throw new Error(`未知存储类型: ${info.type}`);
    }
  }

  /**
   * 流式读全量（workflowId + nodeId）
   */
  async *fetchAll(workflowId, nodeId, chunkSize = 1000) {
    const cacheKey = buildCacheKey({ workflowId, nodeId });
    yield* this.fetchAllByCacheKey(cacheKey, chunkSize);
  }

  /**
   * 流式读全量（cacheKey 直接路由，供 ctx.fetchAll 用）
   */
  async *fetchAllByCacheKey(cacheKey, chunkSize = 1000) {
    const info = this.nodeIndex.get(cacheKey);
    if (!info) throw new Error(`无结果: ${cacheKey}`);
    switch (info.type) {
      case STORE_TYPE.MEMORY:
        yield* this.memoryStore.fetchAll(cacheKey, chunkSize);
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

  /**
   * 按 cacheKey 释放单个节点结果
   */
  async releaseNodeByCacheKey(cacheKey) {
    const info = this.nodeIndex.get(cacheKey);
    if (!info) return;
    this.nodeIndex.delete(cacheKey);
    await this._releaseByInfo(info);
  }

  /**
   * 按 workflowId + nodeId 释放单个节点结果
   */
  async releaseNode(workflowId, nodeId) {
    const cacheKey = buildCacheKey({ workflowId, nodeId });
    await this.releaseNodeByCacheKey(cacheKey);
  }

  /**
   * 释放某个 workflow 的全部结果（标签页关闭时调）
   */
  async releaseWorkflow(workflowId) {
    const prefix = `${workflowId ?? "_"}:`;
    for (const [cacheKey, info] of [...this.nodeIndex.entries()]) {
      if (!cacheKey.startsWith(prefix)) continue;
      this.nodeIndex.delete(cacheKey);
      await this._releaseByInfo(info);
    }
  }

  /**
   * 清空全部结果
   */
  async clear() {
    for (const [cacheKey, info] of [...this.nodeIndex.entries()]) {
      this.nodeIndex.delete(cacheKey);
      await this._releaseByInfo(info);
    }
  }

  async _releaseByInfo(info) {
    if (info.type === STORE_TYPE.MEMORY) {
      await this.memoryStore.release(info.handle?.cacheKey ?? info.tableName);
    } else if (info.type === STORE_TYPE.SQLITE) {
      await this.sqliteClient.dropTable(info.tableName);
    } else if (info.type === STORE_TYPE.DUCKDB) {
      await this.duckdbClient.dropTable(info.tableName);
    }
  }
}
