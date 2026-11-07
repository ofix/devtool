import { BaseDuckOperator } from "./BaseDuckOperator.js"
import { DataHandle } from "../../../core/contract/DataHandle.js"

export class DuckUnique extends BaseDuckOperator {
  _buildSelectClause(params) {
    let keyFields = params.keyFields || []
    if (keyFields.length === 0) return "DISTINCT *"
    return `DISTINCT ON (${keyFields.map(f => `"${f}"`).join(", ")}) *`
  }

  async executeSql(inputs, params, ctx) {
    const inputData = inputs[0]
    const inputTable = inputData.payload.tableName
    const outTable = `tbl_${ctx.nodeId}`
    const selectClause = this._buildSelectClause(params)

    const sql = `CREATE TABLE ${outTable} AS SELECT ${selectClause} FROM ${inputTable}`
    return await this._runAndReturnPhysical(outTable, sql, inputData.schema)
  }

  buildSql(inputs, params, ctx) {
    const inputData = inputs[0]
    const cteName = `cte_${ctx.nodeId}`
    const selectClause = this._buildSelectClause(params)

    const sqlFragment = `SELECT ${selectClause} FROM ${inputData.payload.cteName}`
    return DataHandle.duckCte({
      schema: inputData.schema,
      columnMapping: inputData.columnMapping,
      cteName,
      sqlFragment,
    })
  }
}
