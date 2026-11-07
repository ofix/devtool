import { BaseDuckOperator } from "./BaseDuckOperator.js"
import { DataHandle } from "../../../core/contract/DataHandle.js"

export class DuckTextToColumns extends BaseDuckOperator {
  async executeSql(inputs, params, ctx) {
    const inputData = inputs[0]
    const outTable = `tbl_${ctx.nodeId}`
    const { sourceField, delimiter = ",", newFieldPrefix = "split" } = params

    // 因为列数是动态的，在 SQL 里动态生成列比较麻烦
    // 这里我们采用折中方案：建一个包含数组的新列，或者限制最多拆分成 5 列
    // 为了完美复刻 JS 逻辑，我们只生成最多 5 列
    const selectParts = [`* EXCLUDE ("${sourceField}")`]
    for (let i = 1; i <= 5; i++) {
      selectParts.push(
        `string_split("${sourceField}", '${delimiter}')[${i}] AS "${newFieldPrefix}_${i}"`,
      )
    }

    const sql = `CREATE TABLE ${outTable} AS SELECT ${selectParts.join(", ")} FROM ${inputData.payload.tableName}`

    const outSchema = [
      ...inputData.schema.filter(c => c.name !== sourceField),
      ...Array.from({ length: 5 }).map((_, i) => ({
        name: `${newFieldPrefix}_${i + 1}`,
        type: "string",
      })),
    ]
    return await this._runAndReturnPhysical(outTable, sql, outSchema)
  }

  buildSql(inputs, params, ctx) {
    const inputData = inputs[0]
    const cteName = `cte_${ctx.nodeId}`
    const { sourceField, delimiter = ",", newFieldPrefix = "split" } = params

    const selectParts = [`* EXCLUDE ("${sourceField}")`]
    for (let i = 1; i <= 5; i++) {
      selectParts.push(
        `string_split("${sourceField}", '${delimiter}')[${i}] AS "${newFieldPrefix}_${i}"`,
      )
    }

    const outSchema = [
      ...inputData.schema.filter(c => c.name !== sourceField),
      ...Array.from({ length: 5 }).map((_, i) => ({
        name: `${newFieldPrefix}_${i + 1}`,
        type: "string",
      })),
    ]

    return DataHandle.duckCte({
      schema: outSchema,
      columnMapping: {},
      cteName,
      sqlFragment: `SELECT ${selectParts.join(", ")} FROM ${inputData.payload.cteName}`,
    })
  }
}
