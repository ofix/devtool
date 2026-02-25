import fs from 'fs/promises';
import path from 'path';

// 定义差异状态枚举
export const DiffStatus = Object.freeze({
    IDENTICAL: 0,
    LEFT_ONLY: 1,
    RIGHT_ONLY: 2,
    DIFFERENT: 3
});

// 空节点标识（对齐renderer格式）
export const EMPTY_NODE = Object.freeze({
    isEmptyNode: true,
    name: '',
    path: '',
    relativePath: '',
    isFolder: false,
    size: 0,
    mtime: 0,
    diffType: 'only',
    diffStatus: DiffStatus.IDENTICAL,
    children: [],
    level: 0,
    parentPath: ''
});

export class DirDiff {
    constructor() { }

    /**
     * 递归扫描目录生成树形结构（轻量版）
     */
    async scanDirRecursive(folderPath) {
        let dirCount = 0;
        let totalCount = 0;

        // 全局递增序号（初始值可自定义，从1开始最直观）
        let nodeSeq = 1;
        // 生成极简唯一ID的工具函数（序号+侧标识）
        const generateNodeId = (nodeSide) => {
            const id = `${nodeSide}_${nodeSeq}`;
            nodeSeq++; // 生成ID后序号自增，保证全局唯一
            return id;
        };


        const traverse = async (currentPath) => {
            let stats;
            try {
                // 跳过符号链接，避免路径错误
                stats = await fs.lstat(currentPath);
                if (stats.isSymbolicLink()) return null;
            } catch (err) {
                console.warn(`无法获取 ${currentPath} 的信息：${err.message}`);
                return null;
            }

            // 核心元信息：仅保留比对必需的字段
            const relativePath = path.relative(folderPath, currentPath) || '.';
            const normalId = generateNodeId('normal'); // 左节点ID（前缀left）
            const node = {
                id: normalId,
                name: path.basename(currentPath),
                path: currentPath,
                relativePath,
                isFolder: stats.isDirectory(),
                size: stats.isFile() ? stats.size : 0,
                mtime: stats.mtime.getTime(), // 时间戳（毫秒）
                diffStatus: DiffStatus.IDENTICAL,
                children: []
            };

            totalCount++;

            // 递归处理子目录（仅文件夹需要）
            if (node.isFolder) {
                dirCount++;
                try {
                    const entries = await fs.readdir(currentPath, { withFileTypes: true });
                    // 串行处理，避免并行IO压力
                    for (const entry of entries) {
                        const childNode = await traverse(path.join(currentPath, entry.name));
                        if (childNode) node.children.push(childNode);
                    }
                } catch (err) {
                    node.error = `无法访问子目录：${err.message}`;
                }
            }

            return node;
        };

        // 根目录合法性检查
        try {
            await fs.access(folderPath);
        } catch (err) {
            return {
                success: false,
                error: `根目录不存在或无访问权限：${err.message}`,
                fileTree: null,
                dirCount: 0,
                totalCount: 0
            };
        }

        const fileTree = await traverse(folderPath);
        if (!fileTree) {
            return {
                success: false,
                error: '根路径不是有效的目录或文件',
                fileTree: null,
                dirCount: 0,
                totalCount: 0
            };
        }

        return {
            success: true,
            fileTree: fileTree,
            dirCount,
            totalCount,
            rootPath: folderPath
        };
    }

    /**
     * 轻量版扁平Map生成（无哈希计算）
     */
    async scanDirToFlatMap(folderPath, ignorePatterns = []) {
        const fileMap = new Map();
        const ignoreRegexList = Array.isArray(ignorePatterns) ? ignorePatterns : [ignorePatterns];

        // 手动递归，完全控制路径
        const traverse = async (currentPath) => {
            try {
                const stats = await fs.lstat(currentPath);
                if (stats.isSymbolicLink()) return;

                // 跳过忽略的文件/目录
                const relativePath = path.relative(folderPath, currentPath);
                if (ignoreRegexList.some(pattern => currentPath.match(pattern))) return;

                // 仅保留基础元信息（无哈希）
                const meta = {
                    path: currentPath,
                    relativePath: relativePath || '.',
                    isFolder: stats.isDirectory(),
                    size: stats.isFile() ? stats.size : 0,
                    mtime: stats.mtime.getTime()
                };

                fileMap.set(meta.relativePath, meta);

                // 仅文件夹递归处理子项
                if (meta.isFolder) {
                    const entries = await fs.readdir(currentPath, { withFileTypes: true });
                    for (const entry of entries) {
                        await traverse(path.join(currentPath, entry.name));
                    }
                }
            } catch (err) {
                console.warn(`跳过无法访问的文件：${currentPath}`, err.message);
            }
        };

        await traverse(folderPath);
        return fileMap;
    }

