import { BaseDuckOperator } from "./BaseDuckOperator.js";
import { NodeResult } from "../../../core/contract/NodeResult.js";

export class DuckFilter extends BaseDuckOperator {
  async executeSql(inputPorts, params, ctx) {
    const inputTable = ctx.getTableName(inputPorts[0].recordSetsKey);
    const outTable = ctx.outputTable;
    const sql = `CREATE TABLE "${outTable}" AS SELECT * FROM "${inputTable}" WHERE ${params.expression}`;
    const { rowCount } = await ctx.duckdb.run(sql);
    return NodeResult.dbTable({
      tableName: outTable,
      storeType: "duckdb",
      recordSetsKey: ctx.cacheKey,
      rowCount,
      columns: inputPorts[0].columns,
      columnMapping: inputPorts[0].columnMapping,
    });
  }

  buildSql(inputPorts, params, ctx) {
    const sqlCteName = `cte_${ctx.nodeId}`;
    const upstreamRef = inputPorts[0].sqlCteName
      ? `"${inputPorts[0].sqlCteName}"`
      : `"${ctx.getTableName(inputPorts[0].recordSetsKey)}"`;
    return NodeResult.sqlCte({
      sqlCteName,
      sqlFragment: `SELECT * FROM ${upstreamRef} WHERE ${params.expression}`,
      columns: inputPorts[0].columns,
      columnMapping: inputPorts[0].columnMapping,
    });
  }
}
