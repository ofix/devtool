import { ipcMain } from 'electron';
import sevenBin from '7zip-bin';
import { SevenZip } from 'node-7z';
import mmap from 'mmap-io';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import SFTPService from '../service/SFTPService';
import { fileTypeDetector } from './FileTypeDetector';

// 内存映射文件管理器
class MMFileManager {
    static #instance = null;
    constructor(options = {}) {
        this.threadCount = options.threadCount || os.cpus().length;
        this.tempDir = options.tempDir || path.join(os.tmpdir(), 'devtools');
        console.log("创建内存映射文件管理器：", this.tempDir, "线程数：", this.threadCount);

        // 7-Zip初始化
        this.sevenZip = new SevenZip(sevenBin.path7za);

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
        ipcMain.handle('mmf:loadFileContents', (_, fileMeta) => this.loadFileContents(fileMeta));
        ipcMain.handle('mmf:write', (_, fullPath, offset = 0, data) => this.write(fullPath, offset, data));
        ipcMain.handle('mmf:save', (_, fullPath, outputPath) => this.save(fullPath, outputPath));
        ipcMain.handle('mmf:compress-gz', (_, fullPath, outputPath) => this.compressGZ(fullPath, outputPath));
        ipcMain.handle('mmf:decompress-gz', (_, gzPath) => this.decompressGZ(gzPath));
        ipcMain.handle('mmf:clear-by-archive', (_, archivePath) => this.clearByArchive(archivePath));
        ipcMain.handle('mmf:clear-single', (_, fullPath) => this.clearSingle(fullPath));
    }

    async loadFileContents(fileMeta) {
        // 检查cache是否存在
        let cacheKey = fileMeta.host + ':' + fileMeta.path;
        if (this.mmfHandles.has(cacheKey)) {
            const handle = this.mmfHandles.get(cacheKey);
            return handle.map;
        }

        // 创建内存映射（零拷贝）
        const mmfHandle = await this.createEmptyMMF(cacheKey, fileMeta.size);

        // SCP下载直接写入MMF
        await SFTPService.downloadToMMF(
            fileMeta.host,
            fileMeta.remoteFile,
            mmfHandle, // 仅传fd和buffer
            0,
            null,
        );

        // 标记MMF为已写入
        this.fileMeta.set(cacheKey, {
            archivePath: fileMeta.remoteFile,
            isEdited: false,
            isEmpty: false
        });

        // 文件下载完成后检查是否是压缩文件
        if (fileTypeDetector.isArchiveFile(mmfHandle.buffer)) {
            // 解压到MMF
            let uncompassFileName = fileTypeDetector.removeArchiveSuffix(fileMeta.remoteFile);
            await this.extractFileToMMF(fileMeta.remoteFile, uncompassFileName);
        }

        return mmfHandle.buffer;  // 返回 ArrayBuffer
    }

    // 解压单个文件到MMF
    async extractFileToMMF(archivePath, filePath) {
        // 缓存键
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(path.dirname(archivePath), filePath);
        if (this.mmfHandles.has(fullPath)) return fullPath;

        // 创建临时文件（基于完整路径哈希）
        const tempName = Buffer.from(fullPath).toString('hex');
        const tempPath = path.join(this.tempDir, tempName);

        // 7-Zip解压到临时文件
        await this.sevenZip.extract(archivePath, filePath, {
            $bin: sevenBin.path7za,
            args: [`-so`, `-mmt=${this.threadCount}`]
        }).pipe(fsSync.createWriteStream(tempPath));

        // 等待文件写入完成
        await new Promise((resolve, reject) => {
            const writeStream = fsSync.createWriteStream(tempPath);
            this.sevenZip.extract(archivePath, filePath, {
                $bin: sevenBin.path7za,
                args: [`-so`, `-mmt=${this.threadCount}`]
            })
                .pipe(writeStream)
                .on('finish', resolve)
                .on('error', reject);
        });

        // 内存映射
        const stats = await fs.stat(tempPath);
        const fd = fsSync.openSync(tempPath, 'r+');

        const buffer = mmap.map(
            fd,
            stats.size,
            mmap.PROT_READ | mmap.PROT_WRITE,
            mmap.MAP_SHARED,
            0
        );

        // 缓存状态
        this.mmfHandles.set(fullPath, {
            fd: fd,
            fileHandle: { fd: fd },  // 保持接口兼容
            buffer: buffer,          // mmap-io 返回的是 ArrayBuffer
            fileSize: fileMeta.size,
            size: stats.size,
            tempPath
        });

        this.fileMeta.set(fullPath, {
            archivePath, // 关联所属压缩包
            isEdited: false
        });

        // 维护压缩包→文件的映射（用于批量操作）
        if (!this.archiveMap.has(archivePath)) {
            this.archiveMap.set(archivePath, []);
        }
        this.archiveMap.get(archivePath).push(fullPath);

        return fullPath;
    }

