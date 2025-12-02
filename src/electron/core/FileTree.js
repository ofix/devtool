import { FileNodeType } from "./FileNodeType";
import FileTreeNode from "./FileTreeNode";

class FileTree {
    /**
     * @param {string} lsOutput - SSH2 ls -l 原始输出
     * @param {Object} [options] - 配置选项
     * @param {string} [options.initialRootPath='/'] - 初始根目录路径
     * @param {string} [options.rootName='.'] - 初始根节点显示名称
     * @param {boolean} [options.showPermissions=false] - 是否显示权限
     * @param {boolean} [options.showSize=false] - 是否显示大小
     * @param {boolean} [options.showDate=false] - 是否显示日期
     * @param {Object} [options.sortConfig] - 排序配置
     * @param {boolean} [options.sortConfig.enabled=false] - 是否启用排序（默认关闭）
     * @param {SortField} [options.sortConfig.field=SortField.TYPE] - 排序字段
     * @param {SortDirection} [options.sortConfig.direction=SortDirection.ASC] - 排序方向
     */
    constructor(lsOutput, options = {}) {
        // 基础配置
        this.config = {
            initialRootPath: options.initialRootPath || "/",
            rootName: options.rootName || ".",
            showPermissions: options.showPermissions || false,
            showSize: options.showSize || false,
            showDate: options.showDate || false,
        };

        // 排序配置（默认关闭排序，由上层决定）
        this.sortConfig = {
            enabled: options.sortConfig?.enabled ?? false,
            field: options.sortConfig?.field ?? SortField.TYPE,
            direction: options.sortConfig?.direction ?? SortDirection.ASC,
        };

        this.rawOutput = lsOutput;
        this.globalRoot = this.createGlobalRootNode();
        this.dirMap = { [this.globalRoot.getFullPath()]: this.globalRoot };
        this.currentRoot = null;

        // 初始化：解析输出 -> 构建树 -> 切换到初始根目录
        this.parseLsOutput();
        this.navigateTo(this.config.initialRootPath);
    }

    createGlobalRootNode() {
        return new FileNode({
            name: "",
            type: FileNodeType.DIRECTORY,
            permissions: "drwxr-xr-x",
            size: 0,
            date: new Date().toLocaleString(),
        });
    }

    // 构建完整的路径树
    buildTree(dirs, files) {
        const dirMap = new Map();
        dirMap.set(this.root.fullPath, this.root);
        // 先快速添加目录节点
        for (const dirPath of dirs) {
            if (dirMap.has(dirPath)) continue;
            let dirParts = dirPath.split("/");
            const parentPath = dirParts.slice(0, -1).join("/") || this.root.fullPath;
            const dirName = dirParts.pop();

            const parentNode = dirMap.get(parentPath);
            if (parentNode) {
                const dirNode = new FileTreeNode({
                    name: dirName,
                    fullPath: dirPath,
                    type: FileNodeType.DIRECTORY,
                });
                parentNode.addChild(dirNode);
                dirMap.set(dirPath, dirNode);
            } else {
                let fullPath = "";
                for (let i = 0; i < dirParts.length; i++) {
                    let dirName = dirParts[i];
                    fullPath += "/" + dirName;
                    const dirNode = new FileTreeNode({
                        name: dirName,
                        fullPath: fullPath,
                        type: FileNodeType.DIRECTORY,
                    });
                    const parentNode = dirMap.get(parentPath) || this.root;
                    parentNode.addChild(dirNode);
                    dirMap.set(fullPath, dirNode);
                }
            }
        }

        // 先按路径排序，确保父目录在前
        const sortedFiles = files.sort((a, b) => a.path.localeCompare(b.path));

        for (const file of files) {
            const parentNode = dirMap.get(parentPath);
            if (parentNode) {
                const fileNode = new FileTreeNode({
                    name: dirName,
                    fullPath: dirPath,
                    type: FileNodeType.DIRECTORY,
                    size: file.size,
                    mode: file.mode,
                    owner: file.owner,
                    mode: file.group,
                });
            }
        }
        // 更新统计信息
        this.totalBytes = this.root.totalSize;
        this.totalFiles = this.root.fileCount;
        this.totalDirs = this.root.dirCount;
    }

