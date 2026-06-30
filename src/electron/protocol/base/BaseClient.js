import { EventEmitter } from "events";

class BaseClient extends EventEmitter {
    // 连接管理
    async connect(options) { throw new Error('必须实现 connect'); }
    async disconnect() { throw new Error('必须实现 disconnect'); }
    async isConnected(conn) { throw new Error('必须实现 isConnected'); }
    getConnection() { throw new Error('必须实现 getConnection'); }

    // 统计
    getStatus() { return {}; }
    getStats() { return {}; }
}

export default BaseClient;
