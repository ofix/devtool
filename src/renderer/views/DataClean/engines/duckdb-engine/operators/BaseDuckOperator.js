import { IExecutor } from "../../../core/contract/IExecutor.js";
import { DataHandle } from "../../../core/contract/DataHandle.js";

export class BaseDuckOperator extends IExecutor {
  async execute(inputs, params, ctx) {
    if (ctx.executionMode === "compiled") {
      return this.buildSql(inputs, params, ctx);
    }
    return this.executeSql(inputs, params, ctx);
  }

  /**
   * 执行建表 SQL，返回物理表句柄
   * @param {string} outTable
   * @param {string} sql
   * @param {Array} schema
   * @param {object} columnMapping
   * @param {object} ctx
   */
  async _runAndReturnPhysical(outTable, sql, schema, columnMapping, ctx) {
    const { rowCount } = await ctx.duckdb.run(sql);
    return DataHandle.duckPhysical({
      schema,
      columnMapping: columnMapping ?? {},
      tableName: outTable,
      cacheKey: ctx.cacheKey,
      rowCount,
    });
  }

  async executeSql(inputs, params, ctx) {
    throw new Error(`${this.constructor.name} 未实现 executeSql`);
  }

  buildSql(inputs, params, ctx) {
    throw new Error(`${this.constructor.name} 未实现 buildSql`);
  }
}