    // 添加文件到树中
    _addFileToTree(fileInfo) {
        const pathParts = fileInfo.relPath.split("/").filter((part) => part.trim());

        if (pathParts.length === 0) return;

        let currentNode = this.root;
        let currentPath = this.root.fullPath;

        // 构建目录路径
        for (let i = 0; i < pathParts.length - 1; i++) {
            const dirName = pathParts[i];
            currentPath = `${currentPath}/${dirName}`;

            let dirNode = currentNode.find(dirName);
            if (!dirNode) {
                // 创建目录节点
                dirNode = new FileTreeNode({
                    name: dirName,
                    type: FileNodeType.DIRECTORY,
                });
                dirNode.fullPath = currentPath;
                dirNode.relPath = currentPath
                    .replace(this.root.fullPath, "")
                    .replace(/^\//, "");
                currentNode.addChild(dirNode);
            }
            currentNode = dirNode;
        }

        // 添加文件节点
        const fileName = pathParts[pathParts.length - 1];
        const fileNode = new FileTreeNode({
            name: fileName,
            type: FileNodeType.FILE,
            size: fileInfo.size,
            mtime: fileInfo.mtime,
            mode: fileInfo.mode,
            owner: fileInfo.owner,
            group: fileInfo.group,
        });
        fileNode.fullPath = fileInfo.path;
        fileNode.relPath = fileInfo.relPath;

        currentNode.addChild(fileNode);
    }

    // 查找文件/目录
    find(path) {
        const pathParts = path
            .replace(this.root.fullPath, "")
            .split("/")
            .filter((part) => part.trim());
        let currentNode = this.root;

        for (const part of pathParts) {
            if (!currentNode.children) return null;
            const nextNode = currentNode.find(part);
            if (!nextNode) return null;
            currentNode = nextNode;
        }

        return currentNode;
    }

    /**
     * 解析 ls 输出，添加节点时按当前排序配置插入（插入排序）
     */
    parseLsOutput() {
        if (!this.rawOutput) return;

        const lines = this.rawOutput.split(/\r?\n/).filter((line) => line.trim());
        lines.forEach((line) => {
            if (line.startsWith("total")) return;

            const lsRegex =
                /^([d\-l]([rwx\-]{9}|[rwx\-]{3}){3})\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\w{3}\s+\d+\s+(?:\d{2}:\d{2}|\d{4}))\s+(.+)$/;
            const match = line.match(lsRegex);

            if (match) {
                const [, permissions, , , , size, date, name] = match;
                this.createFileNode({ permissions, size, date, name });
            }
        });
    }

    createFileNode({ permissions, size, date, name }) {
        const typeMap = {
            d: FileNodeType.DIRECTORY,
            "-": FileNodeType.FILE,
            l: FileNodeType.SYMLINK,
        };

        const typeChar = permissions[0];
        const nodeType = typeMap[typeChar];
        if (!nodeType) {
            console.warn(`Unsupported file type: ${typeChar} (skipped: ${name})`);
            return;
        }

        // 处理符号链接和目录后缀
        let nodeName = name;
        let symlinkTarget = "";
        if (nodeType === FileNodeType.SYMLINK) {
            const [linkName, target] = name.split(" -> ");
            nodeName = linkName;
            symlinkTarget = target || "";
        }
        if (nodeType === FileNodeType.DIRECTORY && nodeName.endsWith("/")) {
            nodeName = nodeName.slice(0, -1);
        }

        // 解析完整路径
        const fullPath = nodeName.startsWith("/") ? nodeName : `/${nodeName}`;
        const pathParts = fullPath.split("/").filter((part) => part);
        const targetNodeName = pathParts.pop();
        const parentFullPath = pathParts.length ? `/${pathParts.join("/")}` : "/";

        // 确保父目录存在
        const parentNode = this.ensureDirectoryExists(parentFullPath);

        // 创建当前节点
        const node = new FileNode({
            name: targetNodeName,
            type: nodeType,
            permissions,
            size: parseInt(size, 10),
            date,
            symlinkTarget,
            parent: parentNode,
        });

        // 按排序配置插入子节点（核心优化：插入排序）
        parentNode.addChild(node, this.sortConfig);

        // 目录添加到映射表
        if (node.isDirectory()) {
            this.dirMap[node.getFullPath()] = node;
        }
    }

    ensureDirectoryExists(fullPath) {
        const normalizedPath =
            fullPath.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
        if (this.dirMap[normalizedPath]) {
            return this.dirMap[normalizedPath];
        }

        const pathParts = normalizedPath.split("/").filter((part) => part);
        let currentPath = "/";
        let currentNode = this.globalRoot;

        for (const dirName of pathParts) {
            currentPath = `${currentPath}/${dirName}`.replace(/\/+/g, "/");

            if (!this.dirMap[currentPath]) {
                const newDirNode = new FileNode({
                    name: dirName,
                    type: FileNodeType.DIRECTORY,
                    permissions: "drwxr-xr-x",
                    size: 0,
                    date: new Date().toLocaleString(),
                    parent: currentNode,
                });
                // 按排序配置插入目录节点
                currentNode.addChild(newDirNode, this.sortConfig);
                this.dirMap[currentPath] = newDirNode;
            }

            currentNode = this.dirMap[currentPath];
        }

        return currentNode;
    }

