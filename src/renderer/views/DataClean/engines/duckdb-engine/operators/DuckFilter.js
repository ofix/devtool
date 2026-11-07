import { BaseDuckOperator } from "./BaseDuckOperator.js"
import { DataHandle } from "../../../core/contract/DataHandle.js"

export class DuckFilter extends BaseDuckOperator {
  // 真实执行 SQL
  async executeSql(inputs, params, ctx) {
    const inputData = inputs[0]
    const inputTable = inputData.payload.tableName
    const outTable = `tbl_${ctx.nodeId}`

    const sql = `CREATE TABLE ${outTable} AS SELECT * FROM ${inputTable} WHERE ${params.expression}`
    return await this._runAndReturnPhysical(
      outTable,
      sql,
      inputData.schema,
      inputData.columnMapping,
    )
  }

  // 仅生成 CTE 片段
  buildSql(inputs, params, ctx) {
    const inputData = inputs[0]
    const cteName = `cte_${ctx.nodeId}`

    const sqlFragment = `SELECT * FROM ${inputData.payload.cteName} WHERE ${params.expression}`

    return DataHandle.duckCte({
      schema: inputData.schema,
      columnMapping: inputData.columnMapping,
      cteName,
      sqlFragment,
    })
  }
}
