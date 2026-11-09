export const STORE_TYPE = {
  MEMORY: "memory",
  SQLITE: "sqlite",
  DUCKDB: "duckdb",
};

/**
 * 根据算子 executionMode 和上游位置决定结果存哪
 * @param {{ executionMode: string, upstreamTypes: string[], estimatedRows?: number }} opts
 */
export function decideStoreType(opts) {
  const { executionMode, upstreamTypes = [], estimatedRows = 0 } = opts;

  if (executionMode === "duckdb-sql") {
    // 上游全在 DuckDB → 直接落 DuckDB
    if (upstreamTypes.every(t => t === STORE_TYPE.DUCKDB)) {
      return { type: STORE_TYPE.DUCKDB, mode: "direct" };
    }
    // 上游含其他 → 前端读、推回 DuckDB
    return { type: STORE_TYPE.DUCKDB, mode: "push" };
  }

  // 前端计算：小结果放内存，大结果推 DuckDB
  if (estimatedRows > 0 && estimatedRows <= 5000) {
    return { type: STORE_TYPE.MEMORY };
  }
  return { type: STORE_TYPE.DUCKDB, mode: "push" };
}
