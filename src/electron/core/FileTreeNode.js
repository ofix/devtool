import { FileNodeType, SortDirection } from "./FileNodeType.js";
import path from 'path';
class FileTreeNode {
    /**
     * @param {Object} options - 节点
     * @param {string} options.name - 节点名称
     * @param {string} options.fullPath - 节点绝对路径
     * @param {FileNodeType} options.type - 节点类型
     * @param {number} [options.size=0] - 节点大小（字节）
     * @param {string} [mtime=''] - 节点修改日期
     * @param {string} [options.mode=''] - 节点权限
     * @param {string} [options.owner=''] - 节点所属用户
     * @param {string} [options.group=''] - 节点所属用户组
     * @param {string} [options.symlinkTarget=''] - 节点软链接
     * @param {FileTreeNode|null} [options.parent=null] - 父节点
     */
    constructor({
        name, // 名称
        type, // 目录或者文件
        size = 0, // 大小
        fullPath = '', // 文件路径
        mtime = '', // 文件修改日期
        mode = 'drwxr-xr-x', // 权限
        owner = '', // 拥有者
        group = '', // 所在组
        symlinkTarget = null, // 软连接
        parent = null // 父节点
    }) {
        this.name = name;
        this.type = type;
        this.size = size;
        this.fullPath = fullPath;
        this.sizeFormatted = this.formatSize(size);
        this.mtime = mtime;
        this.mode = mode;
        this.owner = owner;
        this.group = group;
        this.parent = parent;
        this.symlinkTarget = symlinkTarget;
        this.children = type === FileNodeType.DIRECTORY ? [] : null;
        this.timestamp = this.parseDateToTimestamp(mtime);
        this.ignored = false; // 是否忽略当前文件或者目录
        this.visible = false; // 搜索文件的时候需要显示/隐藏
        this.isSynced = false; // 是否同步过远程数据（仅目录有效）
        this.syncTime = null; // 最后同步时间（时间戳）
        this.syncError = null; // 同步失败时的错误信息（可选）
    }

    formatSize(size) {
        return size;
    }



    /**
     * 增强版文件扩展名获取工具
     * @param {string} filePath - 文件路径
     * @param {object} options - 配置项
     * @param {boolean} options.full - 是否返回完整多后缀（默认 false）
     * @param {string} options.fallback - 无扩展名时的兜底值（默认 ''）
     * @returns {string} 扩展名
     */
    extname(filePath, { full = false, fallback = '' } = {}) {
        if (typeof filePath !== 'string') return fallback;
        if (!full) {
            return path.extname(filePath).slice(1); // 仅最后一个后缀
        }
        const basename = path.basename(filePath); // 完整后缀
        const firstDotIndex = basename.indexOf('.');
        return firstDotIndex > 0 ? basename.slice(firstDotIndex + 1) : fallback;
    }

    /**
     * 解析 ls 日期格式为时间戳（统一排序标准）
     * @param {string} dateStr - ls 输出的日期字符串（如 "Oct 25 10:04" 或 "Oct 25 2024"）
     * @returns {number} 时间戳（毫秒）
     */
    parseDateToTimestamp(dateStr) {
        if (!dateStr) return 0;
        // 补全年份（ls 输出可能省略年份，默认当前年）
        const year = new Date().getFullYear();
        const fullDateStr = dateStr.includes(year.toString()) ? dateStr : `${dateStr} ${year}`;
        return new Date(fullDateStr).getTime() || 0;
    }

    isDirectory() {
        return this.type === FileNodeType.DIRECTORY;
    }

    isFile() {
        return this.type === FileNodeType.FILE;
    }

    isSymlink() {
        return this.type === FileNodeType.SYMLINK;
    }

    getTypeName() {
        return FileNodeType.getTypeName(this.type);
    }

    // ========== 新增：同步状态设置方法 ==========
    setSyncStatus(isSynced, syncTime = new Date().getTime(), syncError = null) {
        if (!this.isDirectory()) return; // 仅目录可设置同步状态
        this.isSynced = isSynced;
        this.syncTime = syncTime;
        this.syncError = syncError;
    }

    /**
     * 核心优化：按当前排序规则插入子节点（避免批量排序）
     * @param {FileTreeNode} childNode - 子节点
     * @param {Object} sortConfig - 排序配置
     * @throws {Error} 如果当前节点不是目录
     */
    addChild(childNode, sortConfig) {
        if (!this.isDirectory()) {
            throw new Error(`Cannot add child to non-directory node: ${this.name} (type: ${this.getTypeName()})`);
        }
        if (!(childNode instanceof FileTreeNode)) {
            throw new Error('Child node must be an instance of FileTreeNode');
        }

        childNode.parent = this;

        // 如果启用排序，找到插入位置并插入（插入排序）
        if (sortConfig?.enabled) {
            const insertIndex = this.findInsertIndex(childNode, sortConfig);
            this.children.splice(insertIndex, 0, childNode);
        } else {
            // 不排序，直接追加到末尾
            this.children.push(childNode);
        }
    }

    // ========== 新增：同步状态设置方法 ==========
    setSyncStatus(isSynced, syncTime = new Date().getTime(), syncError = null) {
        if (!this.isDirectory()) return; // 仅目录可设置同步状态
        this.isSynced = isSynced;
        this.syncTime = syncTime;
        this.syncError = syncError;
    }

