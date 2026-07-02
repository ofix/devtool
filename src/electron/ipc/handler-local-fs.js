import { ipcMain, dialog, app } from 'electron'
import ClientManager from "../service/ClientManager.js"

export const DRIVER_TYPE = Object.freeze({
    LOCAL: 'local',
    SFTP: 'sftp',
});


class LocalFileSystemHandler {
    constructor() {
        // 存储每个窗口的驱动实例
        this.manager = ClientManager.getInstance();
        this.registerHandlers()
    }

    registerHandlers() {
        ipcMain.handle('fs:selectLocalDir', async (event, options) => {
            try {
                const result = await dialog.showOpenDialog({
                    properties: ['openDirectory', 'createDirectory'],
                    title: options.title || '请选择文件夹',
                    buttonLabel: options.buttonLabel || '选择',
                    message: options.message || '请选择要打开的文件夹',
                    modal: true,
                })

                if (result.canceled) {
                    return { canceled: true, data: "" }
                }

                const dirPath = result.filePaths[0];
                // 读取文件夹内容
                let client = this.manager.getClient('local', { path: dirPath });
                let dirInfo = await client.stat(dirPath);
                return {
                    canceled: false,
                    data: dirInfo
                }
            } catch (error) {
                console.error('选择文件夹失败:', error)
                throw error
            }
        });
        ipcMain.handle('fs:readdir', async (event, options) => {
            try {
                let client = this.manager.getClient('local', options);
                let result = await client.readdir(options.path);
                return {
                    success: true,
                    data: result,
                }
            } catch (error) {
                console.error('加载目录失败:', error)
                return { success: false, error: error.message }
            }
        })

        // 读取文件
        ipcMain.handle('fs:readFile', async (event, options) => {
            try {
                const client = await this.manager.getClient('local', options);
                const content = await client.readFile(options.path)
                return { success: true, data: content }
            } catch (error) {
                return { success: false, error: error.message }
            }
        })

        // 写入文件
        ipcMain.handle('fs:writeFile', async (event, options) => {
            try {
                const client = await this.manager.getClient('local', options);
                await client.writeFile(filePath, content);
                return { success: true }
            } catch (error) {
                return { success: false, error: error.message }
            }
        })

        // 创建目录
        ipcMain.handle('fs:mkdir', async (event, options) => {
            try {
                const client = await this.manager.getClient('local', options);
                await client.mkdir(options.dirPath, options.recursive);
                return { success: true }
            } catch (error) {
                return { success: false, error: error.message }
            }
        })

        // 删除
        ipcMain.handle('fs:delete', async (event, options) => {
            try {
                const client = await this.manager.getClient('local', options);
                await client.delete(options.targetPath, { recursive: options.recursive });
                return { success: true }
            } catch (error) {
                return { success: false, error: error.message }
            }
        })

        // 重命名
        ipcMain.handle('fs:rename', async (event, options) => {
            try {
                const { oldPath, newPath } = options
                const client = await this.manager.getClient('local', options);
                await client.rename(oldPath, newPath)
                return { success: true }
            } catch (error) {
                return { success: false, error: error.message }
            }
        })

        // 检查存在
        ipcMain.handle('fs:exists', async (event, options) => {
            try {
                const { targetPath } = options
                const client = await this.manager.getClient('local', options);
                const exists = await client.exists(targetPath)
                return { success: true, exists }
            } catch (error) {
                return { success: false, error: error.message }
            }
        })

        // 获取状态
        ipcMain.handle('fs:stat', async (event, options) => {
            try {
                const { targetPath } = options
                const client = await this.manager.getClient('local', options);
                const stats = await client.stat(targetPath)
                return { success: true, data: stats }
            } catch (error) {
                return { success: false, error: error.message }
            }
        })

        // 清理会话
        ipcMain.handle('fs:cleanup', async (event, options) => {
            try {
                const client = await this.manager.getClient('local', options);
                await client.cleanup(options)
                return { success: true }
            } catch (error) {
                return { success: false, error: error.message }
            }
        })
    }

    /**
     * 递归加载目录
     * @private
     */
    async _loadDirectoryRecursive(driver, dirPath, depth, recursive, options, currentDepth = 1) {
        const stats = {
            dirs: 0,
            files: 0,
            maxDepth: currentDepth
        }

        // 读取当前目录
        const entries = await driver.readDirectory(dirPath, options)
        const result = {
            name: this._getBaseName(dirPath),
            path: dirPath,
            type: 'directory',
            children: [],
            _stats: stats
        }

        for (const entry of entries) {
            const entryData = {
                name: entry.name,
                path: entry.path,
                type: entry.isDirectory ? 'dir' : 'file',
                size: entry.size,
                mode: entry.mode,
                mtime: entry.mtime,
                isDirectory: entry.isDirectory,
                isFile: entry.isFile
            }

            if (entry.isDirectory) {
                stats.dirs++

                if (recursive && currentDepth < depth) {
                    const subResult = await this._loadDirectoryRecursive(
                        driver,
                        entry.path,
                        depth,
                        recursive,
                        options,
                        currentDepth + 1
                    )
                    entryData.children = subResult.children
                    entryData._stats = subResult._stats

                    stats.dirs += subResult._stats.dirs || 0
                    stats.files += subResult._stats.files || 0
                    stats.maxDepth = Math.max(stats.maxDepth, subResult._stats.maxDepth || 0)
                } else if (recursive && currentDepth >= depth) {
                    entryData._hasChildren = true
                    entryData._isPartialLoaded = true
                    entryData.children = []
                } else {
                    entryData._hasChildren = true
                    entryData._isPartialLoaded = true
                    entryData.children = []
                }
            } else {
                stats.files++
            }

            result.children.push(entryData)
        }

        result._stats = stats
        return result
    }
}

export default new LocalFileSystemHandler();