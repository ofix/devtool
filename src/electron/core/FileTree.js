import { FileNodeType, SortField, SortDirection } from "./FileNodeType.js";
import FileTreeNode from "./FileTreeNode.js";
import Print from "../core/Print.js";

class FileTree {
    /**
     * @param {Object} [options] - 配置选项
     * @param {string} [options.initialRootPath='/'] - 初始根目录路径
     * @param {string} [options.rootName='.'] - 初始根节点显示名称
     * @param {boolean} [options.showMode=false] - 是否显示权限
     * @param {boolean} [options.showSize=false] - 是否显示大小
     * @param {boolean} [options.showDate=false] - 是否显示日期
     * @param {Object} [options.sortConfig] - 排序配置
     * @param {boolean} [options.sortConfig.enabled=false] - 是否启用排序（默认关闭）
     * @param {SortField} [options.sortConfig.field=SortField.TYPE] - 排序字段
     * @param {SortDirection} [options.sortConfig.direction=SortDirection.ASC] - 排序方向
     * @param {boolean} [options.enablePathCache=false] - 是否启用路径查找缓存（平衡性能/内存）
     */
    constructor(options = {}) {
        // 基础配置
        this.config = {
            initialRootPath: options.initialRootPath || "/",
            rootName: options.rootName || "/",
            showMode: options.showMode || false,
            showSize: options.showSize || false,
            showDate: options.showDate || false,
        };

        // 排序配置
        this.sortConfig = {
            enabled: options.sortConfig?.enabled ?? false,
            field: options.sortConfig?.field ?? SortField.TYPE,
            direction: options.sortConfig?.direction ?? SortDirection.ASC,
        };

        // 可选：路径查找缓存（LRU 策略，默认禁用）
        this.enablePathCache = options.enablePathCache ?? false;
        this.pathCache = new Map(); // 缓存格式：key=fullPath, value=FileTreeNode
        this.cacheMaxSize = 100; // 缓存最大节点数，避免内存溢出

        // 全局根节点（固定为 /）
        this.globalRoot = this.createGlobalRootNode();
        // 当前操作的根节点（初始为全局根）
        this.currentRoot = this.globalRoot;

        // 初始化缓存（根节点）
        if (this.enablePathCache) {
            this.pathCache.set(this.globalRoot.fullPath, this.globalRoot);
        }
        this.syncedDirs = new Set();
    }


    // ========== 核心：快速判断目录是否同步过（O(1) 复杂度） ==========
    isDirSynced(dirPath) {
        const normalizedPath = dirPath.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
        // 优先查 Set（O(1)），再查节点（兜底）
        if (this.syncedDirs.has(normalizedPath)) return true;

        // 兜底：节点存在时校验状态（防止 Set 与节点状态不一致）
        const dirNode = this.findNodeByPath(normalizedPath);
        const nodeSynced = dirNode?.isDirectory() && dirNode.isSynced;
        // 同步 Set 与节点状态（容错）
        if (nodeSynced) {
            this.syncedDirs.add(normalizedPath);
        } else {
            this.syncedDirs.delete(normalizedPath);
        }
        return nodeSynced || false;
    }

    // ========== 批量设置同步状态（适配 SSH2 批量同步场景） ==========
    batchSetSyncStatus(dirPaths, isSynced, syncErrors = {}) {
        dirPaths.forEach(dirPath => {
            const error = syncErrors[dirPath] || null;
            this.setDirSyncStatus(dirPath, isSynced, error);
        });
    }

    // ========== 清空指定目录的同步状态 ==========
    clearDirSyncStatus(dirPath) {
        this.setDirSyncStatus(dirPath, false);
    }


    // ========== 核心：设置目录同步状态（批量/单个） ==========
    setDirSyncStatus(dirPath, isSynced, syncError = null) {
        const normalizedPath = dirPath.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
        const dirNode = this.findNodeByPath(normalizedPath);

        if (!dirNode || !dirNode.isDirectory()) {
            console.warn(`无法设置同步状态：${normalizedPath} 不是目录或不存在`);
            return false;
        }

        // 更新节点状态
        dirNode.setSyncStatus(isSynced, new Date().getTime(), syncError);
        // 更新同步清单 Set
        if (isSynced) {
            this.syncedDirs.add(normalizedPath);
        } else {
            this.syncedDirs.delete(normalizedPath);
        }
        return true;
    }

