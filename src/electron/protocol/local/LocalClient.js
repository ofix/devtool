
import fs from 'node:fs/promises';
import path from 'node:path';
import BaseFsClient from "../base/BaseFsClient.js";
import { FileNodeType } from '../../core/FileNodeType.js';

class LocalClient extends BaseFsClient {
    constructor(options = {}) {
        super(options);
        this.protocol = 'local';
        this.defaultRootPath = options.rootPath || process.cwd();
        this.options = {
            rootPath: options.rootPath || process.cwd(),
            ignorePatterns: options.ignorePatterns || [],
            includeHidden: options.includeHidden || false,
            ...options
        };
    }

    /**
     * 读取目录内容
     */
    async readdir(dirPath, options = {}) {
        const { depth = 0, parentPath = '' } = options;

        // 深度限制检查
        if (depth > this.options.maxDepth) {
            return [];
        }

        try {
            const resolvedPath = path.resolve(dirPath);
            // 检查路径是否存在（使用 access 提前检查）
            try {
                await fs.access(resolvedPath, fs.constants.R_OK);
            } catch (error) {
                console.warn(`无法访问路径: ${resolvedPath}`, error.message);
                return [];
            }

            // 读取目录条目
            const entries = await fs.readdir(resolvedPath, {
                withFileTypes: true
            });

            // 过滤条目（同步过滤，避免处理不需要的文件）
            const filteredEntries = entries.filter(entry => {
                // 过滤隐藏文件
                if (!this.options.includeHidden && entry.name.startsWith('.')) {
                    return false;
                }

                // 过滤忽略模式
                if (this._shouldIgnore(entry.name)) {
                    return false;
                }
                return true;
            });

            // 并发获取文件状态（性能优化）
            const results = await Promise.all(
                filteredEntries.map(async (entry) => {
                    const fullPath = path.join(resolvedPath, entry.name);
                    try {
                        // 处理符号链接
                        let stats;
                        if (this.options.followSymlinks && entry.isSymbolicLink()) {
                            try {
                                stats = await fs.stat(fullPath); // 跟随链接
                            } catch (error) {
                                // 链接目标不存在或无法访问
                                stats = await fs.lstat(fullPath);
                            }
                        } else {
                            stats = await fs.stat(fullPath);
                        }

                        // 判断是否为目录（考虑符号链接）
                        const isDir = entry.isDirectory() ||
                            (entry.isSymbolicLink() && stats.isDirectory());

                        // 构建文件信息对象
                        const fileInfo = {
                            name: entry.name,
                            path: fullPath,
                            type: this._getFileType(entry, stats),
                            size: stats.size,
                            mtime: stats.mtime,
                        };
                        return fileInfo;
                    } catch (error) {
                        // 处理单个文件错误，不影响其他文件
                        console.warn(`无法读取文件: ${fullPath}`, error.message);
                        return null;
                    }
                })
            );
            return results;
        } catch (error) {
            console.error(`读取目录失败: ${dirPath}`, error);
            throw new Error(`无法读取目录: ${error.message}`);
        }
    }

    /**
     * 递归读取所有子目录（带限制）
     */
    async readdirRecursive(dirPath, maxDepth = 3) {
        const results = [];

        const traverse = async (currentPath, depth = 0) => {
            if (depth > maxDepth) return;

            const items = await this.readdir(currentPath, {
                depth
            });

            for (const item of items) {
                results.push(item);

                if (item.isDir && depth < maxDepth) {
                    await traverse(item.path, depth + 1);
                }
            }
        };
        await traverse(dirPath);
        return results;
    }

    /**
     * 判断是否应该忽略文件
     */
    _shouldIgnore(filename) {
        // 检查是否匹配忽略模式
        for (const regex of this.options.ignorePatterns) {
            if (regex.test(filename)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 获取文件类型
     */
    _getFileType(entry, stats) {
        if (entry.isDirectory()) return FileNodeType.DIRECTORY;
        if (entry.isFile()) return FileNodeType.FILE;
        return FileNodeType.OTHER;
    }

    async readFile(filePath, encoding = 'utf-8') {
        return await fs.readFile(filePath, encoding);
    }

    async writeFile(filePath, content) {
        const dirPath = path.dirname(filePath);
        await fs.mkdir(dirPath, { recursive: true });
        await fs.writeFile(filePath, content);
    }

    async mkdir(dirPath, recursive = true) {
        await fs.mkdir(dirPath, { recursive });
    }

    async delete(targetPath, options = {}) {
        const stats = await fs.stat(targetPath);
        if (stats.isDirectory()) {
            await fs.rm(targetPath, { recursive: options.recursive !== false, force: true });
        } else {
            await fs.unlink(targetPath);
        }
    }

    async rename(oldPath, newPath) {
        await fs.rename(oldPath, newPath);
    }

    async exists(targetPath) {
        try { await fs.access(targetPath); return true; } catch { return false; }
    }

    async stat(targetPath) {
        const stats = await fs.stat(targetPath);
        return {
            name: path.basename(targetPath),
            path: targetPath,
            type: stats.isDirectory() ? 'dir' : stats.isFile() ? 'file' : 'other',
            size: stats.size,
            mtime: stats.mtime,
        };
    }
}

export default LocalClient;