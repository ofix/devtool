import BaseClient from './BaseClient.js';

/**
 * 执行协议基类
 */
class BaseExecClient extends BaseClient {
    // 执行命令
    async exec(command, options) { throw new Error('必须实现 exec'); }
    async execStream(command, options) { throw new Error('可选实现'); }
    
    // 会话管理
    async startSession() { throw new Error('必须实现 startSession'); }
    async endSession(session) { throw new Error('必须实现 endSession'); }
    
    // 文件传输（部分支持）
    async uploadFile(local, remote) { throw new Error('可选实现'); }
    async downloadFile(remote, local) { throw new Error('可选实现'); }
}

export default BaseExecClient;