    createGlobalRootNode() {
        return new FileTreeNode({
            name: "/",
            type: FileNodeType.DIRECTORY,
            fullPath: "/",
            mode: "drwxr-xr-x",
            size: 0,
            mtime: new Date().toLocaleString(),
        });
    }

    /**
     * 核心方法：通过完整路径递归查找节点（替代dirMap）
     * @param {string} targetPath - 目标节点完整路径
     * @param {FileTreeNode} [startNode] - 起始查找节点（默认全局根）
     * @returns {FileTreeNode|null} 找到的节点（未找到返回null）
     */
    findNodeByPath(targetPath, startNode = this.globalRoot) {
        // 第一步：路径规范化
        const normalizedPath = targetPath.replace(/\/+/g, "/").replace(/\/$/, "") || "/";

        // 优先查缓存（若启用）
        if (this.enablePathCache && this.pathCache.has(normalizedPath)) {
            return this.pathCache.get(normalizedPath);
        }

        // 递归终止条件：找到目标节点
        if (startNode.fullPath === normalizedPath) {
            // 更新缓存
            if (this.enablePathCache) {
                this.updatePathCache(normalizedPath, startNode);
            }
            return startNode;
        }

        // 路径分割：目标路径是当前节点的子路径才继续查找
        const currentPathParts = startNode.fullPath.split("/").filter(part => part);
        const targetPathParts = normalizedPath.split("/").filter(part => part);

        // 目标路径不是当前节点的子路径，直接返回null
        if (targetPathParts.length <= currentPathParts.length) {
            return null;
        }

        // 检查目标路径的下一级节点名称
        const nextLevelName = targetPathParts[currentPathParts.length];
        const childNode = startNode.children.find(child => child.name === nextLevelName);

        // 子节点不存在，返回null
        if (!childNode) {
            return null;
        }

        // 递归查找下一级
        const foundNode = this.findNodeByPath(normalizedPath, childNode);

        // 更新缓存
        if (this.enablePathCache && foundNode) {
            this.updatePathCache(normalizedPath, foundNode);
        }

        return foundNode;
    }

    /**
     * 辅助方法：更新路径缓存（LRU 策略）
     * @param {string} path - 节点路径
     * @param {FileTreeNode} node - 节点实例
     */
    updatePathCache(path, node) {
        // 缓存满了，删除最久未使用的项
        if (this.pathCache.size >= this.cacheMaxSize) {
            const oldestKey = this.pathCache.keys().next().value;
            this.pathCache.delete(oldestKey);
        }
        this.pathCache.set(path, node);
    }

    /**
     * 递归创建缺失的目录路径（纯节点操作，无dirMap）
     * @param {string} targetPath - 目标目录完整路径
     * @returns {FileTreeNode|null} 目标目录节点（创建失败返回null）
     */
    createMissingDirectoryPath(targetPath) {
        const normalizedPath = targetPath.replace(/\/+/g, "/").replace(/\/$/, "") || "/";

        // 先检查是否已存在
        const existingNode = this.findNodeByPath(normalizedPath);
        if (existingNode) {
            return existingNode;
        }

        // 路径分割：如 /usr/local/bin → ['usr', 'local', 'bin']
        const pathParts = normalizedPath.split("/").filter(part => part);
        let currentNode = this.globalRoot;
        let currentPath = "/";

        for (const part of pathParts) {
            // 拼接当前层级的完整路径
            const nextPath = currentPath === "/" ? `/${part}` : `${currentPath}/${part}`;
            // 查找当前层级是否已存在
            const childNode = currentNode.children.find(child => child.name === part);

            if (childNode) {
                // 已存在，继续下一层
                currentNode = childNode;
                currentPath = nextPath;
                continue;
            }

            // 不存在，创建新目录节点
            const newDirNode = new FileTreeNode({
                name: part,
                fullPath: nextPath,
                type: FileNodeType.DIRECTORY,
                mode: "drwxr-xr-x",
                size: 0,
                mtime: new Date().toLocaleString()
            });

            // 挂载到父节点
            currentNode.addChild(newDirNode);
            // 更新缓存（若启用）
            if (this.enablePathCache) {
                this.updatePathCache(nextPath, newDirNode);
            }

            // 移动到新节点，继续下一层
            currentNode = newDirNode;
            currentPath = nextPath;
        }

        return currentNode;
    }

