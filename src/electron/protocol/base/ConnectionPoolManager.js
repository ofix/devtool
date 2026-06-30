import ConnectionPool from "./ConnectionPool.js";
/**
 * 通用连接池管理器，支持多协议、多服务地址
 */
class ConnectionPoolManager {
    constructor() {
      // Map<唯一标识, ConnectionPool>
      this.connPoolMap = new Map();
    }
  
    /**
     * 生成服务唯一key，区分协议+地址+账号
     * @param {string} protocol 协议 sftp/mysql/redis
     * @param {object} cfg 连接配置 {ip, port, username}
     * @returns {string}
     */
    genKey(protocol, cfg) {
      const { ip, port, username } = cfg;
      return `${protocol}#${ip}:${port}:${username}`;
    }
  
    /**
     * 获取/创建对应服务的连接池
     * @param {string} protocol
     * @param {object} cfg 服务地址账号配置
     * @param {object} poolOpts {min, max, idleTimeout}
     * @param {ConnAdapter} adapter 对应协议适配器
     * @returns {ConnectionPool}
     */
    getPool(options = {} ) {
      const {
        protocol, cfg, min,max,idleTimeout, adapter
      } = options;
      const key = this.genKey(protocol, cfg);
      if (this.connPoolMap.has(key)) {
        return this.connPoolMap.get(key);
      }
  
      // 新建通用连接池
      const pool = new ConnectionPool({
        adapter,
        min: min ?? 1,
        max: max ?? 10,
        idleTimeout: idleTimeout ?? 60000
      });

      pool.on('connectionCreated', msg => console.log(`[全局池] 创建连接:${msg}`));
      pool.on('connectionDestroyed', msg => console.log(`[全局池] 销毁连接:${msg}`));
      pool.on('error', err => console.error(`[全局池] 异常:${err}`));
  
      this.connPoolMap.set(key, pool);
  
      // 池子销毁时自动从缓存移除
      pool.on("poolDestroyed", () => {
        if (this.connPoolMap.get(key) === pool) {
          this.connPoolMap.delete(key);
        }
      });
  
      return pool;
    }
  
    /**
     * 销毁指定服务的全部连接并移除池子
     */
    async destroyPool(protocol, cfg) {
      const key = this.genKey(protocol, cfg);
      const pool = this.connPoolMap.get(key);
      if (pool) {
        await pool.destroy();
        this.connPoolMap.delete(key);
      }
    }
  
    /**
     * 销毁所有协议所有池子
     */
    async destroyAll() {
      const pools = Array.from(this.connPoolMap.values());
      for (const pool of pools) {
        await pool.destroy();
      }
      this.connPoolMap.clear();
    }
  
    /**
     * 清理长期闲置无使用的池子（定时调用）
     * @param {number} idleMs 闲置阈值
     */
    async cleanIdlePools(idleMs = 10 * 60 * 1000) {
      // 可扩展：给每个pool记录最后使用时间，超过阈值销毁
      // this.connPoolMap.forEach((pool, key) => { ... })
    }
  }
  
  // 全局单例，整个应用共用
  export const connPoolManager = new ConnectionPoolManager();
  export default ConnectionPoolManager;
  