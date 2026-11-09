import { ResultSource } from "./contract/ResultSource.js";

export class MemoryResultStore extends ResultSource {
  constructor() {
    super();
    this.store = new Map();
  }

  set(cacheKey, rows, columns) {
    this.store.set(cacheKey, { rows, columns, total: rows.length });
  }

  async fetchWindow(cacheKey, offset, limit) {
    const c = this.store.get(cacheKey);
    if (!c) throw new Error(`无内存结果: ${cacheKey}`);
    const end = Math.min(offset + limit, c.total);
    return {
      rows: c.rows.slice(offset, end),
      columns: c.columns,
      total: c.total,
      hasMore: end < c.total,
    };
  }

  async *fetchAll(cacheKey, chunkSize = 1000) {
    const c = this.store.get(cacheKey);
    if (!c) throw new Error(`无内存结果: ${cacheKey}`);
    for (let i = 0; i < c.rows.length; i += chunkSize) {
      yield { rows: c.rows.slice(i, i + chunkSize) };
    }
  }

  async release(cacheKey) {
    this.store.delete(cacheKey);
  }

  clear() {
    this.store.clear();
  }
}
