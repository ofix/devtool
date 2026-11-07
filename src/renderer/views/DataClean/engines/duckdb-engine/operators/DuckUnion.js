import { BaseDuckOperator } from "./BaseDuckOperator.js"
import { DataHandle } from "../../../core/contract/DataHandle.js"

export class DuckUnion extends BaseDuckOperator {
  // 因为是 N 路合并，需要把多张表 UNION ALL 拼起来
  async executeSql(inputs, params, ctx) {
    const outTable = `tbl_${ctx.nodeId}`
    const sqlParts = inputs.map(input => `SELECT * FROM ${input.payload.tableName}`)
    const sql = `CREATE TABLE ${outTable} AS ${sqlParts.join(" UNION ALL ")}`
    return await this._runAndReturnPhysical(outTable, sql, inputs[0].schema)
  }

  buildSql(inputs, params, ctx) {
    const cteName = `cte_${ctx.nodeId}`
    const sqlParts = inputs.map(input => `SELECT * FROM ${input.payload.cteName}`)
    const sqlFragment = sqlParts.join(" UNION ALL ")

    return DataHandle.duckCte({
      schema: inputs[0].schema,
      columnMapping: inputs[0].columnMapping,
      cteName,
      sqlFragment,
    })
  }
}
