import { BaseDuckOperator } from "./BaseDuckOperator.js"
import { DataHandle } from "../../../core/contract/DataHandle.js"

export class DuckCountRecords extends BaseDuckOperator {
  async executeSql(inputs, params, ctx) {
    const inputData = inputs[0]
    const outTable = `tbl_${ctx.nodeId}`
    const fieldName = params.newField || "count"

    const sql = `CREATE TABLE ${outTable} AS SELECT COUNT(*) AS "${fieldName}" FROM ${inputData.payload.tableName}`
    const outSchema = [{ name: fieldName, type: "number" }]
    return await this._runAndReturnPhysical(outTable, sql, outSchema)
  }

  buildSql(inputs, params, ctx) {
    const inputData = inputs[0]
    const cteName = `cte_${ctx.nodeId}`
    const fieldName = params.newField || "count"

    const outSchema = [{ name: fieldName, type: "number" }]
    return DataHandle.duckCte({
      schema: outSchema,
      columnMapping: { [fieldName]: [] },
      cteName,
      sqlFragment: `SELECT COUNT(*) AS "${fieldName}" FROM ${inputData.payload.cteName}`,
    })
  }
}
