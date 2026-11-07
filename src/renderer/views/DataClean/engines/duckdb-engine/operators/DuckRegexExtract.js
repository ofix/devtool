import { BaseDuckOperator } from "./BaseDuckOperator.js"
import { DataHandle } from "../../../core/contract/DataHandle.js"

export class DuckRegexExtract extends BaseDuckOperator {
  _buildSelectClause(params) {
    const { sourceField, regex, newField } = params
    // DuckDB 原生支持 regexp_extract，比 JS 的 RegExp 引擎快得多
    return `*, regexp_extract("${sourceField}", '${regex}', 1) AS "${newField}"`
  }

  async executeSql(inputs, params, ctx) {
    const inputData = inputs[0]
    const outTable = `tbl_${ctx.nodeId}`
    const selectClause = this._buildSelectClause(params)

    const sql = `CREATE TABLE ${outTable} AS SELECT ${selectClause} FROM ${inputData.payload.tableName}`
    const outSchema = [...inputData.schema, { name: params.newField, type: "string" }]
    return await this._runAndReturnPhysical(outTable, sql, outSchema)
  }

  buildSql(inputs, params, ctx) {
    const inputData = inputs[0]
    const cteName = `cte_${ctx.nodeId}`
    const selectClause = this._buildSelectClause(params)

    const outSchema = [...inputData.schema, { name: params.newField, type: "string" }]
    return DataHandle.duckCte({
      schema: outSchema,
      columnMapping: { ...inputData.columnMapping, [params.newField]: params.sourceField },
      cteName,
      sqlFragment: `SELECT ${selectClause} FROM ${inputData.payload.cteName}`,
    })
  }
}