    /** 调整MMF大小 */
    async resizeMMF(fullPath, newSize) {
        const handle = this.mmfHandles.get(fullPath);
        if (!handle) throw new Error(`文件不存在: ${fullPath}`);

        // 取消映射
        mmap.unmap(handle.buffer);

        // 调整文件大小
        await fs.truncate(handle.tempPath, newSize);

        // 重新映射
        const newBuffer = mmap.map(
            handle.fd,
            newSize,
            mmap.PROT_READ | mmap.PROT_WRITE,
            mmap.MAP_SHARED,
            0
        );

        this.mmfHandles.set(fullPath, {
            ...handle,
            buffer: newBuffer,
            size: newSize
        });
    }

    // -------------------------- 公开接口 --------------------------
    /**
     * 解压压缩包到内存（缓存键=文件完整路径）
     * @param {string} archivePath 压缩包完整路径
     * @returns {Object} { success, fullPaths, count }
     */
    async extract(archivePath) {
        try {
            const { files } = await this.sevenZip.list(archivePath, {
                $bin: sevenBin.path7za,
                args: [`-mmt=${this.threadCount}`]
            });

            // 并行解压所有文件
            const fullPaths = await Promise.all(
                files
                    .filter(file => file.type === 'file')
                    .map(file => this.extractFileToMMF(archivePath, file.name))
            );

            return {
                success: true,
                fullPaths, // 返回解压后的所有文件完整路径（缓存键）
                count: fullPaths.length
            };
        } catch (err) {
            console.error('Extract error:', err);
            return { success: false, error: err.message };
        }
    }

    /**
   * 创建空的内存映射（用于SCP直接写入）
   * @param {string} cacheKey 缓存键（唯一标识映射）
   * @param {number} fileSize 预分配大小（需≥0，建议对齐内存页）
   * @returns {Promise<{ fd: number, buffer: ArrayBuffer, tempPath: string }>}
   */
    async createEmptyMMF(cacheKey, fileSize) {
        if (this.mmfHandles.has(cacheKey)) {
            throw new Error(`缓存键 ${cacheKey} 已存在，请勿重复创建`);
        }
        if (fileSize < 0) {
            throw new Error(`预分配大小 ${fileSize} 无效，必须≥0`);
        }
        // 内存页对齐（默认4096字节，跨平台兼容）
        const pageSize = 4096;
        const alignedSize = Math.ceil(fileSize / pageSize) * pageSize;

        let fd = null;
        let buffer = null;
        const tempName = Buffer.from(cacheKey).toString('hex');
        const tempPath = path.join(this.tempDir, tempName);

        try {
            // 创建并打开临时文件（w+：创建+读写，不存在则新建，存在则清空）
            fd = fsSyncSync.openSync(tempPath, 'w+', 0o600); // 显式设置权限（跨平台）

            // 预分配文件大小（截断到对齐后的大小）
            // 空文件（fileSize=0）也需截断，避免映射区大小异常
            fsSyncSync.ftruncateSync(fd, alignedSize);

            // 创建内存映射
            // PROT_READ|PROT_WRITE：可读写；MAP_SHARED：修改同步到文件
            // Windows下MAP_SHARED需文件可写，Linux/macOS无特殊限制
            buffer = mmap.map(
                fd,
                alignedSize,
                mmap.PROT_READ | mmap.PROT_WRITE,
                mmap.MAP_SHARED,
                0 // 映射起始偏移（必须对齐内存页）
            );

            // 缓存句柄（包含清理所需的所有信息）
            this.mmfHandles.set(cacheKey, {
                fd,
                fileHandle: fsSyncSync.openAsFileHandle(fd), // 标准Node.js文件句柄
                buffer,
                size: alignedSize,
                tempPath,
                isEmpty: true,
                createdTime: Date.now()
            });

            // 返回结果（fd需保留，后续关闭映射时需用到）
            return {
                fd,
                buffer,
                tempPath
            };
        } catch (err) {
            // 异常时清理资源：关闭fd + 删除临时文件
            if (fd !== null) {
                try {
                    fsSyncSync.closeSync(fd);
                } catch (closeErr) {
                    console.error(`关闭fd失败：${closeErr.message}`);
                }
            }
            if (fsSyncSync.existsSync(tempPath)) {
                try {
                    fsSyncSync.unlinkSync(tempPath);
                } catch (unlinkErr) {
                    console.error(`删除临时文件失败：${unlinkErr.message}`);
                }
            }
            throw new Error(`创建空MMF失败：${err.message}`);
        }
    }

