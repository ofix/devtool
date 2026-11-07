import { BaseDuckOperator } from "./BaseDuckOperator.js"
import { DataHandle } from "../../../core/contract/DataHandle.js"

export class DuckSummarize extends BaseDuckOperator {
  _buildAggConfigs(params) {
    let groupFields = params.groupFields || []
    const aggConfigs = []
    if (params.aggregations && params.aggregations.trim()) {
      params.aggregations.split(",").forEach(pair => {
        const [field, func] = pair.split(":").map(s => s.trim())
        if (field && func) aggConfigs.push({ field, func: func.toUpperCase() })
      })
    }
    return { groupFields, aggConfigs }
  }

  _buildSelectClause(groupFields, aggConfigs) {
    const groupSql = groupFields.map(f => `"${f}"`).join(", ")
    const aggSql = aggConfigs
      .map(cfg => {
        return `${cfg.func}("${cfg.field}") AS "${cfg.field}_${cfg.func}"`
      })
      .join(", ")
    return `${groupSql ? groupSql + ", " : ""}${aggSql}`
  }

  async executeSql(inputs, params, ctx) {
    const inputData = inputs[0]
    const inputTable = inputData.payload.tableName
    const outTable = `tbl_${ctx.nodeId}`
    const { groupFields, aggConfigs } = this._buildAggConfigs(params)
    const selectClause = this._buildSelectClause(groupFields, aggConfigs)
    const groupBy =
      groupFields.length > 0 ? `GROUP BY ${groupFields.map(f => `"${f}"`).join(", ")}` : ""

    const sql = `CREATE TABLE ${outTable} AS SELECT ${selectClause} FROM ${inputTable} ${groupBy}`

    // Schema 推演
    const outSchema = [
      ...groupFields.map(f => ({ name: f, type: "string" })),
      ...aggConfigs.map(cfg => ({ name: `${cfg.field}_${cfg.func}`, type: "number" })),
    ]
    return await this._runAndReturnPhysical(outTable, sql, outSchema)
  }

  buildSql(inputs, params, ctx) {
    const inputData = inputs[0]
    const cteName = `cte_${ctx.nodeId}`
    const { groupFields, aggConfigs } = this._buildAggConfigs(params)
    const selectClause = this._buildSelectClause(groupFields, aggConfigs)
    const groupBy =
      groupFields.length > 0 ? `GROUP BY ${groupFields.map(f => `"${f}"`).join(", ")}` : ""

    const sqlFragment = `SELECT ${selectClause} FROM ${inputData.payload.cteName} ${groupBy}`
    const outSchema = [
      ...groupFields.map(f => ({ name: f, type: "string" })),
      ...aggConfigs.map(cfg => ({ name: `${cfg.field}_${cfg.func}`, type: "number" })),
    ]
    return DataHandle.duckCte({
      schema: outSchema,
      columnMapping: {}, // 聚合后的血缘
      cteName,
      sqlFragment,
    })
  }
}
