import { FileNodeType, SortField, SortDirection } from "./FileNodeType.js";
import FileTreeNode from "./FileTreeNode.js";
import Print from "./Print.js";

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

        // 排序配置（默认关闭排序，由上层决定）
        this.sortConfig = {
            enabled: options.sortConfig?.enabled ?? false,
            field: options.sortConfig?.field ?? SortField.TYPE,
            direction: options.sortConfig?.direction ?? SortDirection.ASC,
        };

        this.root = this.createGlobalRootNode();
        this.currentRoot = this.root;
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
     * 构建文件目录树（目录优先，文件后补）
     * @param {string[]} dirs - 所有目录的绝对路径数组
     * @param {Object[]} files - 所有文件的详细信息数组（含fullPath/size/mode等）
     */
    build(dirs, files) {
        const dirMap = new Map([[this.root.fullPath, this.root]]); // 根节点初始化

        for (const dirPath of dirs) {
            if (dirMap.has(dirPath)) continue; // 跳过已存在的目录

            // 递归创建路径上的所有缺失目录（如 /a/b/c 不存在时，依次创建a、a/b、a/b/c）
            const pathParts = dirPath.split("/").filter(part => part); // 分割并过滤空字符串（避免重复//）
            let currentPath = "";
            for (const part of pathParts) {
                currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
                if (dirMap.has(currentPath)) continue; // 跳过已存在的中间目录

                const parentPath = currentPath.lastIndexOf("/") === 0 ? "/" : currentPath.slice(0, currentPath.lastIndexOf("/"));
                const parentNode = dirMap.get(parentPath);
                const dirNode = new FileTreeNode({
                    name: part,
                    fullPath: currentPath,
                    type: FileNodeType.DIRECTORY
                });
                parentNode.addChild(dirNode);
                dirMap.set(currentPath, dirNode);
            }
        }

        for (const file of files) {
            const parentPath = file.fullPath.slice(0, file.fullPath.lastIndexOf("/")) || "/"; // 提取父目录路径
            const parentNode = dirMap.get(parentPath);
            if (!parentNode) continue; // 父目录不存在则跳过（理论上不会出现）

            const fileNode = new FileTreeNode({
                name: file.fullPath.split("/").pop(), // 从完整路径提取文件名
                fullPath: file.fullPath,
                type: FileNodeType.FILE,
                size: file.size,
                mode: file.mode,
                owner: file.owner,
                group: file.group
            });
            parentNode.addChild(fileNode);
        }
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
        console.log(`Navigated to: ${this.currentRoot.fullPath}`);
        return true;
    }
    // 返回上层目录
    navigateUp() {
        if (this.currentRoot.fullPath === "/") {
            console.warn("Already at the root directory");
            return false;
        }

        const parentNode = this.currentRoot.parent;
        if (parentNode && parentNode.isDirectory()) {
            this.currentRoot = parentNode;
            console.log(`Navigated up to: ${this.currentRoot.fullPath}`);
            return true;
        }

        return false;
    }

    getSiblings() {
        const parentNode = this.currentRoot.parent;
        if (!parentNode) return [];
        return parentNode.children.filter(
            (node) => node.name !== this.currentRoot.name
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


    /**
     * 格式化文件树为 Linux tree 命令风格的字符串（无多余空格，完全对齐）
     * @param {FileTreeNode} node - 要格式化的节点
     * @param {string} prefix - 前缀（控制缩进和分支线）
     * @param {boolean} isLast - 是否为最后一个子节点
     * @param {boolean} isSibling - 是否为当前根节点的同级节点
     * @returns {string} tree 风格的格式化字符串
     */
    formatTree(node, prefix = "", isLast = true, isSibling = false) {
        // 节点名称标识：目录末尾加 /，文件无后缀（完全对齐 tree）
        const nodeName = node.isDirectory() ? `${node.name}` : node.name;

        // 分支线：无多余空格（原代码多了空格，导致间隙）
        const branch = isLast ? "└──" : "├──";

        // 根节点标记（可选，不影响间距）
        const rootMarker = !isSibling && node.fullPath === this.currentRoot.fullPath ? "" : "";
        // 标记与名称间仅留1个空格（无标记则无空格）
        const markerSpace = rootMarker ? " " : "";

        // 核心行：前缀 + 分支线 + 标记（可选） + 名称（紧挨着线，无多余空格）
        let line = `${prefix}${branch}${rootMarker}${markerSpace}${nodeName}`;

        // 符号链接追加目标路径（tree 风格）
        if (node.isSymlink() && node.symlinkTarget) {
            line += ` -> ${node.symlinkTarget}`;
        }

        // 额外信息：权限/大小/日期（居右显示，对齐 tree -pugs）
        const extraInfo = [];
        if (this.config.showMode) extraInfo.push(node.mode.padEnd(10));
        if (this.config.showSize) extraInfo.push(node.sizeFormatted.padStart(8));
        if (this.config.showDate) {
            const formattedDate = node.mtime.replace(/\s+/g, ' ').trim();
            extraInfo.push(formattedDate.padEnd(12));
        }

        // 名称与额外信息间补空格（确保对齐，无多余间隙）
        if (extraInfo.length) {
            const minPad = 2; // 最小间距（tree 原生风格）
            const requiredPad = Math.max(minPad, 40 - line.length); // 总长度不足40则补满
            line += " ".repeat(requiredPad) + extraInfo.join(" ");
        }

        line += "\n";

        // 递归处理子目录（分支线对齐，无多余空格）
        if (node.isDirectory() && node.children?.length) {
            const shouldExpand = !isSibling || node.fullPath === this.currentRoot.fullPath;
            if (shouldExpand) {
                node.children.forEach((child, index) => {
                    const isChildLast = index === node.children.length - 1;
                    // 前缀逻辑：保持分支线连续（无多余空格）
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
        // 排序信息格式化（将枚举值转为中文，更易读）
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

        // 头部信息
        let treeStr = `=== 当前目录：${currentPath}${sortInfo} ===\n`;
        const parentNode = this.currentRoot.parent;

        if (!parentNode) {
            // 根目录（无父目录），直接格式化
            treeStr += this.formatTree(this.currentRoot);
        } else {
            // 非根目录，显示父目录 + 同级节点
            treeStr += `父目录：${parentNode.fullPath}\n`;
            treeStr += "--------------------------------\n";

            const siblings = this.getSiblingNodes();
            const allSameLevelNodes = [this.currentRoot, ...siblings];

            // 按当前排序规则排序同层级节点
            if (this.sortConfig.enabled) {
                allSameLevelNodes.sort((a, b) => {
                    const compareResult = this.formatTree.compareNodes(a, b, this.sortConfig.field);
                    return this.sortConfig.direction === SortDirection.ASC ? compareResult : -compareResult;
                });
            }

            // 格式化所有同层级节点
            allSameLevelNodes.forEach((node, index) => {
                const isLast = index === allSameLevelNodes.length - 1;
                const isSibling = node.fullPath !== this.currentRoot.fullPath;
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
