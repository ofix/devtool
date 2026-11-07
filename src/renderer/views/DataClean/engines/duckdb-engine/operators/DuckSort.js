import { BaseDuckOperator } from "./BaseDuckOperator.js"
import { DataHandle } from "../../../core/contract/DataHandle.js"

export class DuckSort extends BaseDuckOperator {
  _buildOrderByClause(params) {
    const { sortField, order = "asc", nullPosition = "last" } = params
    if (!sortField) return ""

    // DuckDB 原生支持 NULLS FIRST / NULLS LAST，完美替代我们手写的逻辑
    const nullSql = nullPosition === "first" ? "NULLS FIRST" : "NULLS LAST"
    return `ORDER BY "${sortField}" ${order.toUpperCase()} ${nullSql}`
  }

  async executeSql(inputs, params, ctx) {
    const inputData = inputs[0]
    const inputTable = inputData.payload.tableName
    const outTable = `tbl_${ctx.nodeId}`
    const orderBy = this._buildOrderByClause(params)

    // DuckDB 会自动处理内存不够时的落盘逻辑，无论排 100 万行还是 1 亿行都不会 OOM
    const sql = `CREATE TABLE ${outTable} AS SELECT * FROM ${inputTable} ${orderBy}`

    return await this._runAndReturnPhysical(
      outTable,
      sql,
      inputData.schema,
      inputData.columnMapping,
    )
  }

  buildSql(inputs, params, ctx) {
    const inputData = inputs[0]
    const cteName = `cte_${ctx.nodeId}`
    const orderBy = this._buildOrderByClause(params)

    const sqlFragment = `SELECT * FROM ${inputData.payload.cteName} ${orderBy}`

    return DataHandle.duckCte({
      schema: inputData.schema,
      columnMapping: inputData.columnMapping,
      cteName,
      sqlFragment,
    })
  }
}
