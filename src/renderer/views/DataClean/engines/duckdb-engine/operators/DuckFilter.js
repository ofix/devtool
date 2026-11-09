import { BaseDuckOperator } from "./BaseDuckOperator.js";
import { DataHandle } from "../../../core/contract/DataHandle.js";

export class DuckFilter extends BaseDuckOperator {
  async executeSql(inputs, params, ctx) {
    const inputTable = ctx.getTableName(inputs[0].cacheKey);
    const outTable = ctx.outputTable;

    const sql = `CREATE TABLE "${outTable}" AS SELECT * FROM "${inputTable}" WHERE ${params.expression}`;

    return this._runAndReturnPhysical(
      outTable,
      sql,
      inputs[0].schema,
      inputs[0].columnMapping,
      ctx,
    );
  }

  buildSql(inputs, params, ctx) {
    const cteName = `cte_${ctx.nodeId}`;
    const upstreamRef = inputs[0].cteName
      ? `"${inputs[0].cteName}"`
      : `"${ctx.getTableName(inputs[0].cacheKey)}"`;

    return DataHandle.duckCte({
      schema: inputs[0].schema,
      columnMapping: inputs[0].columnMapping,
      cteName,
      sqlFragment: `SELECT * FROM ${upstreamRef} WHERE ${params.expression}`,
    });
  }
}
