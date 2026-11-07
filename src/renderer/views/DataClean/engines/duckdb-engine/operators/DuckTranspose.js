import { BaseDuckOperator } from "./BaseDuckOperator.js"
import { DataHandle } from "../../../core/contract/DataHandle.js"

export class DuckTranspose extends BaseDuckOperator {
  _buildUnpivotSql(tableRef, params) {
    const keepFields = params.keepFields || []
    const unpivotFields = params.unpivotFields || []
    if (unpivotFields.length === 0) return `SELECT * FROM ${tableRef}`

    const keepStr = keepFields.map(f => `"${f}"`).join(", ")
    const unpivotStr = unpivotFields.map(f => `"${f}"`).join(", ")

    // DuckDB UNPIVOT 语法：UNPIVOT table ON col1, col2 INTO NAME key VALUE value
    return `UNPIVOT ${tableRef} ON ${unpivotStr} INTO NAME key VALUE value`
  }

  async executeSql(inputs, params, ctx) {
    const inputData = inputs[0]
    const outTable = `tbl_${ctx.nodeId}`
    const sqlBody = this._buildUnpivotSql(inputData.payload.tableName, params)

    const sql = `CREATE TABLE ${outTable} AS ${sqlBody}`

    // 推算 Schema
    const keepFields = params.keepFields || []
    const outSchema = [
      ...keepFields.map(f => ({ name: f, type: "string" })),
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ]
    return await this._runAndReturnPhysical(outTable, sql, outSchema)
  }

  buildSql(inputs, params, ctx) {
    const inputData = inputs[0]
    const cteName = `cte_${ctx.nodeId}`
    const sqlBody = this._buildUnpivotSql(inputData.payload.cteName, params)

    const keepFields = params.keepFields || []
    const outSchema = [
      ...keepFields.map(f => ({ name: f, type: "string" })),
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ]

    return DataHandle.duckCte({
      schema: outSchema,
      columnMapping: {},
      cteName,
      sqlFragment: sqlBody,
    })
  }
}