    /**
     * 查找子节点的插入位置（基于当前排序规则）
     * @param {FileTreeNode} newNode - 新节点
     * @param {Object} sortConfig - 排序配置
     * @returns {number} 插入索引
     */
    findInsertIndex(newNode, sortConfig) {
        const { field, direction } = sortConfig;
        const isAsc = direction === SortDirection.ASC;

        for (let i = 0; i < this.children.length; i++) {
            const currentNode = this.children[i];
            const compareResult = this.compareNodes(newNode, currentNode, field);

            // 升序：新节点 < 当前节点 → 插入到当前位置
            // 降序：新节点 > 当前节点 → 插入到当前位置
            if ((isAsc && compareResult < 0) || (!isAsc && compareResult > 0)) {
                return i;
            }
        }

        // 插入到末尾
        return this.children.length;
    }




    // 子节点排序（适配原排序逻辑）
    sortChildren(sortConfig) {
        if (!sortConfig.enabled) return;
        this.children.sort((a, b) => {
            let compareResult = 0;
            switch (sortConfig.field) {
                case SortField.NAME:
                    compareResult = a.name.localeCompare(b.name);
                    break;
                case SortField.SIZE:
                    compareResult = a.size - b.size;
                    break;
                case SortField.DATE:
                    compareResult = new Date(a.mtime) - new Date(b.mtime);
                    break;
                case SortField.TYPE:
                    const typeOrder = {
                        [FileNodeType.DIRECTORY]: 0,
                        [FileNodeType.FILE]: 1,
                        [FileNodeType.SYMLINK]: 2
                    };
                    compareResult = typeOrder[a.type] - typeOrder[b.type];
                    break;
            }
            return sortConfig.direction === SortDirection.ASC ? compareResult : -compareResult;
        });
    }

    // 递归排序（适配原逻辑）
    sortRecursively(sortConfig) {
        this.sortChildren(sortConfig);
        this.children.forEach(child => {
            if (child.isDirectory()) child.sortRecursively(sortConfig);
        });
    }
    // 序列化JSON（包含同步状态）
    toJSON() {
        return this.toJSON_DFS();
    }

    toJSON_Recursive() {
        return {
            name: this.name,
            fullPath: this.fullPath,
            type: this.type,
            mode: this.mode,
            size: this.size,
            mtime: this.mtime,
            owner: this.owner,
            group: this.group,
            symlinkTarget: this.symlinkTarget,
            isDirectory: this.isDirectory(),
            isFile: this.isFile(),
            isSymlink: this.isSymlink(),
            // 同步状态
            isSynced: this.isSynced,
            syncTime: this.syncTime,
            syncError: this.syncError,
            // 子节点（递归序列化）
            children: this.children?.map(child => child.toJSON())
        };
    }

    // 非递归 toJSON（深度优先，栈实现）
    toJSON_DFS() {
        // 最终要返回的根节点副本
        let id = 1;
        const root = {
            id: id,
            name: this.name,
            type: this.type,
            path: this.fullPath,
            ext: this.extname(this.fullPath),
            children: []
        };

        // 栈元素：[当前节点的副本, 原始子节点列表]
        const stack = [[root, this.children]];

        while (stack.length > 0) {
            // 弹出栈顶元素（后进先出 → 深度优先）
            const [currentCopy, originalChildren] = stack.pop();

            // 确保子节点列表是数组（核心：处理 null/undefined）
            const safeChildren = Array.isArray(originalChildren) ? originalChildren : [];

            // 遍历原始子节点，生成副本
            for (let i = safeChildren.length - 1; i >= 0; i--) { // 倒序入栈，保证正序输出
                const originalChild = safeChildren[i];
                // 生成子节点副本
                const childCopy = {
                    id: id++,
                    name: originalChild.name,
                    type: originalChild.type,
                    path: originalChild.fullPath,
                    ext: this.extname(originalChild.fullPath),
                    children: originalChild.type == FileNodeType.DIRECTORY && originalChild.children.length == 0 ? [''] : []
                };
                // 添加到当前节点的 children
                currentCopy.children.push(childCopy);
                // 子节点入栈，继续处理它的子节点
                stack.push([childCopy, originalChild.children]);
            }
        }

        return root;
    }
    // 非递归 toJSON（广度优先，队列实现）
    toJSON_BFS() {
        let id = 1;
        const root = {
            id: id,
            name: this.name,
            type: this.type,
            path: this.fullPath,
            ext: this.extname(this.fullPath),
            children: []
        };

        // 队列元素：[当前节点的副本, 原始子节点列表]
        const queue = [[root, this.children]];

        while (queue.length > 0) {
            // 取出队首元素（先进先出 → 广度优先）
            const [currentCopy, originalChildren] = queue.shift();
            const safeChildren = Array.isArray(originalChildren) ? originalChildren : [];

            // 遍历原始子节点
            for (const originalChild of safeChildren) {
                const childCopy = {
                    id: originalChild.id,
                    name: originalChild.name,
                    type: originalChild.type,
                    path: originalChild.fullPath,
                    ext: this.extname(originalChild.fullPath),
                    children: originalChild.type == FileNodeType.DIRECTORY && originalChild.children.length == 0 ? [''] : []
                };
                currentCopy.children.push(childCopy);
                // 子节点入队
                queue.push([childCopy, originalChild.children]);
            }
        }

        return root;
    }
}

export default FileTreeNode;