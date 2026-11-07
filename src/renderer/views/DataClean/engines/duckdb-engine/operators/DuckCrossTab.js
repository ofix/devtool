import { BaseDuckOperator } from "./BaseDuckOperator.js"
import { DataHandle } from "../../../core/contract/DataHandle.js"

export class DuckCrossTab extends BaseDuckOperator {
  _buildPivotSql(tableRef, params) {
    const { rowField, colField, valField, aggFunc = "SUM" } = params
    // DuckDB PIVOT 语法：PIVOT tbl ON col USING SUM(val) GROUP BY row
    return `PIVOT ${tableRef} ON "${colField}" USING ${aggFunc}("${valField}") GROUP BY "${rowField}"`
  }

  async executeSql(inputs, params, ctx) {
    const inputData = inputs[0]
    const outTable = `tbl_${ctx.nodeId}`
    const sqlBody = this._buildPivotSql(inputData.payload.tableName, params)

    const sql = `CREATE TABLE ${outTable} AS ${sqlBody}`
    // 因为列是动态的，这里不传死 schema，让 DuckDB 自己去推断（返回后可以通过 DESCRIBE 查询）
    return await this._runAndReturnPhysical(outTable, sql, inputData.schema)
  }

  buildSql(inputs, params, ctx) {
    const inputData = inputs[0]
    const cteName = `cte_${ctx.nodeId}`
    const sqlBody = this._buildPivotSql(inputData.payload.cteName, params)

    return DataHandle.duckCte({
      schema: [], // 动态列，编译态下推演较难，可置空
      columnMapping: {},
      cteName,
      sqlFragment: sqlBody,
    })
  }
}