    /**
     * 为指定父节点挂载子节点（纯节点查找，无dirMap）
     * @param {string} parentNodePath - 父节点完整路径（如 /usr/local）
     * @param {Array<Object>} children - SSH2 ls 返回的子项列表
     * @param {boolean} [markSynced=true] - 是否标记为已同步
     * @returns {boolean} 挂载是否成功
     */
    addChildren(parentNodePath, children, markSynced = true) {
        const normalizedParentPath = parentNodePath.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
        let parentNode = this.findNodeByPath(normalizedParentPath);

        // 父节点不存在，自动创建
        if (!parentNode) {
            Print.warn(`父节点不存在：${normalizedParentPath}，自动创建路径`);
            parentNode = this.createMissingDirectoryPath(normalizedParentPath);
            if (!parentNode) {
                Print.error(`创建父节点失败：${normalizedParentPath}`);
                return false;
            }
        }

        // 父节点不是目录，返回失败
        if (!parentNode.isDirectory()) {
            Print.error(`父节点不是目录：${normalizedParentPath}`);
            return false;
        }

        // 遍历子项，创建并挂载
        children.forEach(child => {
            // 补全子项完整路径
            const childFullPath = child.fullPath || (normalizedParentPath === "/"
                ? `/${child.name}`
                : `${normalizedParentPath}/${child.name}`);

            // 检查子节点是否已存在（递归查找）
            if (this.findNodeByPath(childFullPath)) {
                Print.debug(`节点已存在，跳过：${childFullPath}`);
                return;
            }

            // 构建子节点参数
            const nodeOptions = {
                name: child.name,
                fullPath: childFullPath,
                type: child.type,
                mode: child.mode || (child.type === FileNodeType.DIRECTORY ? "drwxr-xr-x" : "-rw-r--r--"),
                size: child.size || 0,
                mtime: child.mtime || new Date().toLocaleString(),
                owner: child.owner || "",
                group: child.group || "",
                symlinkTarget: child.symlinkTarget || ""
            };

            // 创建并挂载子节点
            const childNode = new FileTreeNode(nodeOptions);
            parentNode.addChild(childNode);

            // 更新缓存（若启用）
            if (this.enablePathCache) {
                this.updatePathCache(childFullPath, childNode);
            }
        });

        if (markSynced) {
            this.setDirSyncStatus(normalizedParentPath, true);
        }

        // 启用排序则排序子节点
        if (this.sortConfig.enabled) {
            parentNode.sortChildren(this.sortConfig);
        }

        return true;
    }

    /**
     * 构建文件目录树（纯节点操作）
     * @param {string[]} dirs - 所有目录的绝对路径数组
     * @param {Object[]} files - 所有文件的详细信息数组
     */
    build(dirs, files) {
        // 先创建所有目录
        dirs.forEach(dirPath => {
            this.createMissingDirectoryPath(dirPath);
        });

        // 再创建所有文件
        files.forEach(file => {
            const parentPath = file.fullPath.slice(0, file.fullPath.lastIndexOf("/")) || "/";
            const parentNode = this.findNodeByPath(parentPath);
            if (!parentNode) return;

            // 检查文件是否已存在
            if (this.findNodeByPath(file.fullPath)) return;

            const fileNode = new FileTreeNode({
                name: file.fullPath.split("/").pop(),
                fullPath: file.fullPath,
                type: FileNodeType.FILE,
                size: file.size,
                mode: file.mode,
                owner: file.owner,
                group: file.group,
                mtime: file.mtime || new Date().toLocaleString()
            });

            parentNode.addChild(fileNode);
            // 更新缓存（若启用）
            if (this.enablePathCache) {
                this.updatePathCache(file.fullPath, fileNode);
            }
        });

        // 全局排序
        if (this.sortConfig.enabled) {
            this.globalRoot.sortRecursively(this.sortConfig);
        }
    }

