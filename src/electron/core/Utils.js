import { app } from 'electron';
import { join } from 'node:path';
import path from 'path';
import fs from 'fs';
import Print from './Print.js';

class Utils {
    // 改为静态 getter，延迟执行 app.getPath()
    static get sysDownloadDir() {
        return app.getPath('downloads');
    }

    static get sysDocumentDir() {
        return app.getPath('documents');
    }

    static get sysAppData() {
        return app.getPath('appData');
    }

    static get temp() {
        return app.getPath('temp');
    }

    static get desktop() {
        return app.getPath('desktop');
    }

    constructor() {
        throw new Error('Utils 不能被实例化');
    }

    static async sftpLocalDir(host) {
        const dir = join(Utils.sysDocumentDir, 'devtool', `sftp.${host}`);
        await this.ensureDir(dir);
        return dir;
    }


    /**************************************************************
     * 同步确保文件夹存在，若不存在则递归创建（支持嵌套目录）
     * @param {string} filePath - 目标文件夹路径（相对路径或绝对路径）
     * @param {Object} [options] - 可选配置（同 fs.mkdirSync 的 options）
     * @param {number} [options.mode=0o777] - 目录权限（默认 0o777，受系统 umask 影响）
     * @param {boolean} [options.recursive=true] - 是否递归创建嵌套目录（默认 true，强制开启）
     * @throws {Error} 非目录相关的错误（如权限不足、路径非法等）
     **************************************************************/
    static async ensureDir(filePath, ignoreFileName = false) {
        // 避免相对路径歧义
        let absolutePath = path.resolve(filePath);
        try {
            if (ignoreFileName) {
                absolutePath = path.dirname(absolutePath);
            }
            await fs.promises.mkdir(absolutePath, {
                recursive: true,
                mode: 0o777
            });
        } catch (err) {
            Print.error(err.message);
            if (err.code !== 'EEXIST') {  // 忽略 "目录已存在" 的错误（不同系统错误码可能不同，统一捕获）
                throw err;
            }
        }
        return true;
    }

    static async sftpDownloadMetaDir() {
        const dir = join(Utils.sysDocumentDir, 'devtool', '.sftp.state');
        await this.ensureDir(dir);
        return dir;
    }

    /**************************************************************
     * 批量创建目录（支持嵌套目录，幂等性：目录已存在不报错）
     * @param {Array<String>} dirs - 要创建的目录路径列表
     **************************************************************/
    static async mkdirs(dirs) {
        // 防御性处理：过滤空目录数组、空路径
        if (!Array.isArray(dirs) || dirs.length === 0) {
            Print.warn('无需要创建的目录');
            return;
        }

        try {
            // 并发创建所有目录（高效）
            await Promise.all(
                dirs.map(async (dir) => {
                    // 过滤空路径，避免无效调用
                    if (typeof dir !== 'string' || !dir.trim()) return;
                    // 使用 fs.promises.mkdir（Promise 式，支持 await）
                    await fs.promises.mkdir(dir.trim(), {
                        recursive: true, // 自动创建嵌套目录（关键）
                        mode: 0o755 // 可选：设置目录权限（Linux/macOS）
                    });
                })
            );
            Print.log(`成功创建 ${dirs.length} 个目录`);
        } catch (err) {
            // 捕获所有错误，避免 UnhandledPromiseRejection
            Print.error('批量创建目录失败：', err.message);
            throw err; // 可选：抛出错误让调用方处理
        }
    }

    /**************************************************************
     * @todo 获取不存在的文件夹（本地比远程多则返回远程缺失目录，反之返回本地缺失目录）
     * @param {String} localRootDir - 本地根目录路径
     * @param {Array<String>} localDirs - 本地目录列表（绝对路径）
     * @param {String} remoteRootDir - 远程根目录路径
     * @param {Array<String>} remoteDirs - 远程目录列表（绝对路径）
     * @returns {Array<String>} 缺失的目录列表（绝对路径）
     **************************************************************/
    static getMissingDirs(localRootDir, localDirs, remoteRootDir, remoteDirs) {
        // 极简路径标准化：仅统一分隔符（无额外校验，保持轻量）
        const normalize = p => p?.replace(/\\/g, '/').replace(/\/+/g, '/') || '';

        // 提取相对路径（极简实现，依赖业务保证目录归属根路径）
        const getRelative = (full, root) => {
            const normalizedFull = normalize(full);
            const normalizedRoot = normalize(root);
            return normalizedFull.startsWith(normalizedRoot)
                ? normalizedFull.slice(normalizedRoot.length).replace(/^\/+/, '')
                : '';
        };

        // 按目录数量判断方向，按需处理（仅标准化当前方向所需路径）
        if (localDirs.length > remoteDirs.length) {
            // 本地 → 远程：仅标准化本地目录、远程根目录、远程已存在目录
            const localRootNorm = normalize(localRootDir);
            const remoteRootNorm = normalize(remoteRootDir);
            const remoteExistingSet = new Set(remoteDirs.map(normalize));

            return localDirs
                .map(dir => path.posix.join(remoteRootNorm, getRelative(dir, localRootNorm)))
                .filter(remoteDir => !remoteExistingSet.has(remoteDir))
                .concat(localDirs.length && !remoteDirs.length ? [remoteRootNorm] : []);
        } else {
            // 远程 → 本地：仅标准化远程目录、本地根目录、本地已存在目录
            const remoteRootNorm = normalize(remoteRootDir);
            const localRootNorm = normalize(localRootDir);
            const localExistingSet = new Set(localDirs.map(normalize));

            return remoteDirs
                .map(dir => path.posix.join(localRootNorm, getRelative(dir, remoteRootNorm)))
                .filter(localDir => !localExistingSet.has(localDir))
                .concat(remoteDirs.length && !localDirs.length ? [localRootNorm] : []);
        }
    }
}

export default Utils;