import { BaseDuckOperator } from "./BaseDuckOperator.js"
import { DataHandle } from "../../../core/contract/DataHandle.js"

export class DuckSample extends BaseDuckOperator {
  async executeSql(inputs, params, ctx) {
    const inputData = inputs[0]
    const inputTable = inputData.payload.tableName
    const outTable = `tbl_${ctx.nodeId}`
    const n = parseInt(params.count, 10) || 1000

    const mode = params.mode === "random" ? "USING SAMPLE" : ""
    const sql = `CREATE TABLE ${outTable} AS SELECT * FROM ${inputTable} LIMIT ${n}`
    return await this._runAndReturnPhysical(outTable, sql, inputData.schema)
  }

  buildSql(inputs, params, ctx) {
    const inputData = inputs[0]
    const cteName = `cte_${ctx.nodeId}`
    const n = parseInt(params.count, 10) || 1000

    const sqlFragment = `SELECT * FROM ${inputData.payload.cteName} LIMIT ${n}`
    return DataHandle.duckCte({
      schema: inputData.schema,
      columnMapping: inputData.columnMapping,
      cteName,
      sqlFragment,
    })
  }
}