    /**
     * 释放内存映射（必须调用，否则内存泄漏）
     * @param {string} cacheKey 缓存键
     * @returns {Promise<void>}
     */
    async releaseMMF(cacheKey) {
        const handle = this.mmfHandles.get(cacheKey);
        if (!handle) return;

        try {
            // 1. 解除内存映射（核心：避免内存泄漏）
            if (handle.buffer) {
                mmap.unmap(handle.buffer);
            }
            // 2. 关闭文件句柄（同步关闭，确保fd释放）
            if (handle.fileHandle) {
                await handle.fileHandle.close();
            } else if (handle.fd !== null) {
                fsSyncSync.closeSync(handle.fd);
            }
            // 3. 删除临时文件（可选：根据业务是否保留文件）
            if (fsSyncSync.existsSync(handle.tempPath)) {
                fsSyncSync.unlinkSync(handle.tempPath);
            }
        } catch (err) {
            console.error(`释放MMF失败 ${cacheKey}：${err.message}`);
        } finally {
            // 4. 移除缓存（无论是否失败，都移除无效句柄）
            this.mmfHandles.delete(cacheKey);
        }
    }

    /**
     * 强制刷盘（确保映射区数据写入磁盘）
     * @param {string} cacheKey 缓存键
     * @returns {boolean} 刷盘是否成功
     */
    flushMMF(cacheKey) {
        const handle = this.mmfHandles.get(cacheKey);
        if (!handle || !handle.buffer) return false;

        try {
            // mmap-io的flush方法：强制将脏页刷到磁盘
            return mmap.flush(handle.buffer);
        } catch (err) {
            console.error(`刷盘MMF失败 ${cacheKey}：${err.message}`);
            return false;
        }
    }

    /**
     * 读取内存文件
     * @param {string} fullPath 文件完整路径（缓存键）
     * @param {number} offset 偏移量
     * @param {number} length 读取长度
     * @returns {Buffer|null}
     */
    async read(fullPath, offset = 0, length) {
        const handle = this.mmfHandles.get(fullPath);
        if (!handle) return null;

        const actualLength = length || (handle.size - offset);
        if (offset + actualLength > handle.size) {
            throw new Error(`读取越界: ${offset}+${actualLength} > ${handle.size}`);
        }

        // 从 ArrayBuffer 创建 Buffer
        return Buffer.from(handle.buffer.slice(offset, offset + actualLength));
    }

    /**
     * 写入内存文件
     * @param {string} fullPath 文件完整路径（缓存键）
     * @param {number} offset 偏移量
     * @param {string|Buffer} data 写入数据
     * @returns {boolean}
     */
    async write(fullPath, offset = 0, data) {
        const handle = this.mmfHandles.get(fullPath);
        const meta = this.fileMeta.get(fullPath);
        if (!handle || !meta) return false;

        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        const needResize = offset + buffer.length > handle.size;

        if (needResize) {
            await this.resizeMMF(fullPath, offset + buffer.length);
        }

        // 写入到 ArrayBuffer
        const targetBuffer = new Uint8Array(handle.buffer);
        const sourceBuffer = new Uint8Array(buffer.buffer || buffer);
        targetBuffer.set(sourceBuffer, offset);

        // 同步到磁盘
        mmap.sync(handle.buffer, false);  // 异步同步

        meta.isEdited = true;
        this.fileMeta.set(fullPath, meta);

        return true;
    }