    // ------------------------------
    // 导航相关方法（保持不变）
    // ------------------------------
    changeDirectory(targetPath) {
        const normalizedPath =
            targetPath.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
        const targetNode = this.dirMap[normalizedPath];

        if (!targetNode || !targetNode.isDirectory()) {
            console.warn(
                `Navigation failed: Directory not found or not a directory - ${normalizedPath}`
            );
            return false;
        }

        this.currentRoot = targetNode;
        console.log(`Navigated to: ${this.currentRoot.getFullPath()}`);
        return true;
    }
    // 返回上层目录
    navigateUp() {
        if (this.currentRoot.getFullPath() === "/") {
            console.warn("Already at the root directory");
            return false;
        }

        const parentNode = this.currentRoot.parent;
        if (parentNode && parentNode.isDirectory()) {
            this.currentRoot = parentNode;
            console.log(`Navigated up to: ${this.currentRoot.getFullPath()}`);
            return true;
        }

        return false;
    }

    getSiblingNodes() {
        const parentNode = this.currentRoot.parent;
        if (!parentNode) return [];
        return parentNode.children.filter(
            (node) => node.getFullPath() !== this.currentRoot.getFullPath()
        );
    }

    /**
     * 更新排序配置并触发全树递归排序（用户界面点击排序字段时调用）
     * @param {Object} [newConfig] - 新的排序配置
     * @param {boolean} [newConfig.enabled] - 是否启用排序
     * @param {SortField} [newConfig.field] - 排序字段
     * @param {SortDirection} [newConfig.direction] - 排序方向
     */
    updateSortConfig(newConfig = {}) {
        // 合并新配置
        this.sortConfig = {
            ...this.sortConfig,
            ...newConfig,
        };

        console.log(
            `Sort config updated: enabled=${this.sortConfig.enabled}, field=${this.sortConfig.field}, direction=${this.sortConfig.direction}`
        );

        // 触发全树递归排序（包括所有子目录）
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
        console.log(`Sort direction toggled to: ${this.sortConfig.direction}`);
    }

    // ------------------------------
    // 格式化输出
    // ------------------------------
    formatTree(node, prefix = "", isLast = true, isSibling = false) {
        const iconMap = {
            [FileNodeType.DIRECTORY]: "📁",
            [FileNodeType.FILE]: "📄",
            [FileNodeType.SYMLINK]: "🔗",
        };

        const branch = isLast ? "└── " : "├── ";
        const icon = iconMap[node.type] || "❓";
        const rootMarker =
            !isSibling && node.getFullPath() === this.currentRoot.getFullPath()
                ? "📌 "
                : "";
        let line = `${prefix}${branch}${rootMarker}${icon} ${node.name}`;

        if (node.isSymlink() && node.symlinkTarget) {
            line += ` -> ${node.symlinkTarget}`;
        }

        const extraInfo = [];
        if (this.config.showPermissions) extraInfo.push(node.permissions);
        if (this.config.showSize) extraInfo.push(`${node.size}B`);
        if (this.config.showDate) extraInfo.push(node.date);

        if (extraInfo.length) {
            line += ` [${extraInfo.join(" | ")}]`;
        }

        line += "\n";

        if (node.isDirectory() && node.children.length) {
            const shouldExpand =
                !isSibling || node.getFullPath() === this.currentRoot.getFullPath();
            if (shouldExpand) {
                node.children.forEach((child, index) => {
                    const isChildLast = index === node.children.length - 1;
                    const newPrefix = prefix + (isLast ? "    " : "│   ");
                    line += this.formatTree(child, newPrefix, isChildLast);
                });
            } else {
                line += `${prefix}    └── ... (${node.children.length} items)\n`;
            }
        }

        return line;
    }

    getFormattedTree() {
        const currentPath = this.currentRoot.getFullPath();
        const sortInfo = this.sortConfig.enabled
            ? ` | 排序：${this.sortConfig.field} ${this.sortConfig.direction}`
            : " | 排序：禁用";
        let treeStr = `=== 当前目录：${currentPath}${sortInfo} ===\n`;

        const parentNode = this.currentRoot.parent;

        if (!parentNode) {
            treeStr += this.formatTree(this.currentRoot);
        } else {
            treeStr += `父目录：${parentNode.getFullPath()}\n`;
            treeStr += "--------------------------------\n";

            const siblings = this.getSiblingNodes();
            const allSameLevelNodes = [this.currentRoot, ...siblings];
            // 确保同层级节点也按当前排序规则排序
            if (this.sortConfig.enabled) {
                allSameLevelNodes.sort((a, b) => {
                    const compareResult = a.compareNodes(a, b, this.sortConfig.field);
                    return this.sortConfig.direction === SortDirection.ASC
                        ? compareResult
                        : -compareResult;
                });
            }

            allSameLevelNodes.forEach((node, index) => {
                const isLast = index === allSameLevelNodes.length - 1;
                const isSibling = node.getFullPath() !== this.currentRoot.getFullPath();
                treeStr += this.formatTree(node, "", isLast, isSibling);
            });
        }

        return treeStr;
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