    // ------------------------------
    // 导航相关方法（适配纯节点查找）
    // ------------------------------
    changeDirectory(targetPath) {
        const normalizedPath = targetPath.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
        const targetNode = this.findNodeByPath(normalizedPath);

        if (!targetNode || !targetNode.isDirectory()) {
            console.warn(`导航失败：目录不存在或非目录 - ${normalizedPath}`);
            return false;
        }

        this.currentRoot = targetNode;
        console.log(`已导航到：${this.currentRoot.fullPath}`);
        return true;
    }

    // 返回上层目录
    navigateUp() {
        if (this.currentRoot.fullPath === "/") {
            console.warn("已在根目录，无法向上导航");
            return false;
        }

        const parentNode = this.currentRoot.parent;
        if (parentNode && parentNode.isDirectory()) {
            this.currentRoot = parentNode;
            console.log(`已向上导航到：${this.currentRoot.fullPath}`);
            return true;
        }

        return false;
    }

    /**
     * 获取当前节点的同级节点（排除自身）
     * @returns {FileTreeNode[]} 同级节点列表
     */
    getSiblingNodes() {
        const parentNode = this.currentRoot.parent;
        if (!parentNode) return [];
        return parentNode.children.filter(node => node.fullPath !== this.currentRoot.fullPath);
    }

    /**
     * 更新排序配置并触发全树递归排序
     * @param {Object} [newConfig] - 新的排序配置
     */
    updateSortConfig(newConfig = {}) {
        this.sortConfig = { ...this.sortConfig, ...newConfig };
        console.log(
            `排序配置已更新：enabled=${this.sortConfig.enabled}, field=${this.sortConfig.field}, direction=${this.sortConfig.direction}`
        );
        this.globalRoot.sortRecursively(this.sortConfig);
    }

    /**
     * 切换排序方向（升序↔降序）
     */
    toggleSortDirection() {
        this.sortConfig.direction =
            this.sortConfig.direction === SortDirection.ASC
                ? SortDirection.DESC
                : SortDirection.ASC;
        this.globalRoot.sortRecursively(this.sortConfig);
        console.log(`排序方向已切换为：${this.sortConfig.direction}`);
    }

    /**
     * 格式化文件树为 Linux tree 命令风格的字符串
     * @param {FileTreeNode} node - 要格式化的节点
     * @param {string} prefix - 前缀（控制缩进和分支线）
     * @param {boolean} isLast - 是否为最后一个子节点
     * @param {boolean} isSibling - 是否为当前根节点的同级节点
     * @returns {string} tree 风格的格式化字符串
     */
    formatTree(node, prefix = "", isLast = true, isSibling = false) {
        const nodeName = node.isDirectory() ? `${node.name}/` : node.name;
        const branch = isLast ? "└──" : "├──";
        const rootMarker = !isSibling && node.fullPath === this.currentRoot.fullPath ? "" : "";
        const markerSpace = rootMarker ? " " : "";

        let line = `${prefix}${branch}${rootMarker}${markerSpace}${nodeName}`;

        if (node.isSymlink() && node.symlinkTarget) {
            line += ` -> ${node.symlinkTarget}`;
        }

        let syncFlag = "";
        if (node.isDirectory()) {
            syncFlag = node.isSynced ? " [已同步]" : " [未同步]";
            line += syncFlag;
        }

        // 额外信息：权限/大小/日期
        const extraInfo = [];
        if (this.config.showMode) extraInfo.push(node.mode?.padEnd(10) || "".padEnd(10));
        if (this.config.showSize) extraInfo.push((node.sizeFormatted || node.size)?.toString().padStart(8) || "0".padStart(8));
        if (this.config.showDate) {
            const formattedDate = (node.mtime || new Date().toLocaleString()).replace(/\s+/g, ' ').trim();
            extraInfo.push(formattedDate.padEnd(12));
        }

        if (extraInfo.length) {
            const minPad = 2;
            const requiredPad = Math.max(minPad, 40 - line.length);
            line += " ".repeat(requiredPad) + extraInfo.join(" ");
        }

        line += "\n";

        // 递归处理子目录
        if (node.isDirectory() && node.children?.length) {
            const shouldExpand = !isSibling || node.fullPath === this.currentRoot.fullPath;
            if (shouldExpand) {
                node.children.forEach((child, index) => {
                    const isChildLast = index === node.children.length - 1;
                    const newPrefix = prefix + (isLast ? "    " : "│   ");
                    line += this.formatTree(child, newPrefix, isChildLast);
                });
            } else {
                line += `${prefix}    └── ... (${node.children.length} entries)\n`;
            }
        }

        return line;
    }

