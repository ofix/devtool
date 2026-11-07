/**
 * 统一算子执行契约
 */
export class IExecutor {
  /**
   * @param {Object[]} inputs 上游节点输出的标准化 DataHandle 数组
   * @param {Object} params 算子参数
   * @param {TaskContext} ctx 任务上下文
   * @returns {Promise<DataHandle>}
   */
  async execute(inputs, params, ctx) {
    throw new Error("execute() 方法必须由具体实现类重写")
  }
}