    /**
     * 轻量比对逻辑（仅大小+时间戳）
     */
    compareFlatMaps(mapA, mapB) {
        const diff = {
            [DiffStatus.LEFT_ONLY]: [],
            [DiffStatus.RIGHT_ONLY]: [],
            [DiffStatus.DIFFERENT]: [],
            [DiffStatus.IDENTICAL]: []
        };

        // 遍历左侧所有路径
        for (const [relPath, metaA] of mapA.entries()) {
            if (!mapB.has(relPath)) {
                // 左侧有，右侧无
                diff[DiffStatus.LEFT_ONLY].push(metaA);
            } else {
                const metaB = mapB.get(relPath);
                // 文件夹直接标记为一致；文件对比大小+时间戳
                if (metaA.isFolder || metaB.isFolder) {
                    diff[DiffStatus.IDENTICAL].push(relPath);
                } else {
                    // 时间戳差异>1秒 或 大小不同 → 标记为不同
                    const isDifferent =
                        metaA.size !== metaB.size ||
                        Math.abs(metaA.mtime - metaB.mtime) > 1000;

                    if (isDifferent) {
                        diff[DiffStatus.DIFFERENT].push({ a: metaA, b: metaB });
                    } else {
                        diff[DiffStatus.IDENTICAL].push(relPath);
                    }
                }
            }
        }

        // 遍历右侧独有的路径
        for (const [relPath, metaB] of mapB.entries()) {
            if (!mapA.has(relPath)) {
                diff[DiffStatus.RIGHT_ONLY].push(metaB);
            }
        }

        return diff;
    }

    /**
     * 构建对称对比树（Beyond Compare风格）
     */
    buildSymmetricTrees(treeA, treeB, flatDiff, rootA, rootB) {
        // 全局递增序号（初始值可自定义，从1开始最直观）
        let nodeSeq = 1;
        // 生成极简唯一ID的工具函数（序号+侧标识）
        const generateNodeId = (nodeSide) => {
            const id = `${nodeSide}_${nodeSeq}`;
            nodeSeq++; // 生成ID后序号自增，保证全局唯一
            return id;
        };
        /**
      * 递归构建对称节点
      * @param {Object} nodeA 左节点
      * @param {Object} nodeB 右节点
      * @param {string} currentRelPath 相对路径（仅用于差异判断，不再用于ID生成）
      * @returns {Object} 对称节点
      */
        const buildSymmetricNode = (nodeA, nodeB, currentRelPath = '.') => {
            // 1. 为当前节点生成极简唯一ID（序号自动递增）
            const symNodeId = generateNodeId('sym'); // 对称节点自身ID（前缀sym）
            const leftNodeId = generateNodeId('left'); // 左节点ID（前缀left）
            const rightNodeId = generateNodeId('right'); // 右节点ID（前缀right）

            // 2. 空节点填充（仅补充ID，无长路径）
            const emptyNodeA = {
                ...EMPTY_NODE,
                relativePath: currentRelPath,
                id: leftNodeId // 左空节点用生成的唯一ID
            };
            const emptyNodeB = {
                ...EMPTY_NODE,
                relativePath: currentRelPath,
                id: rightNodeId // 右空节点用生成的唯一ID
            };

            // 3. 构建对称节点（核心：极简ID）
            const symmetricNode = {
                id: symNodeId, // 对称节点自身唯一ID
                left: nodeA ? {
                    ...nodeA,
                    id: leftNodeId // 左节点唯一ID
                } : emptyNodeA,
                right: nodeB ? {
                    ...nodeB,
                    id: rightNodeId // 右节点唯一ID
                } : emptyNodeB,
                children: []
            };

            // 4. 标记差异状态（逻辑不变，仅用relPath做差异判断）
            if (nodeA && !nodeB) {
                symmetricNode.left.diffStatus = DiffStatus.LEFT_ONLY;
                symmetricNode.right.diffStatus = DiffStatus.LEFT_ONLY;
                symmetricNode.left.diffType = 'only';
                symmetricNode.right.diffType = 'only';
            } else if (!nodeA && nodeB) {
                symmetricNode.left.diffStatus = DiffStatus.RIGHT_ONLY;
                symmetricNode.right.diffStatus = DiffStatus.RIGHT_ONLY;
                symmetricNode.left.diffType = 'only';
                symmetricNode.right.diffType = 'only';
            } else if (nodeA && nodeB) {
                const isDifferent = flatDiff[DiffStatus.DIFFERENT].some(
                    item => item.a?.relativePath === currentRelPath || item.b?.relativePath === currentRelPath
                );

                if (isDifferent) {
                    symmetricNode.left.diffStatus = DiffStatus.DIFFERENT;
                    symmetricNode.right.diffStatus = DiffStatus.DIFFERENT;
                    symmetricNode.left.diffType = 'different';
                    symmetricNode.right.diffType = 'different';
                } else {
                    symmetricNode.left.diffStatus = DiffStatus.IDENTICAL;
                    symmetricNode.right.diffStatus = DiffStatus.IDENTICAL;
                    symmetricNode.left.diffType = 'same';
                    symmetricNode.right.diffType = 'same';
                }
            }

            // 5. 合并左右子节点名称，递归构建子节点（序号自动递增）
            const allChildNames = new Set();
            if (nodeA?.children) nodeA.children.forEach(c => allChildNames.add(c.name));
            if (nodeB?.children) nodeB.children.forEach(c => allChildNames.add(c.name));

            Array.from(allChildNames).forEach(childName => {
                const childA = nodeA?.children?.find(c => c.name === childName) || null;
                const childB = nodeB?.children?.find(c => c.name === childName) || null;
                const childRelPath = currentRelPath === '.' ? childName : `${currentRelPath}/${childName}`;

                symmetricNode.children.push(buildSymmetricNode(childA, childB, childRelPath));
            });

            return symmetricNode;
        };

        // 重置序号（避免多次调用时序号累加）
        nodeSeq = 1;
        // 执行构建
        const symmetricRoot = buildSymmetricNode(treeA, treeB);
        return {
            symmetricTree: symmetricRoot,
            leftTree: this.extractSideTree(symmetricRoot, 'left'),
            rightTree: this.extractSideTree(symmetricRoot, 'right')
        };
    }

