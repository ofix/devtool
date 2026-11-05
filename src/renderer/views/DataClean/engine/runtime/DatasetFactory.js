import InMemoryDataset from "./InMemoryDataset.js"
import StreamDataset from "./StreamDataset.js"

export default class DatasetFactory {
  // 2MB 阈值
  static SIZE_THRESHOLD = 2 * 1024 * 1024

  /**
   * 自动判断走内存还是流式
   * @param {Number} sizeBytes 文件大小（字节）
   * @param {Function} memoryFactory 生成内存 Dataset 的回调
   * @param {Function} streamFactory 生成流式 Dataset 的回调
   */
  static createAdaptive(sizeBytes, memoryFactory, streamFactory) {
    if (sizeBytes < this.SIZE_THRESHOLD) {
      return memoryFactory()
    } else {
      return streamFactory()
    }
  }
}
