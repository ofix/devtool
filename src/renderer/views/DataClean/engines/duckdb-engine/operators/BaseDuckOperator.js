import { IExecutor } from "../../../core/contract/IExecutor.js";

export class BaseDuckOperator extends IExecutor {
  async execute(inputPorts, params, ctx) {
    if (ctx.executeMode === "lazy") {
      return this.buildSql(inputPorts, params, ctx);
    }
    return this.executeSql(inputPorts, params, ctx);
  }

  async executeSql(inputPorts, params, ctx) {
    throw new Error(`${this.constructor.name} 未实现 executeSql`);
  }

  buildSql(inputPorts, params, ctx) {
    throw new Error(`${this.constructor.name} 未实现 buildSql`);
  }
}