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

    static sftpDownloadDir (host) {
        const dir = join(Utils.sysDocumentDir, 'devtool', `sftp.${host}`);
        this.ensureDirSync(dir);
        return dir;
    }


    /**
     * 同步确保文件夹存在，若不存在则递归创建（支持嵌套目录）
     * @param {string} filePath - 目标文件夹路径（相对路径或绝对路径）
     * @param {Object} [options] - 可选配置（同 fs.mkdirSync 的 options）
     * @param {number} [options.mode=0o777] - 目录权限（默认 0o777，受系统 umask 影响）
     * @param {boolean} [options.recursive=true] - 是否递归创建嵌套目录（默认 true，强制开启）
     * @throws {Error} 非目录相关的错误（如权限不足、路径非法等）
     */
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
}

export default Utils;