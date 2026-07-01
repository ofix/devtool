import { FileNodeType, SortField, SortDirection } from "./FileNodeType.js";

class FileTreeNode {
    /**
     * @param {Object} options - 节点
     * @param {string} options.name - 节点名称
     * @param {string} options.path - 节点绝对路径
     * @param {FileNodeType} options.type - 节点类型
     * @param {number} [options.size=0] - 节点大小（字节）
     * @param {string} [mtime=''] - 节点修改日期
     * @param {FileTreeNode|null} [options.parent=null] - 父节点
     */
    constructor({
        name, // 名称
        type, // 目录或者文件
        size = 0, // 大小
        path = '', // 文件路径
        mtime = '', // 文件修改日期
        parent = null, // 父节点
        loaded = false, // 节点是否加载
    }) {
        this.name = name;
        this.type = type;
        this.size = size;
        this.path = path;
        this.sizeFormatted = this.formatSize(size);
        this.mtime = mtime;
        this.parent = parent;
        this.children = type === FileNodeType.DIRECTORY || type === FileNodeType.COLLAPSE_DIR ? [] : null;
        this.ignored = false;  // 是否忽略当前文件或者目录
        this.visible = false;  // 搜索文件的时候需要显示/隐藏
        this.loaded = loaded;   // 是否同步过远程数据（仅目录有效）
    }

    formatSize(size) {
        return size;
    }

    /**
     * 增强版文件扩展名获取工具（浏览器环境）
     * @param {string} filePath - 文件路径
     * @param {object} options - 配置项
     * @param {boolean} options.full - 是否返回完整多后缀（默认 false）
     * @param {string} options.fallback - 无扩展名时的兜底值（默认 ''）
     * @param {boolean} options.preserveDot - 是否保留点号（默认 false）
     * @returns {string} 扩展名
     */
    extname(filePath, { full = false, fallback = '', preserveDot = false } = {}) {
        // 参数校验
        if (typeof filePath !== 'string' || !filePath) return fallback;

        // 获取文件名（去除路径）
        const basename = this._getBasename(filePath);

        // 处理特殊情况
        // - 空文件名
        if (!basename) return fallback;
        // - 隐藏文件（以点开头但没有后缀，如 .gitignore）
        if (basename.startsWith('.') && basename.indexOf('.', 1) === -1) {
            return preserveDot ? '.' : '';
        }

        // 查找点号位置
        const dotIndex = full ? basename.indexOf('.') : basename.lastIndexOf('.');

        // 没有找到点号或点在开头且是唯一点
        if (dotIndex === -1 || dotIndex === 0) {
            return fallback;
        }

        // 提取扩展名
        const ext = basename.slice(dotIndex + 1);

        // 决定是否保留点号
        return preserveDot ? `.${ext}` : ext;
    }

    /**
     * 获取文件名（跨平台兼容）
     * @param {string} filePath - 文件路径
     * @returns {string} 文件名
     */
    _getBasename(filePath) {
        // 同时处理 Windows (\ 和 /) 和 Unix (/) 路径分隔符
        const normalized = filePath.replace(/[\\/]/g, '/');
        const parts = normalized.split('/');
        return parts[parts.length - 1] || '';
    }

    /**
     * 获取文件所在目录（跨平台）
     * @param {string} filePath - 文件路径
     * @returns {string} 目录路径
     */
    _getDirname(filePath) {
        const normalized = filePath.replace(/[\\/]/g, '/');
        const parts = normalized.split('/');
        parts.pop(); // 移除文件名
        return parts.join('/') || (normalized.startsWith('/') ? '/' : '');
    }

