import { ipcMain } from 'electron';
import sevenBin from '7zip-bin';
import node7z from 'node-7z';
const { extract, list } = node7z;
// import mmap from 'mmap-io';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import os from 'os';
import Utils from './Utils.js';
import SFTPService from '../service/SFTPService.js';
import { fileTypeDetector } from './FileTypeDetector.js';

// 内存映射文件管理器
class MMFileManager {
    static #instance = null;
    constructor(options = {}) {
        this.threadCount = options.threadCount || os.cpus().length;
        this.tempDir = options.tempDir || path.join(os.tmpdir(), 'devtools');
        // 7-Zip初始化
        if (!fsSync.existsSync(sevenBin.path7za)) {
            throw new Error(`7-Zip 二进制文件不存在：${sevenBin.path7za} `);
        }

        console.log("sevenBin.path7za = ", sevenBin.path7za);

        // 核心缓存
        this.mmfHandles = new Map(); // 完整路径 → MMF句柄
        this.fileMeta = new Map();   // 完整路径 → { archivePath, isEdited }
        this.archiveMap = new Map(); // 压缩包路径 → [文件完整路径列表]（批量管理核心）

        // 初始化
        this._initTempDir();
        this._registerIPC();
    }

    /** 单例获取 */
    static getInstance(options = {}) {
        if (!MMFileManager.#instance) {
            MMFileManager.#instance = new MMFileManager(options);
        }
        return MMFileManager.#instance;
    }

