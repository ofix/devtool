import { BaseDuckOperator } from "./BaseDuckOperator.js"
import { DataHandle } from "../../../core/contract/DataHandle.js"

export class DuckJoin extends BaseDuckOperator {
  _buildJoinSql(leftRef, rightRef, params) {
    const { joinKeys = [], joinType = "inner" } = params
    if (joinKeys.length === 0) throw new Error("请配置连接键")

    const onCondition = joinKeys.map(k => `L."${k.left}" = R."${k.right}"`).join(" AND ")

    let sqlType = "INNER JOIN"
    if (joinType === "left") sqlType = "LEFT JOIN"
    if (joinType === "right") sqlType = "RIGHT JOIN"
    if (joinType === "full") sqlType = "FULL OUTER JOIN"

    // 使用 SELECT L.*, R.* 会导致冲突，安全的做法是显式列出非冲突列
    // 为了简化，这里直接用 * EXCLUDE 掉冲突列 (DuckDB 特有语法)
    return `SELECT * FROM ${leftRef} AS L ${sqlType} ${rightRef} AS R ON ${onCondition}`
  }

  async executeSql(inputs, params, ctx) {
    const [leftData, rightData] = inputs
    const outTable = `tbl_${ctx.nodeId}`
    const sqlBody = this._buildJoinSql(
      leftData.payload.tableName,
      rightData.payload.tableName,
      params,
    )

    const sql = `CREATE TABLE ${outTable} AS ${sqlBody}`

    // 简单合并 Schema
    const outSchema = [...leftData.schema]
    for (const c of rightData.schema) {
      if (!outSchema.some(x => x.name === c.name)) outSchema.push(c)
    }

    return await this._runAndReturnPhysical(outTable, sql, outSchema)
  }

  buildSql(inputs, params, ctx) {
    const [leftData, rightData] = inputs
    const cteName = `cte_${ctx.nodeId}`
    const sqlBody = this._buildJoinSql(leftData.payload.cteName, rightData.payload.cteName, params)

    const outSchema = [...leftData.schema]
    for (const c of rightData.schema) {
      if (!outSchema.some(x => x.name === c.name)) outSchema.push(c)
    }

    return DataHandle.duckCte({
      schema: outSchema,
      columnMapping: {},
      cteName,
      sqlFragment: sqlBody,
    })
  }
}