    /**
     * 解析文件路径（跨平台）
     * @param {string} filePath - 文件路径
     * @returns {object} 解析结果
     */
    parsePath(filePath) {
        const basename = this._getBasename(filePath);
        const dirname = this._getDirname(filePath);
        const ext = this.extname(filePath);
        const name = basename.replace(new RegExp(`\\.${ext}$`), '');

        return {
            root: filePath.startsWith('/') ? '/' : '',
            dir: dirname,
            base: basename,
            ext: ext,
            name: name
        };
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

    isCollapseDir() {
        return this.type === FileNodeType.COLLAPSE_DIR;
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

    // 同步状态设置方法
    setSyncStatus(isSynced, syncTime = new Date().getTime()) {
        if (!this.isDirectory() && !this.isCollapseDir()) return; // 仅目录可设置同步状态
        this.isSynced = isSynced;
        this.syncTime = syncTime;
    }

    /**
     * 核心优化：按当前排序规则插入子节点（避免批量排序）
     * @param {FileTreeNode} childNode - 子节点
     * @param {Object} sortConfig - 排序配置
     * @throws {Error} 如果当前节点不是目录
     */
    addChild(childNode, sortConfig) {
        if (!this.isDirectory() && !this.isCollapseDir()) {
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

        if (childNode.isDirectory() && this.children.length == 1) {
            this.type = FileNodeType.COLLAPSE_DIR;
        }

        if (childNode.isCollapseDir() && this.children.length > 1) {
            this.type = FileNodeType.DIRECTORY;
        }
    }


    delChild(childNode) {
        if (!this.isDirectory() && !this.isCollapseDir()) {
            throw new Error(`Cannot add child to non-directory node: ${this.name} (type: ${this.getTypeName()})`);
        }

        if (!(childNode instanceof FileTreeNode)) {
            throw new Error('Child node must be an instance of FileTreeNode');
        }

        for (let i = 0; i < this.children.length; i++) {
            let child = this.children[i];
            if (child.type === childNode.type && child.name === childNode.name
                && child.path === childNode.path) {
                this.children.splice(i, 1);
            }
        }

        if (this.children.length == 1 && this.children[0].isDirectory()) {
            this.type = FileNodeType.COLLAPSE_DIR;
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

    // 递归排序
    sortRecursively(sortConfig) {
        this.sortChildren(sortConfig);
        this.children.forEach(child => {
            if (child.isDirectory()) child.sortRecursively(sortConfig);
        });
    }

    /**
     * 序列化节点
     * @param {boolean} recursive  - 是否递归序列化children（true=递归，false=仅当前节点）
     * @param {boolean} simple     - 精简模式，只序列化部分字段，默认为true
     * @param {boolean} collapseDirectory - 是否折叠目录
     * @returns {Object} 序列化结果
     */
    toJSON(recursive = true, simple = true, collapseDirectory = true) {
        const nodeJson = this.getNodeJson(this, simple);
        if (!recursive) return nodeJson;

        // 深度优先遍历
        const stack = [[nodeJson, this.children]];
        while (stack.length > 0) {
            const [current, children] = stack.pop();
            if (collapseDirectory && children.length == 1 && children[0].type == FileNodeType.DIRECTORY) {
                const child = children[0];
                const childJson = this.getNodeJson(child, simple);
                current.type = FileNodeType.COLLAPSE_DIR;
                current.path = child.path;
                (current.collapsePath ??= []).push({
                    name: child.name,
                    path: child.path,
                    type: child.type,
                });
                stack.push([current, child.children]);
            } else {
                for (let i = 0; i < children.length; i++) {
                    const child = children[i];
                    const childJson = this.getNodeJson(child, simple);
                    current.children.push(childJson);

                    if (child.type === FileNodeType.DIRECTORY) {
                        stack.push([childJson, child.children]);
                    }
                }
            }
        }

        return nodeJson;
    }

    /**
     * 获取单个节点的序列化数据（修复所有边界问题）
     * @param {FileTreeNode} node 要序列化的节点
     * @param {boolean} simple  是否精简模式
     * @returns {Object} 单个节点的序列化结果
     */
    getNodeJson(node) {
        const result = {};
        result.name = node.name;
        result.type = node.type;
        result.size = node.size;
        result.path = node.path;
        result.ext = this.extname(node.path);
        // 区分目录/文件的children处理
        result.children = node.type === FileNodeType.DIRECTORY
            ? (node.children.length === 0 ? [''] : [])  // 空目录懒加载占位
            : [];                                // 文件节点无children
        return result;
    }
}

export default FileTreeNode;