    _initTempDir() {
        if (!fsSync.existsSync(this.tempDir)) {
            fsSync.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /** 注册极简IPC */
    _registerIPC() {
        ipcMain.handle('mmf:extract', (_, archivePath) => this.extract(archivePath));
        ipcMain.handle('mmf:loadFileContents', (_, remoteFile) => this.loadFileContents(remoteFile));
        ipcMain.handle('mmf:write', (_, fullPath, offset = 0, data) => this.write(fullPath, offset, data));
        ipcMain.handle('mmf:save', (_, fullPath, outputPath) => this.save(fullPath, outputPath));
        ipcMain.handle('mmf:compress-gz', (_, fullPath, outputPath) => this.compressGZ(fullPath, outputPath));
        ipcMain.handle('mmf:decompress-gz', (_, gzPath) => this.decompressGZ(gzPath));
        ipcMain.handle('mmf:clear-by-archive', (_, archivePath) => this.clearByArchive(archivePath));
        ipcMain.handle('mmf:clear-single', (_, fullPath) => this.clearSingle(fullPath));
    }

    async loadFileContents(remoteFile) {
        // 映射远程文件到本地路径
        let localFilePath = await Utils.ensureRemoteFilePath(remoteFile.host, remoteFile.path);
        // SCP 下载远程服务器文件到本地
        const sftp = await SFTPService.create(remoteFile);
        let conn = await sftp.getSSHClient(remoteFile.host);
        await sftp.downloadFile(conn, remoteFile.path, localFilePath, null);

        // 检查文件是否是压缩文件
        if (fileTypeDetector.isArchiveFile(localFilePath)) {
            // 4. 解压文件（核心逻辑：区分单/多文件）
            let extractResult = await this.extractFile(localFilePath);
            if (!extractResult.success) {
                console.warn(`解压失败：${extractResult.error} `);
                return "";
            }

            // 根据解压结果读取内容（单文件直接读，多文件默认读第一个）
            let content = "";
            if (extractResult.fileCount > 0) {
                // 优先读第一个有效文件
                const targetFile = extractResult.isSingleFile
                    ? extractResult.path
                    : extractResult.filePaths[0];
                content = await fs.readFile(targetFile, 'utf-8');
            }
            return { success: true, data: content };
        }

        // 非压缩文件，直接读取
        content = await fs.readFile(localFilePath, 'utf-8');
        return { success: true, data: content };
    }


    /**
  * 辅助方法：列出压缩包内的所有文件（不解压，用于判断单/多文件）
  * 适配 node-7z@3.0 + 修复单文件解析问题
  * @param {string} archiveFilePath 压缩文件路径
  * @returns {Promise<string[]>} 压缩包内的文件路径列表（相对路径）
  */
    async #listArchiveFiles(archiveFilePath) {
        // 前置校验：压缩文件存在性
        if (!fsSync.existsSync(archiveFilePath)) {
            return Promise.reject(new Error(`压缩文件不存在：${archiveFilePath}`));
        }

        return new Promise((resolve, reject) => {
            const fileList = [];
            // node-7z@3.0 调用 list 方法（核心：指定 bin 路径，移除 $ 前缀）
            const listStream = list(archiveFilePath);

            // 场景1：v3.0 新版本解析（返回结构化对象）
            let isStructuredData = false;
            listStream
                .on('data', (chunk) => {
                    console.log(chunk);
                    // 分支1：node-7z@3.0 结构化输出（{ type: 'file', name: 'xxx' }）
                    if (typeof chunk === 'object' && chunk !== null) {
                        isStructuredData = true;
                        // 只保留文件，过滤目录
                        if (chunk.type === 'file' && chunk.name) {
                            console.log(chunk);
                            const entryPath = chunk.name.trim();
                            // 过滤空路径 + 确保是文件（排除目录）
                            if (entryPath) {
                                fileList.push(entryPath);
                            }
                        }
                    }
                    // 分支2：兼容旧版纯文本输出（兜底逻辑）
                    else {
                        const lines = chunk.toString().split(os.EOL);
                        lines.forEach(line => {
                            console.log(line);
                            const pathMatch = line.match(/^Path = (.*)$/);
                            if (pathMatch && pathMatch[1]) {
                                const entryPath = pathMatch[1].trim();
                                // 过滤目录：有扩展名 + 不以 /\ 结尾
                                if (entryPath && path.extname(entryPath) && !entryPath.endsWith('/') && !entryPath.endsWith('\\')) {
                                    fileList.push(entryPath);
                                }
                            }
                        });
                    }
                })
                // 流结束：去重 + 去空 + 返回结果
                .on('end', () => {
                    // 去重 + 过滤空字符串（避免单文件场景下的空项）
                    const uniqueFiles = [...new Set(fileList)].filter(file => !!file);
                    // 修复单文件场景：确保至少返回1项
                    resolve(uniqueFiles);
                })
                // 错误处理：捕获流错误 + 超时
                .on('error', (err) => {
                    reject(new Error(`读取压缩包列表失败：${err.message}（文件：${archiveFilePath}）`));
                });

            // 超时兜底：防止流卡死（5秒超时）
            setTimeout(() => {
                if (!listStream.destroyed) {
                    listStream.destroy();
                    reject(new Error(`读取压缩包列表超时：${archiveFilePath}`));
                }
            }, 5000);
        });
    }

    // ---------------- 以下是依赖的辅助方法/核心方法（确保逻辑闭环） ----------------
    /**
     * 辅助方法：递归获取目录下的所有文件
     * @param {string} dir 目录路径
     * @returns {string[]} 文件路径列表
     */
    #getAllFilesInDir(dir) {
        let files = [];
        if (!fsSync.existsSync(dir)) return files;

        const entries = fsSync.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isFile()) {
                files.push(fullPath);
            } else if (entry.isDirectory()) {
                files = files.concat(this.#getAllFilesInDir(fullPath));
            }
        }
        return files;
    }

    /**
  * 简化版：直接解压 .gz 文件（跳过列表检测，单文件直接解压）
  * @param {string} archiveFilePath 压缩文件路径
  * @returns {Promise<{success: boolean, path?: string, error?: string}>}
  */
    async #extractGzFile(archiveFilePath) {
        try {
            // .gz 解压后文件名（去掉 .gz 后缀）
            const targetFileName = path.basename(archiveFilePath, '.gz');
            const targetFilePath = path.join(path.dirname(archiveFilePath), targetFileName);

            // 7za 解压 .gz 命令（直接指定输出文件）
            const args = [
                'e', // e = 提取文件（忽略目录结构，适合单文件）
                archiveFilePath.includes(' ') ? `"${archiveFilePath}"` : archiveFilePath,
                `-o${path.dirname(archiveFilePath)}`, // 输出目录
                '-y', // 覆盖已有文件
                '-aoa', // 强制覆盖
                '-scsUTF-8' // 中文编码
            ];

            return new Promise((resolve, reject) => {
                // 关键：shell=true + 固定路径
                const child = spawn(sevenBin.path7za, args, {
                    shell: true,
                    stdio: 'ignore', // 忽略输出，提升速度
                    cwd: path.dirname(archiveFilePath) // 切换工作目录
                });

                child.on('close', (code) => {
                    if (code === 0 && fsSync.existsSync(targetFilePath)) {
                        resolve({ success: true, path: targetFilePath });
                    } else {
                        reject(new Error(`.gz 解压失败，退出码：${code}`));
                    }
                });

                child.on('error', (err) => {
                    reject(new Error(`解压 .gz 失败：${err.message}`));
                });

                // 超时兜底
                setTimeout(() => {
                    if (!child.killed) {
                        child.kill();
                        reject(new Error(`.gz 解压超时`));
                    }
                }, 8000);
            });
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * 核心解压方法（调用 #listArchiveFiles）
     * @param {string} archiveFilePath 压缩文件路径
     * @returns {Promise<{success: boolean, fileCount: number, isSingleFile: boolean, path?: string, dirPath?: string, filePaths?: string[], error?: string}>}
     */
    async extractFile(archiveFilePath) {
        try {
            // 场景1：.gz 文件（单文件压缩，直接解压）
            if (archiveFilePath.endsWith('.gz')) {
                const gzResult = await this.#extractGzFile(archiveFilePath);
                if (gzResult.success) {
                    return {
                        success: true,
                        fileCount: 1,
                        isSingleFile: true,
                        path: gzResult.path
                    };
                } else {
                    return { success: false, fileCount: 0, isSingleFile: false, error: gzResult.error };
                }
            }

            // 1. 获取压缩包内文件列表（核心调用修复后的 #listArchiveFiles）
            const archiveFiles = await this.#listArchiveFiles(archiveFilePath);
            if (archiveFiles.length === 0) {
                return {
                    success: false,
                    fileCount: 0,
                    isSingleFile: false,
                    error: `压缩包内无有效文件：${archiveFilePath}`
                };
            }

            // 2. 判断单/多文件
            const isSingleFile = archiveFiles.length === 1;
            const archiveDir = path.dirname(archiveFilePath);
            const archiveName = path.basename(archiveFilePath, path.extname(archiveFilePath));
            const extractDirForMulti = path.join(archiveDir, `${archiveName}_extracted`);
            const extractTarget = isSingleFile ? archiveDir : extractDirForMulti;

            // 3. 确保解压目录存在
            if (!isSingleFile && !fsSync.existsSync(extractTarget)) {
                fsSync.mkdirSync(extractTarget, { recursive: true });
            }

            // 4. 执行解压
            await new Promise((resolve, reject) => {
                extract(archiveFilePath, extractTarget, {
                    $bin: sevenBin.path7za,
                    args: ['-y', `-mmt=${os.cpus().length}`, '-aoa', '-bsp1', '-r', '-scsUTF-8']
                })
                    .on('end', resolve)
                    .on('error', (err) => reject(new Error(`解压失败：${err.message}`)));
            });

            // 5. 获取解压后的文件列表
            const extractedFiles = isSingleFile
                ? [path.join(archiveDir, path.basename(archiveFiles[0]))]
                : this.#getAllFilesInDir(extractTarget);

            return {
                success: true,
                fileCount: extractedFiles.length,
                isSingleFile: isSingleFile,
                path: isSingleFile ? extractedFiles[0] : undefined,
                dirPath: isSingleFile ? undefined : extractTarget,
                filePaths: extractedFiles
            };
        } catch (err) {
            return {
                success: false,
                fileCount: 0,
                isSingleFile: false,
                error: err.message
            };
        }
    }

}

const mmFileManager = MMFileManager.getInstance();
export default mmFileManager;