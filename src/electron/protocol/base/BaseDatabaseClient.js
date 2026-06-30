import BaseClient from './BaseClient.js';

/**
 * 数据库协议基类
 */
class BaseDatabaseClient extends BaseClient {
    // 数据库操作
    async query(sql, params) { throw new Error('必须实现 query'); }
    async execute(sql, params) { throw new Error('必须实现 execute'); }
    async transaction(callback) { throw new Error('必须实现 transaction'); }
    async getTables() { throw new Error('必须实现 getTables'); }
    async getSchema(table) { throw new Error('必须实现 getSchema'); }
    
    // 连接池特有
    async getConnection() { throw new Error('必须实现 getConnection'); }
    async releaseConnection(conn) { throw new Error('必须实现 releaseConnection'); }
}

export default BaseDatabaseClient;