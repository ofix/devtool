/**
 * 跨引擎统一数据句柄 (DataHandle)
 * 核心职责：作为所有引擎算子交互的通用“契约”，调度层只认这个结构。
 *
 * 约定：
 * - 绝对禁止在 payload 中放置未封装的裸数据（如巨大的数组），必须用引擎专属的句柄。
 * - 所有算子无论是物化、编译还是纯 JS 流，都必须返回符合此结构的对象。
 */
export class DataHandle {
  /**
   * @param {Object} options
   * @param {'table'|'json'} options.dataCategory 数据形态
   * @param {Array<{name:string, type:string}>} options.schema 列元数据（下游 UI 或算子依赖）
   * @param {Record<string, string|string[]>} options.columnMapping 字段血缘映射
   * @param {'physical_table'|'cte_fragment'|'js_stream'} options.kind 句柄类型标识
   * @param {any} options.payload 引擎专属载荷
   */
  constructor({ dataCategory, schema = [], columnMapping = {}, kind, payload }) {
    this.dataCategory = dataCategory
    this.schema = schema
    this.columnMapping = columnMapping
    this.kind = kind
    this.payload = payload
  }

  // 工厂方法，规范各个引擎的返回

  /**
   * 创建一个纯 JS 流式句柄
   */
  static jsStream({ schema, columnMapping, streamDataset }) {
    return new DataHandle({
      dataCategory: "table",
      schema,
      columnMapping,
      kind: "js_stream",
      payload: { streamDataset },
    })
  }

  /**
   * 创建一个 JSON 态句柄
   */
  static jsJson({ json, formattedText }) {
    return new DataHandle({
      dataCategory: "json", // 标识这是 JSON
      schema: [], // JSON 不需要 Schema
      columnMapping: {},
      kind: "js_stream", // 依然走流式通道，但内部吐的是整个 json
      payload: { json, formattedText },
    })
  }

  /**
   * 创建一个 DuckDB 物理表句柄（增量物化模式产出）
   */
  static duckPhysical({ schema, columnMapping, tableName }) {
    return new DataHandle({
      dataCategory: "table",
      schema,
      columnMapping,
      kind: "physical_table",
      payload: { tableName },
    })
  }

  /**
   * 创建一个 DuckDB 编译片段句柄（CTE 编译模式产出）
   */
  static duckCte({ schema, columnMapping, cteName, sqlFragment }) {
    return new DataHandle({
      dataCategory: "table",
      schema,
      columnMapping,
      kind: "cte_fragment",
      payload: { cteName, sqlFragment },
    })
  }
}
