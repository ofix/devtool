/**
 * 节点执行结果（NodeResult）
 *
 * 每个算子 execute() 必须返回 NodeResult 实例。
 *
 * outputRecordSetsKind：
 * - db_table：已落数据库表（DuckDB / SQLite）
 * - sql_cte：只生成 SQL CTE 片段（lazy 模式）
 * - json：JSON 结果（内存）
 * - text：文本结果（命令输出等）
 *
 * storeType：
 * - duckdb / sqlite：db_table 的存储位置
 * - memory：json / text 的存储位置
 * - null：sql_cte
 */
export class NodeResult {
    /**
     * @param {object} p
     * @param {"db_table"|"sql_cte"|"json"|"text"} p.outputRecordSetsKind
     * @param {"duckdb"|"sqlite"|"memory"|null} p.storeType
     * @param {string} [p.recordSetsKey]
     * @param {number} [p.rowCount]
     * @param {Column[]} [p.columns]
     * @param {object} [p.jsonOutline]
     * @param {object} [p.columnMapping]
     * @param {object} p.payload
     */
    constructor({
      outputRecordSetsKind,
      storeType = null,
      recordSetsKey,
      rowCount,
      columns = [],
      jsonOutline = null,
      columnMapping = {},
      payload,
    }) {
      this.outputRecordSetsKind = outputRecordSetsKind;
      this.storeType = storeType;
      this.recordSetsKey = recordSetsKey;
      this.rowCount = rowCount;
      this.columns = columns;
      this.jsonOutline = jsonOutline;
      this.columnMapping = columnMapping;
      this.payload = payload;
    }
  
    static dbTable({ tableName, storeType = "duckdb", recordSetsKey, rowCount, columns, columnMapping }) {
      return new NodeResult({
        outputRecordSetsKind: "db_table",
        storeType,
        recordSetsKey,
        rowCount,
        columns,
        columnMapping,
        payload: { tableName },
      });
    }
  
    static sqlCte({ sqlCteName, sqlFragment, columns, columnMapping }) {
      return new NodeResult({
        outputRecordSetsKind: "sql_cte",
        storeType: null,
        columns,
        columnMapping,
        payload: { sqlCteName, sqlFragment },
      });
    }
  
    static json({ json, formattedText, recordSetsKey, rowCount, jsonOutline = null }) {
      return new NodeResult({
        outputRecordSetsKind: "json",
        storeType: "memory",
        recordSetsKey,
        rowCount,
        columns: [],
        jsonOutline,
        columnMapping: {},
        payload: { json, formattedText },
      });
    }
  
    static text({ text, recordSetsKey, rowCount }) {
      return new NodeResult({
        outputRecordSetsKind: "text",
        storeType: "memory",
        recordSetsKey,
        rowCount,
        columns: [],
        columnMapping: {},
        payload: { text },
      });
    }
  }
  
  /**
   * @typedef {object} Column
   * @property {string} name
   * @property {string} type
   */