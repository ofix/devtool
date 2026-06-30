import { SimpleSftpClient, LocalClient } from '../protocol/index.js';
import Singleton from './Singleton.js';

class ClientManager extends Singleton {
    constructor() {
        super();
        this._clients = new Map(); // key: protocol+config, value: client instance
    }

    /**
     * 获取客户端（根据协议和配置）
     * 相同配置复用同一个客户端实例
     */
    getClient(protocol, options = {}) {
        const key = this._getKey(protocol, options);

        if (!this._clients.has(key)) {
            let client;
            switch (protocol) {
                case 'local':
                    client = new LocalClient(options);
                    break;
                case 'sftp':
                    client = new SimpleSftpClient(options);
                    break;
                default:
                    throw new Error(`不支持的协议: ${protocol}`);
            }

            this._clients.set(key, client);
            console.log(`[ClientManager] 创建 ${protocol} 客户端`);
        }

        return this._clients.get(key);
    }

    /**
     * 生成唯一键
     */
    _getKey(protocol, options) {
        if (protocol === 'local') {
            return `local:${options.rootPath || process.cwd()}`;
        }

        if (protocol === 'sftp') {
            return `sftp:${options.username}@${options.host}:${options.port || 22}`;
        }

        return `${protocol}:${JSON.stringify(options)}`;
    }

    /**
     * 获取所有客户端统计
     */
    getStats() {
        const stats = {};
        for (const [key, client] of this._clients) {
            if (typeof client.getStats === 'function') {
                stats[key] = client.getStats();
            }
        }
        return stats;
    }

    /**
     * 清理所有客户端
     */
    async cleanup() {
        for (const [key, client] of this._clients) {
            if (typeof client.cleanup === 'function') {
                await client.cleanup();
            }
        }
        this._clients.clear();
    }
}

export default ClientManager;