/**
 * 结果源统一接口：MemoryResultStore / SqliteClient / DuckdbClient 都实现它。
 */
export class ResultSource {
  async fetchWindow(cacheKeyOrTable, offset, limit) {
    throw new Error("fetchWindow() 必须由具体实现重写");
  }

  async *fetchAll(cacheKeyOrTable, chunkSize) {
    throw new Error("fetchAll() 必须由具体实现重写");
  }

  async release(key) {
    throw new Error("release() 必须由具体实现重写");
  }
}
