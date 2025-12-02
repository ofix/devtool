import { FileNodeType, SortDirection } from "./FileNodeType.js";
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
    }

    formatSize(size) {
        return size;
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

    /**
     * 按指定字段比较两个节点
     * @param {FileTreeNode} a - 节点A
     * @param {FileTreeNode} b - 节点B
     * @param {SortField} field - 排序字段
     * @returns {number} 比较结果（-1/0/1）
     */
    compareNodes(a, b, field) {
        switch (field) {
            case SortField.NAME:
                // 名称按字母序比较
                return a.name.localeCompare(b.name);

            case SortField.SIZE:
                // 大小按数值比较
                return a.size - b.size;

            case SortField.DATE:
                // 日期按时间戳比较
                return a.timestamp - b.timestamp;

            case SortField.TYPE:
            default:
                // 类型排序：目录在前，然后是符号链接，最后是文件
                const typePriority = (node) => {
                    if (node.isDirectory()) return 0;
                    if (node.isSymlink()) return 1;
                    return 2;
                };
                return typePriority(a) - typePriority(b);
        }
    }

    /**
     * 递归排序当前节点及其所有子节点（用户手动触发时调用）
     * @param {Object} sortConfig - 排序配置
     */
    sortRecursively(sortConfig) {
        if (!this.isDirectory() || !sortConfig.enabled) return;

        // 排序当前节点的子节点
        this.children.sort((a, b) => {
            const baseCompare = this.compareNodes(a, b, sortConfig.field);
            return sortConfig.direction === SortDirection.ASC ? baseCompare : -baseCompare;
        });

        // 递归排序所有子目录
        this.children.forEach(child => {
            if (child.isDirectory()) {
                child.sortRecursively(sortConfig);
            }
        });
    }

    getFullPath() {
        const pathParts = [];
        let currentNode = this;
        while (currentNode) {
            pathParts.unshift(currentNode.name);
            currentNode = currentNode.parent;
        }
        const fullPath = pathParts.join('/');
        return fullPath.startsWith('/') ? fullPath : `/${fullPath}`;
    }

    toJSON() {
        const data = {
            name: this.name,
            type: this.getTypeName(),
            typeCode: this.type,
            path: this.getFullPath(),
            permissions: this.permissions,
            size: this.size,
            date: this.date,
            timestamp: this.timestamp
        };

        if (this.isSymlink()) {
            data.symlinkTarget = this.symlinkTarget;
        }

        if (this.isDirectory()) {
            data.children = this.children.map(child => child.toJSON());
        }

        return data;
    }
}

export default FileTreeNode;