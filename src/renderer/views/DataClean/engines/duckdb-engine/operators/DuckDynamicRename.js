import { BaseDuckOperator } from "./BaseDuckOperator.js"
import { DataHandle } from "../../../core/contract/DataHandle.js"

export class DuckDynamicRename extends BaseDuckOperator {
  _buildSelectClause(params, schema) {
    const renameMap = {}
    if (params.renameMap && params.renameMap.trim()) {
      params.renameMap.split(",").forEach(pair => {
        const [oldName, newName] = pair.split(":").map(s => s.trim())
        if (oldName && newName) renameMap[oldName] = newName
      })
    }
    const { prefix = "", suffix = "" } = params

    const parts = schema.map(c => {
      let name = renameMap[c.name] || c.name
      const finalName = `${prefix}${name}${suffix}`
      return finalName === c.name ? `"${c.name}"` : `"${c.name}" AS "${finalName}"`
    })
    return parts.join(", ")
  }

  async executeSql(inputs, params, ctx) {
    const inputData = inputs[0]
    const outTable = `tbl_${ctx.nodeId}`
    const selectClause = this._buildSelectClause(params, inputData.schema)

    const sql = `CREATE TABLE ${outTable} AS SELECT ${selectClause} FROM ${inputData.payload.tableName}`
    return await this._runAndReturnPhysical(outTable, sql, inputData.schema)
  }

  buildSql(inputs, params, ctx) {
    const inputData = inputs[0]
    const cteName = `cte_${ctx.nodeId}`
    const selectClause = this._buildSelectClause(params, inputData.schema)

    return DataHandle.duckCte({
      schema: inputData.schema,
      columnMapping: inputData.columnMapping,
      cteName,
      sqlFragment: `SELECT ${selectClause} FROM ${inputData.payload.cteName}`,
    })
  }
}
