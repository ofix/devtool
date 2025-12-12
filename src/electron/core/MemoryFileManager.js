import { ipcMain } from 'electron';
import sevenBin from '7zip-bin';
import { SevenZip } from 'node-7z';
import mmap from 'mmap.js';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';

class MemoryFileManager {
    static _ = null;

    constructor(options = {}) {
        // 基础配置
        this.threadCount = options.threadCount || os.cpus().length;
        this.tempDir = options.tempDir || path.join(os.tmpdir(), 'electron-mmf');

        // 7-Zip初始化
        this.sevenZip = new SevenZip(sevenBin.path7za);

        // 核心缓存（缓存键=文件完整路径）
        this.mmfHandles = new Map(); // 完整路径 → MMF句柄
        this.fileMeta = new Map();   // 完整路径 → { archivePath, isEdited }
        this.archiveMap = new Map(); // 压缩包路径 → [文件完整路径列表]（批量管理核心）

        // 初始化
        this._initTempDir();
        this._registerIPC();
    }

    /** 单例获取 */
    static getInstance(options = {}) {
        if (!MemoryFileManager._instance) {
            MemoryFileManager._instance = new MemoryFileManager(options);
        }
        return MemoryFileManager._instance;
    }

    _initTempDir() {
        if (!fsSync.existsSync(this.tempDir)) {
            fsSync.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /** 注册极简IPC */
    _registerIPC() {
        ipcMain.handle('mmf:extract', (_, archivePath) => this.extract(archivePath));
        ipcMain.handle('mmf:read', (_, fullPath, offset = 0, length) => this.read(fullPath, offset, length));
        ipcMain.handle('mmf:write', (_, fullPath, offset = 0, data) => this.write(fullPath, offset, data));
        ipcMain.handle('mmf:save', (_, fullPath, outputPath) => this.save(fullPath, outputPath));
        ipcMain.handle('mmf:compress-gz', (_, fullPath, outputPath) => this.compressGZ(fullPath, outputPath));
        ipcMain.handle('mmf:decompress-gz', (_, gzPath) => this.decompressGZ(gzPath));
        ipcMain.handle('mmf:clear-by-archive', (_, archivePath) => this.clearByArchive(archivePath));
        ipcMain.handle('mmf:clear-single', (_, fullPath) => this.clearSingle(fullPath));
    }

    /** 解压单个文件到MMF（缓存键=完整路径） */
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

        // 内存映射（零拷贝）
        const stats = await fs.stat(tempPath);
        const fileHandle = await fs.open(tempPath, 'r+');
        const map = mmap.map(
            fileHandle.fd,
            stats.size,
            mmap.PROT_READ | mmap.PROT_WRITE,
            mmap.MAP_SHARED
        );

        // 缓存状态
        this.mmfHandles.set(fullPath, {
            fd: fileHandle.fd,
            fileHandle,
            map,
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

        handle.map.unmap();
        await fs.truncate(handle.tempPath, newSize);
        const newMap = mmap.map(
            handle.fd,
            newSize,
            mmap.PROT_READ | mmap.PROT_WRITE,
            mmap.MAP_SHARED
        );

        this.mmfHandles.set(fullPath, { ...handle, map: newMap, size: newSize });
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
            return { success: false, error: err.message };
        }
    }

    /**
     * 创建空的内存映射（用于SCP直接写入）
     * @param {string} cacheKey 缓存键
     * @param {number} fileSize 预分配大小（可传SCP获取的文件大小）
     * @returns {Promise<{ fd: number, map: mmap.Map, tempPath: string }>}
     */
    async createEmptyMMF(cacheKey, fileSize) {
        const tempName = Buffer.from(cacheKey).toString('hex');
        const tempPath = path.join(this.tempDir, tempName);

        // 创建空文件并预分配大小
        const fileHandle = await fs.open(tempPath, 'w+');
        await fs.truncate(tempPath, fileSize);

        // 创建内存映射
        const map = mmap.map(
            fileHandle.fd,
            fileSize,
            mmap.PROT_READ | mmap.PROT_WRITE,
            mmap.MAP_SHARED
        );

        // 缓存空MMF句柄（未写入数据）
        this.mmfHandles.set(cacheKey, {
            fd: fileHandle.fd,
            fileHandle,
            map,
            size: fileSize,
            tempPath,
            isEmpty: true
        });

        // 返回句柄（仅传fd和map，无业务逻辑耦合）
        return {
            fd: fileHandle.fd,
            map,
            tempPath
        };
    }

    /**
     * 读取内存文件（零拷贝）
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

        const buffer = Buffer.alloc(actualLength);
        handle.map.copy(buffer, 0, offset, offset + actualLength);
        return buffer;
    }

    /**
     * 写入内存文件（零拷贝）
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

        handle.map.write(buffer, offset);
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
            return { success: false, error: err.message };
        }
    }

    /**
     * 批量清理指定压缩包的所有文件（替代原clear(archiveId)）
     * @param {string} archivePath 压缩包完整路径
     * @returns {Object} { success, count }
     */
    async clearByArchive(archivePath) {
        const fullPaths = this.archiveMap.get(archivePath) || [];
        let count = 0;

        for (const fullPath of fullPaths) {
            const handle = this.mmfHandles.get(fullPath);
            if (handle) {
                handle.map.unmap();
                await handle.fileHandle.close();
                await fs.unlink(handle.tempPath).catch(() => { });
                this.mmfHandles.delete(fullPath);
                count++;
            }
            this.fileMeta.delete(fullPath);
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
        const handle = this.mmfHandles.get(fullPath);
        if (!handle) return { success: false, error: '文件不存在' };

        // 清理MMF
        handle.map.unmap();
        await handle.fileHandle.close();
        await fs.unlink(handle.tempPath).catch(() => { });

        // 清理元信息
        const meta = this.fileMeta.get(fullPath);
        if (meta) {
            // 从压缩包映射中移除
            const fullPaths = this.archiveMap.get(meta.archivePath) || [];
            this.archiveMap.set(meta.archivePath, fullPaths.filter(p => p !== fullPath));
            this.fileMeta.delete(fullPath);
        }

        this.mmfHandles.delete(fullPath);
        return { success: true };
    }

    /**
     * 全局清理
     * @returns {Object} { success }
     */
    async cleanup() {
        for (const handle of this.mmfHandles.values()) {
            handle.map.unmap();
            await handle.fileHandle.close();
            await fs.unlink(handle.tempPath).catch(() => { });
        }

        this.mmfHandles.clear();
        this.fileMeta.clear();
        this.archiveMap.clear();
        await fs.rm(this.tempDir, { recursive: true, force: true }).catch(() => { });

        return { success: true };
    }
}

// 导出单例
const memoryFileManager = MemoryFileManager.getInstance();
export default memoryFileManager;