/**
 * 算子执行上下文（OperatorContext）。
 *
 * 由 Scheduler 构造，注入到算子 execute() 的第三个参数。
 *
 * @typedef {object} OperatorContext
 * @property {string} taskId
 * @property {string} graphId                 图 id
 * @property {string} nodeId                  当前节点 id
 * @property {string} cacheKey                当前节点逻辑 key
 * @property {string} outputTable             当前节点输出物理表名
 * @property {"eager"|"lazy"} executeMode     执行模式
 * @property {AbortSignal} signal
 * @property {function} log
 * @property {number} duration                任务已运行时长（毫秒）
 * @property {number|null} timeoutMs          任务超时阈值，null 不超时
 * @property {DuckdbClient} duckdb
 * @property {SqliteClient} sqlite
 * @property {MemoryResultStore} memoryStore
 * @property {(cacheKey: string) => string|null} getTableName
 * @property {(cacheKey: string, chunkSize: number) => AsyncIterable} fetchAllRecords
 * @property {(cacheKey: string, offset: number, limit: number) => Promise<{rows: any[], total: number, hasMore: boolean}>} fetchWindowRecords
 */
export {};