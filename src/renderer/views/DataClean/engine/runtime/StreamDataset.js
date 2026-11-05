/**
 * 流式数据集（适用于大文件）
 * 每次 yield 一个 Chunk（数据块，如 50000 行）。
 */
export default class StreamDataset {
  /**
   * @param {String} dataCategory 数据分类 ('table' | 'json')
   * @param {AsyncGenerator} generator 数据块生成器
   * @param {Array} columns 列元数据（Table 必传）
   * @param {Object} meta 其他元数据
   */
  constructor({ dataCategory, generator, columns = [], meta = {} }) {
    this.dataCategory = dataCategory
    this.generator = generator
    this.columns = columns
    this.meta = meta
    this.isStream = true
  }

  [Symbol.asyncIterator]() {
    return this.generator()
  }

  /**
   * 流式预览截断
   */
  async take(limit = 1000) {
    const previewRows = []
    let count = 0
    for await (const chunk of this.generator()) {
      for (const row of chunk) {
        previewRows.push(row)
        count++
        if (count >= limit) break
      }
      if (count >= limit) break
    }
    return {
      columns: this.columns,
      rows: previewRows,
      dataCategory: this.dataCategory,
    }
  }
}
