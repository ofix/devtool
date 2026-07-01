import BaseClient from './BaseClient.js';

/**
 * 文件系统协议基类
 * 所有文件系统协议必须实现这些方法
 */
class BaseFsClient extends BaseClient {
    // 文件操作
    async readdir(path, options) { throw new Error('必须实现 readdir'); }
    async mkdir(path, options) { throw new Error('必须实现 mkdir'); }
    async rmdir(path, options) { throw new Error('必须实现 rmdir'); }
    async readFile(path, options) { throw new Error('必须实现 readFile'); }
    async writeFile(path, content, options) { throw new Error('必须实现 writeFile'); }

    async delete(path, options) { throw new Error('必须实现 delete'); }
    async rename(oldPath, newPath) { throw new Error('必须实现 rename'); }
    async exists(path) { throw new Error('必须实现 exists'); }
    async stat(path) { throw new Error('必须实现 stat'); }
}

export default BaseFsClient;