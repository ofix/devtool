import { app } from 'electron'
import fs from 'fs-extra'
import crypto from 'crypto'
import path from 'path'
import Singleton from "./Singleton.js";
import ClientManager from "../service/ClientManager.js";

class CodeProjectService extends Singleton {
    constructor() {
        super();
        // 持久化根目录
        this.storageRoot = path.join(app.getPath('userData'), '.devtool');
        fs.ensureDirSync(this.storageRoot)
    }

    /**
     * VSCode 标准工作区路径Hash
     * @param {string} projectRootPath 工程绝对根目录
     * @returns {string} 16位md5 hash
     */
    getWorkspaceHash(projectRootPath) {
        const hash = crypto.createHash('md5')
        const normPath = path.resolve(projectRootPath).replace(/[\\/]/g, '/')
        hash.update(normPath)
        return hash.digest('hex').slice(0, 16)
    }

    // 私有：工程存储根目录
    #getProjDir(hash) {
        const dir = path.join(this.storageRoot, hash)
        fs.ensureDirSync(dir)
        fs.ensureDirSync(path.join(dir, 'dirtyFiles'))
        return dir
    }

    // 私有：元数据 workspace.json 路径
    #getMetaPath(hash) {
        return path.join(this.#getProjDir(hash), 'workspace.json')
    }

    // 私有：单个脏文件临时缓存路径
    #getDirtyFileCachePath(workspaceHash, filePath) {
        const fileMd5 = crypto.createHash('md5').update(filePath).digest('hex')
        return path.join(this.#getProjDir(workspaceHash), 'dirtyFiles', `${fileMd5}`)
    }

    /**
     * 保存工程完整状态
     * @param {string} rootPath 工程根目录
     * @param {string[]} openFiles 当前全部已打开文件路径列表
     * @param {string} activeFile 选中的文件
     * @param {Map<String,String>} dirtyFiles 脏文件列表
     * @param {string[]} expandedKeys 文件树展开的目录Key
     */
    async saveProject({ rootPath, openFiles, dirtyFiles, activeFile, expandedKeys }) {
        const workspaceHash = this.getWorkspaceHash(rootPath)
        const metaPath = this.#getMetaPath(workspaceHash)

        const meta = {
            workspaceHash,
            openFiles,
            activeFile,
            expandedKeys,
            saveTimestamp: Date.now(),
        }
        await fs.writeJSON(metaPath, meta, { spaces: 2 })

        // 清理旧脏文件缓存目录（避免残留已保存文件的tmp）
        const dirtyDir = path.join(this.#getProjDir(workspaceHash), 'dirtyFiles')
        await fs.emptyDir(dirtyDir)

        // 仅写入「打开且未保存」的文件内容
        const writeTasks = []
        for (const [filePath, content] of dirtyFiles.entries()) {
            const tmpPath = this.#getDirtyFileCachePath(workspaceHash, filePath)
            writeTasks.push(fs.writeFile(tmpPath, content, 'utf8'))
        }
        await Promise.all(writeTasks)
    }

    /**
     * 读取上次保存的工程状态
     * @param {string} rootPath
     * @returns {Promise<{ openFiles: string[], dirtyFiles: Map<string, string>,activeFile: string,expandedKeys: string[], expandedDirs: <string,string>[] }>}
     */
    async restoreProject(rootPath) {
        const workspaceHash = this.getWorkspaceHash(rootPath)
        const metaPath = this.#getMetaPath(workspaceHash)

        // 无历史记录返回空
        if (!(await fs.pathExists(metaPath))) {
            return {
                openFiles: [], // 已经打开的文件
                activeFile: "", // 当前高亮选中文件路径
                dirtyFiles: new Map(),
                expandedKeys: [],
                expandedDirs: [],
            }
        }

        const meta = await fs.readJSON(metaPath)
        const dirtyFiles = new Map()

        // 遍历所有打开文件，只读取存在脏缓存的文件内容
        for (const filePath of meta.openFiles) {
            const tmpPath = this.#getDirtyFileCachePath(workspaceHash, filePath)
            if (await fs.pathExists(tmpPath)) {
                const content = await fs.readFile(tmpPath, 'utf8')
                dirtyFiles.set(filePath, content);
            }
        }

        // 遍历所有已展开的目录
        let cm = ClientManager.getInstance();
        let client = cm.getClient('local');
        let dirs = await client.readdirs(meta.expandedKeys);
        return {
            openFiles: meta.openFiles,
            activeFile: meta.activeFile,
            dirtyFiles,
            expandedKeys: meta.expandedKeys,
            expandedDirs: dirs,
        };
    }

    // 删除单个工程全部持久化缓存
    async clearProjectCache(projectRootPath) {
        const hash = this.getWorkspaceHash(projectRootPath)
        const projDir = this.#getProjDir(hash)
        await fs.remove(projDir);
    }
}

export default CodeProjectService