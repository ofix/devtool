import { BaseDuckOperator } from "./BaseDuckOperator.js"
import { DataHandle } from "../../../core/contract/DataHandle.js"

export class DuckSelect extends BaseDuckOperator {
  // 生成 SELECT 列表达式
  _buildSelectClause(params) {
    let keepCols = params.columns || []
    const renameMap = {}
    if (params.renameMap && params.renameMap.trim()) {
      params.renameMap.split(",").forEach(pair => {
        const [oldName, newName] = pair.split(":").map(s => s.trim())
        if (oldName && newName) renameMap[oldName] = newName
      })
    }

    if (keepCols.length === 0) return "*" // 如果没选，默认全保留

    return keepCols
      .map(c => {
        const newName = renameMap[c] || c
        return newName === c ? `"${c}"` : `"${c}" AS "${newName}"`
      })
      .join(", ")
  }

  async executeSql(inputs, params, ctx) {
    const inputData = inputs[0]
    const inputTable = inputData.payload.tableName
    const outTable = `tbl_${ctx.nodeId}`
    const selectClause = this._buildSelectClause(params)

    // 因为改名的关系，物化模式下直接用 SQL 生成新表
    const sql = `CREATE TABLE ${outTable} AS SELECT ${selectClause} FROM ${inputTable}`
    await this._runAndReturnPhysical(outTable, sql, inputData.schema)
  }

  buildSql(inputs, params, ctx) {
    const inputData = inputs[0]
    const cteName = `cte_${ctx.nodeId}`
    const selectClause = this._buildSelectClause(params)

    const sqlFragment = `SELECT ${selectClause} FROM ${inputData.payload.cteName}`

    return DataHandle.duckCte({
      schema: inputData.schema, // 简化处理，实际上列名可能被改名了
      columnMapping: inputData.columnMapping,
      cteName,
      sqlFragment,
    })
  }
}
