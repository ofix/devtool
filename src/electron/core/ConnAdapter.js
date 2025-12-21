/**
 * 连接适配器抽象类
 */
export default class ConnAdapter {
  /**
   * 创建连接
   * @returns {Promise<*>} 连接实例
   */
  async create() {
    throw new Error("必须实现create方法");
  }

  /**
   * 销毁连接
   * @param {*} connection 连接实例
   * @returns {Promise<void>}
   */
  async destroy(connection) {
    throw new Error("必须实现destroy方法");
  }

  /**
   * 验证连接是否有效（可选扩展，用于检测无效连接）
   * @param {*} connection 连接实例
   * @returns {Promise<boolean>}
   */
  async isValid(connection) {
    // 默认返回true，具体适配器可重写
    return Promise.resolve(true);
  }
}