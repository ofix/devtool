/**
 * 流数据集（数据载体的标准契约）
 * 它是算子与算子之间传递的“水龙头”
 * 注意：它只是一个容器，真正的数据流转靠 controller.sourceGenerator
 */
export default class StreamDataset {
  /**
   * @param {Object} options
   * @param {String} options.dataCategory 'table' | 'json' | 'scalar'
   * @param {Array} options.columns 列元数据
   * @param {Object} options.controller 流控制器 { sourceGenerator, strategy }
   * @param {Object} options.columnMapping 字段血缘字典
   */
  constructor({ dataCategory, columns = [], controller, columnMapping = {} }) {
    this.dataCategory = dataCategory
    this.columns = columns
    this.controller = controller
    this.columnMapping = columnMapping

    // 标记这是流式数据
    this.isStream = true
  }
}
