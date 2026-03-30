import { ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

class MMFHandler {
    constructor() {
        this.cache = new Map(); // 内存缓存
        this.registerHandlers();
    }

    registerHandlers() {
        ipcMain.handle('mmf:extract', async (event, archivePath) => {
            try {
                // 解压文件到内存
                const buffer = await fs.readFile(archivePath);
                const decompressed = await gunzip(buffer);
                const cacheKey = `mmf_${Date.now()}_${Math.random()}`;
                this.cache.set(cacheKey, decompressed);
                return { success: true, cacheKey, size: decompressed.length };
            } catch (error) {
                console.error('解压文件失败:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('mmf:loadFileContents', async (event, fileMeta) => {
            try {
                const { cacheKey, offset, length } = fileMeta;
                const buffer = this.cache.get(cacheKey);
                if (!buffer) {
                    throw new Error('缓存不存在或已过期');
                }
                const content = buffer.slice(offset, offset + length);
                return { success: true, content: content.toString('utf-8') };
            } catch (error) {
                console.error('加载文件内容失败:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('mmf:write', async (event, cacheKey, offset, data) => {
            try {
                let buffer = this.cache.get(cacheKey);
                if (!buffer) {
                    buffer = Buffer.alloc(offset + data.length);
                    this.cache.set(cacheKey, buffer);
                }
                const dataBuffer = Buffer.from(data);
                dataBuffer.copy(buffer, offset);
                return { success: true };
            } catch (error) {
                console.error('写入内存失败:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('mmf:save', async (event, cacheKey, outputPath) => {
            try {
                const buffer = this.cache.get(cacheKey);
                if (!buffer) {
                    throw new Error('缓存不存在或已过期');
                }
                await fs.writeFile(outputPath, buffer);
                return { success: true, path: outputPath };
            } catch (error) {
                console.error('保存文件失败:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('mmf:compress-gz', async (event, cacheKey, outputPath) => {
            try {
                const buffer = this.cache.get(cacheKey);
                if (!buffer) {
                    throw new Error('缓存不存在或已过期');
                }
                const compressed = await gzip(buffer);
                await fs.writeFile(outputPath, compressed);
                return { success: true, path: outputPath };
            } catch (error) {
                console.error('压缩文件失败:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('mmf:decompress-gz', async (event, gzPath) => {
            try {
                const compressed = await fs.readFile(gzPath);
                const decompressed = await gunzip(compressed);
                const cacheKey = `mmf_${Date.now()}_${Math.random()}`;
                this.cache.set(cacheKey, decompressed);
                return { success: true, cacheKey, size: decompressed.length };
            } catch (error) {
                console.error('解压文件失败:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('mmf:clear', async () => {
            this.cache.clear();
            return { success: true };
        });
    }
}

export default new MMFHandler();