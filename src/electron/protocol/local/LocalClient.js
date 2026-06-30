
import fs from 'node:fs/promises';
import path from 'node:path';
import BaseFsClient from "../base/BaseFsClient.js";

class LocalClient extends BaseFsClient{
    constructor(options = {}) {
        this.protocol = 'local';
        this.defaultRootPath = options.rootPath || process.cwd();
        this.options = {
            rootPath: options.rootPath || process.cwd(),
            ignorePatterns: options.ignorePatterns || ['node_modules', '.git', 'dist'],
            includeHidden: options.includeHidden || false,
            ...options
        };
    }

    async readdir(dirPath, options = {}) {
        const resolvedPath = path.resolve(dirPath);
        const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
        const results = [];

        for (const entry of entries) {
            if (!this.options.includeHidden && entry.name.startsWith('.')) continue;
            if (this.options.ignorePatterns.includes(entry.name)) continue;

            const fullPath = path.join(resolvedPath, entry.name);
            const stats = await fs.stat(fullPath);

            results.push({
                name: entry.name,
                path: fullPath,
                type: entry.isDirectory() ? 'dir' : 'file',
                size: stats.size,
                mode: stats.mode.toString(8),
                mtime: stats.mtime,
                isDir: entry.isDirectory(),
                isFile: entry.isFile(),
                isSymlink: entry.isSymbolicLink()
            });
        }

        return results;
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
            size: stats.size,
            isDir: stats.isDirectory(),
            isFile: stats.isFile(),
            mtime: stats.mtime,
            mode: stats.mode,
            uid: stats.uid,
            gid: stats.gid
        };
    }
}

export default LocalClient;