    /**
     * 获取完整的格式化文件树字符串（含头部信息）
     * @returns {string} 可直接打印的文件树字符串
     */
    getFormattedTree() {
        const currentPath = this.currentRoot.fullPath;
        const sortFieldMap = {
            [SortField.NAME]: "名称",
            [SortField.SIZE]: "大小",
            [SortField.DATE]: "日期",
            [SortField.TYPE]: "类型"
        };
        const sortDirectionMap = {
            [SortDirection.ASC]: "升序",
            [SortDirection.DESC]: "降序"
        };
        const sortInfo = this.sortConfig.enabled
            ? ` | 排序：${sortFieldMap[this.sortConfig.field]} ${sortDirectionMap[this.sortConfig.direction]}`
            : " | 排序：禁用";

        let treeStr = `=== 当前目录：${currentPath}${sortInfo} ===\n`;
        const parentNode = this.currentRoot.parent;

        if (!parentNode) {
            treeStr += this.formatTree(this.currentRoot);
        } else {
            treeStr += `父目录：${parentNode.fullPath}\n`;
            treeStr += "--------------------------------\n";

            const siblings = this.getSiblingNodes();
            const allSameLevelNodes = [this.currentRoot, ...siblings];

            if (this.sortConfig.enabled) {
                allSameLevelNodes.sort((a, b) => {
                    const compareResult = FileTree.compareNodes(a, b, this.sortConfig.field);
                    return this.sortConfig.direction === SortDirection.ASC ? compareResult : -compareResult;
                });
            }

            allSameLevelNodes.forEach((node, index) => {
                const isLast = index === allSameLevelNodes.length - 1;
                const isSibling = node.fullPath !== this.currentRoot.fullPath;
                treeStr += this.formatTree(node, "", isLast, isSibling);
            });
        }

        return treeStr;
    }

    /**
     * 节点比较方法（供排序使用）
     * @param {FileTreeNode} a - 节点A
     * @param {FileTreeNode} b - 节点B
     * @param {SortField} field - 排序字段
     * @returns {number} 比较结果（-1/0/1）
     */
    static compareNodes(a, b, field) {
        switch (field) {
            case SortField.NAME:
                return a.name.localeCompare(b.name);
            case SortField.SIZE:
                return a.size - b.size;
            case SortField.DATE:
                return new Date(a.mtime) - new Date(b.mtime);
            case SortField.TYPE:
                const typeOrder = {
                    [FileNodeType.DIRECTORY]: 0,
                    [FileNodeType.FILE]: 1,
                    [FileNodeType.SYMLINK]: 2
                };
                return typeOrder[a.type] - typeOrder[b.type];
            default:
                return 0;
        }
    }

    print() {
        console.log(this.getFormattedTree());
    }

    toJson() {
        return this.currentRoot.toJSON();
    }

    getSiblingJson() {
        return this.getSiblingNodes().map((node) => node.toJSON());
    }
}

export default FileTree;