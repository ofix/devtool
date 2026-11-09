/**
 * 跨引擎统一数据句柄 (DataHandle)
 * 调度层只认这个结构，不关心引擎内部细节。
 *
 * kind 取值：
 * - physical_table：已落物理表（立即执行模式）
 * - cte_fragment：只生成 CTE 片段（编译模式）
 * - js_stream：JS 流式句柄（js 引擎）
 * - json：JSON 结果
 */
export class DataHandle {
  constructor({
    dataCategory,
    schema = [],
    columnMapping = {},
    kind,
    payload,
    cacheKey,
    rowCount,
    storeType,
  }) {
    this.dataCategory = dataCategory;
    this.schema = schema;
    this.columnMapping = columnMapping;
    this.kind = kind;
    this.payload = payload;
    this.cacheKey = cacheKey;
    this.rowCount = rowCount;
    this.storeType = storeType;
  }

  get mode() {
    return this.kind === "cte_fragment" ? "compiled" : "executed";
  }

  /**
   * JS 流结果：调用方负责先物化到 memoryStore，再返回 memory 句柄。
   * 这里保留 jsStream 工厂仅用于“执行过程中的临时句柄”，不登记到 nodeIndex。
   */
  static jsStream({ schema, columnMapping, streamDataset }) {
    return new DataHandle({
      dataCategory: "table",
      schema,
      columnMapping,
      kind: "js_stream",
      payload: { streamDataset },
      storeType: null, // 未物化，不登记
    });
  }

  static jsJson({ json, formattedText, cacheKey, rowCount }) {
    return new DataHandle({
      dataCategory: "json",
      schema: [],
      columnMapping: {},
      kind: "json",
      payload: { json, formattedText },
      cacheKey,
      rowCount,
      storeType: "memory",
    });
  }

  static duckPhysical({ schema, columnMapping, tableName, cacheKey, rowCount }) {
    return new DataHandle({
      dataCategory: "table",
      schema,
      columnMapping,
      kind: "physical_table",
      payload: { tableName },
      cacheKey,
      rowCount,
      storeType: "duckdb",
    });
  }

  static duckCte({ schema, columnMapping, cteName, sqlFragment }) {
    return new DataHandle({
      dataCategory: "table",
      schema,
      columnMapping,
      kind: "cte_fragment",
      payload: { cteName, sqlFragment },
      storeType: null,
    });
  }

  static memory({ schema, columnMapping, cacheKey, rowCount, dataCategory = "table" }) {
    return new DataHandle({
      dataCategory,
      schema,
      columnMapping,
      kind: "physical_table",
      payload: {},
      cacheKey,
      rowCount,
      storeType: "memory",
    });
  }
}
