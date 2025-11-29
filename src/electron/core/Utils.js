import { app } from 'electron';
import { join } from 'node:path';
import path from 'path';
import fs from 'fs';
import Print from './Print.js';

class Utils {
    // 改为静态 getter，延迟执行 app.getPath()
    static get sysDownloadDir () {
        return app.getPath('downloads');
    }

    static get sysDocumentDir () {
        return app.getPath('documents');
    }

    static get sysAppData () {
        return app.getPath('appData');
    }

    static get temp () {
        return app.getPath('temp');
    }

    static get desktop () {
        return app.getPath('desktop');
    }

    constructor() {
        throw new Error('Utils 不能被实例化');
    }

    static sftpLocalDir (host) {
        const dir = join(Utils.sysDocumentDir, 'devtool', `sftp.${host}`);
        this.ensureDirSync(dir);
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
    static ensureDirSync (filePath, ignoreFileName = false) {
        // 避免相对路径歧义
        let absolutePath = path.resolve(filePath);
        try {
            if (ignoreFileName) {
                absolutePath = path.dirname(absolutePath);
            }
            fs.mkdirSync(absolutePath, {
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

    static sftpDownloadMetaDir () {
        const dir = join(Utils.sysDocumentDir, 'devtool', '.sftp.state');
        Utils.ensureDirSync(dir);
        return dir;
    }

    /**************************************************************
     * @todo 获取不存在的文件夹
     * @param {String} localRootDir 
     * @param {Array<String>} localDirs 
     * @param {String} remoteRootDir 
     * @param {Array<String>} remoteDirs 
     * @returns 
     **************************************************************/
    static getMissingDirs (localRootDir, localDirs, remoteRootDir, remoteDirs) {
        // 1. 统一路径分隔符（Windows \ → /，避免映射错误）
        const normalizeLocalPath = (p) => p.replace(/\\/g, '/');
        const normalizedLocalRoot = normalizeLocalPath(localRootDir);

        // 2. 本地子目录 → 远程子目录：映射逻辑
        const remoteSubDirs = localDirs.map((localDir) => {
            const normalizedLocalDir = normalizeLocalPath(localDir);
            // 提取本地子目录相对于本地根的路径（如 css、fonts/img）
            const relativeDir = normalizedLocalDir.replace(normalizedLocalRoot + '/', '');
            // 拼接为远程绝对路径（如 /usr/share/www/upload/css）
            return path.posix.join(remoteRootDir, relativeDir); // posix.join 确保 Linux 路径分隔符
        });

        // 3. 排除远程已存在的目录（忽略大小写？Linux 路径大小写敏感，按原字符串匹配）
        const existingRemoteDirsSet = new Set(remoteDirs);
        const dirsMissing = remoteSubDirs.filter(
            (remoteDir) => !existingRemoteDirsSet.has(remoteDir)
        );

        if (remoteDirs.length == 0) {
            dirsMissing.push(remoteRootDir);
        }

        return dirsMissing;
    }
}

export default Utils;