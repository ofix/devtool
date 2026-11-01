// 数据库连接池管理器：统一管理实例的生命周期
import { DB_DRIVERS } from "./DBDrivers.js"

class DbManager {
  constructor() {
    this.connections = new Map()
  }

  /**
   * 创建并测试数据库连接
   * @param {string} nodeId 节点 ID，作为连接池的 Key
   * @param {object} params 连接参数
   */
  async createConnection(nodeId, params) {
    // 如果已存在，先销毁
    await this.destroyConnection(nodeId)

    const driver = DB_DRIVERS[params.dialect]
    if (!driver) throw new Error(`不支持的数据库类型: ${params.dialect}`)

    // 动态加载依赖
    await driver.loadDriver()
    const knex = (await import("knex")).default

    const config = driver.isFileBased
      ? {
          client: driver.knexClient,
          connection: { filename: params.filePath },
          useNullAsDefault: true,
        }
      : {
          client: driver.knexClient,
          connection: {
            host: params.host,
            port: params.port || driver.defaultPort,
            database: params.database,
            user: params.user,
            password: params.password,
          },
        }

    const instance = knex(config)

    // 测试连接
    try {
      await instance.raw("SELECT 1")
    } catch (err) {
      await instance.destroy()
      throw new Error(`数据库连接失败: ${err.message}`)
    }

    this.connections.set(nodeId, instance)
    return instance
  }

  /**
   * 获取连接实例
   * @param {string} nodeId
   */
  getConnection(nodeId) {
    return this.connections.get(nodeId)
  }

  /**
   * 销毁连接
   * @param {string} nodeId
   */
  async destroyConnection(nodeId) {
    if (this.connections.has(nodeId)) {
      const instance = this.connections.get(nodeId)
      await instance.destroy()
      this.connections.delete(nodeId)
    }
  }

  /**
   * 销毁所有连接（管线关闭时调用）
   */
  async destroyAll() {
    for (const [nodeId] of this.connections) {
      await this.destroyConnection(nodeId)
    }
  }
}

export const dbManager = new DbManager()
