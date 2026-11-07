/**
 * 内存态数据集（适用于小文件，如 < 2MB）
 * 内部保存完整的 rows 数组，但对外提供异步迭代器接口，保持与流式 Dataset 接口一致。
 */
export default class InMemoryDataset {
  constructor({ dataCategory, rows, columns, json = null }) {
    this.dataCategory = dataCategory
    this.rows = rows || []
    this.columns = columns || []
    this.json = json
    this.isStream = false
  }

  /**
   * 伪装成流，一次性将全量数据吐出
   */
  async *[Symbol.asyncIterator]() {
    yield this.rows
  }

  /**
   * 供预览面板快速读取
   */
  async take(limit = 1000) {
    return {
      columns: this.columns,
      rows: this.rows.slice(0, limit),
      dataCategory: this.dataCategory,
      json: this.json,
    }
  }
}