    /**
     * 提取单侧树（供UI渲染）
     */
    extractSideTree(symmetricNode, side) {
        const sideNode = { ...symmetricNode[side] };

        if (symmetricNode.children?.length) {
            sideNode.children = symmetricNode.children.map(child =>
                this.extractSideTree(child, side)
            );
            // 标记是否有子节点差异
            sideNode.hasDiff = sideNode.children.some(c =>
                c.diffStatus !== DiffStatus.IDENTICAL || c.children?.some(cc => cc.hasDiff)
            );
        } else {
            sideNode.children = [];
            sideNode.hasDiff = sideNode.diffStatus !== DiffStatus.IDENTICAL;
        }

        return sideNode;
    }

    /**
     * 核心入口：轻量文件夹对比
     */
    async compareFolders(folderA, folderB, ignorePatterns = [/\.DS_Store$/, /Thumbs\.db$/]) {
        // 并行扫描（无哈希，速度极快）
        const [mapA, mapB, treeAResult, treeBResult] = await Promise.all([
            this.scanDirToFlatMap(folderA, ignorePatterns),
            this.scanDirToFlatMap(folderB, ignorePatterns),
            this.scanDirRecursive(folderA),
            this.scanDirRecursive(folderB)
        ]);

        // 扫描失败处理
        if (!treeAResult.success || !treeBResult.success) {
            return {
                success: false,
                error: treeAResult.error || treeBResult.error,
                flatDiff: null,
                symmetricTree: null,
                leftTree: null,
                rightTree: null,
                stats: null
            };
        }

        // 生成差异 + 对称树
        const flatDiff = this.compareFlatMaps(mapA, mapB);
        const symmetricResult = this.buildSymmetricTrees(
            treeAResult.fileTree,
            treeBResult.fileTree,
            flatDiff,
            folderA,
            folderB
        );

        // 统计信息
        const stats = {
            leftOnlyCount: flatDiff[DiffStatus.LEFT_ONLY].length,
            rightOnlyCount: flatDiff[DiffStatus.RIGHT_ONLY].length,
            differentCount: flatDiff[DiffStatus.DIFFERENT].length,
            identicalCount: flatDiff[DiffStatus.IDENTICAL].length,
            totalCompared: flatDiff[DiffStatus.LEFT_ONLY].length +
                flatDiff[DiffStatus.RIGHT_ONLY].length +
                flatDiff[DiffStatus.DIFFERENT].length +
                flatDiff[DiffStatus.IDENTICAL].length
        };

        return {
            success: true,
            flatDiff,
            symmetricTree: symmetricResult.symmetricTree,
            leftTree: symmetricResult.leftTree,
            rightTree: symmetricResult.rightTree,
            stats,
            scanResultA: treeAResult,
            scanResultB: treeBResult
        };
    }
}