    /**
     * 保存文件（支持GZ自动压缩）
     * @param {string} fullPath 文件完整路径（缓存键）
     * @param {string} outputPath 输出路径（.gz结尾自动压缩）
     * @returns {Object} { success, outputPath }
     */
    async save(fullPath, outputPath) {
        try {
            const content = await this.read(fullPath);
            if (!content) return { success: false, error: '文件不存在' };

            if (outputPath.endsWith('.gz')) {
                await this.sevenZip.add(outputPath, '-', {
                    $bin: sevenBin.path7za,
                    args: [`-tgz`, `-mx=9`, `-mmt=${this.threadCount}`, `-si`]
                }).end(content);
            } else {
                await fs.writeFile(outputPath, content);
            }

            this.fileMeta.set(fullPath, { ...this.fileMeta.get(fullPath), isEdited: false });
            return { success: true, outputPath };
        } catch (err) {
            console.error('Save error:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * GZ压缩内存文件
     * @param {string} fullPath 文件完整路径（缓存键）
     * @param {string} outputPath 输出GZ路径
     * @returns {Object} { success, outputPath }
     */
    async compressGZ(fullPath, outputPath) {
        return this.save(fullPath, outputPath.endsWith('.gz') ? outputPath : `${outputPath}.gz`);
    }

    /**
     * 解压GZ文件到内存
     * @param {string} gzPath GZ文件完整路径
     * @returns {Object} { success, fullPath }
     */
    async decompressGZ(gzPath) {
        try {
            const { files } = await this.sevenZip.list(gzPath, { $bin: sevenBin.path7za });
            const file = files.find(f => f.type === 'file');
            if (!file) return { success: false, error: 'GZ内无有效文件' };

            const fullPath = await this.extractFileToMMF(gzPath, file.name);
            return { success: true, fullPath };
        } catch (err) {
            console.error('Decompress GZ error:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * 批量清理指定压缩包的所有文件
     * @param {string} archivePath 压缩包完整路径
     * @returns {Object} { success, count }
     */
    async clearByArchive(archivePath) {
        const fullPaths = this.archiveMap.get(archivePath) || [];
        let count = 0;

        for (const fullPath of fullPaths) {
            const success = await this._cleanupSingleFile(fullPath);
            if (success) count++;
        }

        this.archiveMap.delete(archivePath);
        return { success: true, count };
    }

    /**
     * 清理单个文件的内存缓存
     * @param {string} fullPath 文件完整路径（缓存键）
     * @returns {Object} { success }
     */
    async clearSingle(fullPath) {
        const success = await this._cleanupSingleFile(fullPath);
        return { success, error: success ? null : '文件不存在' };
    }

    /** 内部清理单个文件的辅助方法 */
    async _cleanupSingleFile(fullPath) {
        const handle = this.mmfHandles.get(fullPath);
        if (!handle) return false;

        try {
            // 清理MMF
            mmap.unmap(handle.buffer);
            fsSync.closeSync(handle.fd);
            await fs.unlink(handle.tempPath).catch(() => { });
        } catch (err) {
            console.error(`Cleanup error for ${fullPath}:`, err);
        }

        // 清理元信息
        const meta = this.fileMeta.get(fullPath);
        if (meta) {
            // 从压缩包映射中移除
            const fullPaths = this.archiveMap.get(meta.archivePath) || [];
            this.archiveMap.set(meta.archivePath, fullPaths.filter(p => p !== fullPath));
            this.fileMeta.delete(fullPath);
        }

        this.mmfHandles.delete(fullPath);
        return true;
    }

    /**
     * 全局清理
     * @returns {Object} { success }
     */
    async cleanup() {
        for (const handle of this.mmfHandles.values()) {
            try {
                mmap.unmap(handle.buffer);
                fsSync.closeSync(handle.fd);
                await fs.unlink(handle.tempPath).catch(() => { });
            } catch (err) {
                console.error('Global cleanup error:', err);
            }
        }

        this.mmfHandles.clear();
        this.fileMeta.clear();
        this.archiveMap.clear();

        try {
            await fs.rm(this.tempDir, { recursive: true, force: true });
        } catch (err) {
            console.error('Temp dir removal error:', err);
        }

        return { success: true };
    }

    // -------------------------- 新增辅助方法 --------------------------

    /**
     * 获取文件映射统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        return {
            totalMappedFiles: this.mmfHandles.size,
            totalArchives: this.archiveMap.size,
            tempDir: this.tempDir,
            platform: process.platform,
            architecture: process.arch
        };
    }

    /**
     * 手动同步映射文件到磁盘
     * @param {string} fullPath 文件完整路径
     * @param {boolean} async 是否异步同步
     * @returns {boolean}
     */
    syncToDisk(fullPath, async = true) {
        const handle = this.mmfHandles.get(fullPath);
        if (!handle) return false;

        try {
            mmap.sync(handle.buffer, !async);  // mmap-io: false=异步, true=同步
            return true;
        } catch (err) {
            console.error('Sync to disk error:', err);
            return false;
        }
    }

    /**
     * 获取文件映射的ArrayBuffer
     * @param {string} fullPath 文件完整路径
     * @returns {ArrayBuffer|null}
     */
    getArrayBuffer(fullPath) {
        const handle = this.mmfHandles.get(fullPath);
        return handle ? handle.buffer : null;
    }

    /**
     * 检查文件是否被修改
     * @param {string} fullPath 文件完整路径
     * @returns {boolean}
     */
    isFileModified(fullPath) {
        const meta = this.fileMeta.get(fullPath);
        return meta ? meta.isEdited : false;
    }
}

const mmFileManager = MMFileManager.getInstance();
export default mmFileManager;