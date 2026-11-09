import { BaseDuckOperator } from "./BaseDuckOperator.js";
import { DataHandle } from "../../../core/contract/DataHandle.js";

export class DuckCountRecords extends BaseDuckOperator {
  async executeSql(inputs, params, ctx) {
    const inputTable = ctx.getTableName(inputs[0].cacheKey);
    const outTable = ctx.outputTable;
    const fieldName = params.newField || "count";

    const sql = `CREATE TABLE "${outTable}" AS SELECT COUNT(*) AS "${fieldName}" FROM "${inputTable}"`;
    const outSchema = [{ name: fieldName, type: "number" }];

    return this._runAndReturnPhysical(outTable, sql, outSchema, { [fieldName]: [] }, ctx);
  }

  buildSql(inputs, params, ctx) {
    const cteName = `cte_${ctx.nodeId}`;
    const fieldName = params.newField || "count";
    const outSchema = [{ name: fieldName, type: "number" }];

    const upstreamRef = inputs[0].cteName
      ? `"${inputs[0].cteName}"`
      : `"${ctx.getTableName(inputs[0].cacheKey)}"`;

    return DataHandle.duckCte({
      schema: outSchema,
      columnMapping: { [fieldName]: [] },
      cteName,
      sqlFragment: `SELECT COUNT(*) AS "${fieldName}" FROM ${upstreamRef}`,
    });
  }
}
