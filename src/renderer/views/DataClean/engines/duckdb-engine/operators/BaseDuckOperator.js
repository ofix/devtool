import { IExecutor } from "../../../core/contract/IExecutor.js"
import { DataHandle } from "../../../core/contract/DataHandle.js"

export class BaseDuckOperator extends IExecutor {
  constructor(translator) {
    super()
    this.translator = translator
  }

  /**
   * 统一执行入口
   * 根据上下文策略，路由到“拼 SQL”或“执行 SQL”
   */
  async execute(inputs, params, ctx) {
    if (ctx.executionStrategy === "compiled") {
      return this.buildSql(inputs, params, ctx)
    }
    return this.executeSql(inputs, params, ctx)
  }

  // 通用辅助：执行建表 SQL 并返回物理表句柄
  async _runAndReturnPhysical(outTable, sql, schema, columnMapping = {}) {
    await this.translator.executeQuery(sql)
    return DataHandle.duckPhysical({
      schema,
      columnMapping,
      tableName: outTable,
    })
  }

  // 子类必须实现：真实执行 SQL（调试/增量模式）
  async executeSql(inputs, params, ctx) {
    throw new Error(`${this.constructor.name} 未实现 executeSql`)
  }

  // 子类必须实现：仅生成 SQL 片段（编译模式）
  buildSql(inputs, params, ctx) {
    throw new Error(`${this.constructor.name} 未实现 buildSql`)
  }
}
