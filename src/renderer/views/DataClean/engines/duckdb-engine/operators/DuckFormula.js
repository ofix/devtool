import { BaseDuckOperator } from "./BaseDuckOperator.js"
import { DataHandle } from "../../../core/contract/DataHandle.js"

export class DuckFormula extends BaseDuckOperator {
  // 假设用户的表达式是标准 SQL 语法，比如 "price * quantity"
  // 如果是可视化表达式，这里需要写一个转换器
  _buildSelectClause(params) {
    const { newField, expression } = params
    return `*, (${expression}) AS "${newField}"`
  }

  async executeSql(inputs, params, ctx) {
    const inputData = inputs[0]
    const inputTable = inputData.payload.tableName
    const outTable = `tbl_${ctx.nodeId}`
    const selectClause = this._buildSelectClause(params)

    const sql = `CREATE TABLE ${outTable} AS SELECT ${selectClause} FROM ${inputTable}`
    const outSchema = [...inputData.schema, { name: params.newField, type: "string" }]
    return await this._runAndReturnPhysical(outTable, sql, outSchema)
  }

  buildSql(inputs, params, ctx) {
    const inputData = inputs[0]
    const cteName = `cte_${ctx.nodeId}`
    const selectClause = this._buildSelectClause(params)

    const sqlFragment = `SELECT ${selectClause} FROM ${inputData.payload.cteName}`
    const outSchema = [...inputData.schema, { name: params.newField, type: "string" }]
    return DataHandle.duckCte({
      schema: outSchema,
      columnMapping: { ...inputData.columnMapping, [params.newField]: [] },
      cteName,
      sqlFragment,
    })
  }
}
