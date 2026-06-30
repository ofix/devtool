// ============ 创建统一的树服务 ============

class FileTreeService {
    /**
     * @param {Object} options - 配置
     */
    constructor(options = {}) {
        this.config = {
            maxDepth: options.maxDepth || 5,
            defaultDepth: options.defaultDepth || 2,
            autoSaveState: options.autoSaveState !== undefined ? options.autoSaveState : true,
            storageKey: options.storageKey || 'filetree_state'
        }

        // ========== UI 状态 ==========
        this.expandedKeys = new Set()
        this.loadingKeys = new Set()
        this.selectedKey = null
        
        // ========== 数据状态 ==========
        this.treeData = []
        this.nodeMap = new Map()
        this.rootPath = source.getRootPath()
        this.isLoading = false
        
        // ========== 缓存 ==========
        this.loadedDirs = new Map()
        
        // ========== 初始化 ==========
        if (this.config.autoSaveState) {
            this.restoreState()
        }
    }

    /**
     * 加载目录
     */
    async loadDirectory(dirPath, options = {}) {
        const {
            depth = this.config.defaultDepth,
            recursive = false,
            forceRefresh = false
        } = options

        const normalizedPath = this.source.normalizePath(dirPath)

        if (this.loadingKeys.has(normalizedPath)) {
            return { success: false, loading: true }
        }

        if (!forceRefresh && this.loadedDirs.has(normalizedPath)) {
            const cached = this.loadedDirs.get(normalizedPath)
            if (cached.depth >= depth) {
                return {
                    success: true,
                    data: cached.data,
                    fromCache: true
                }
            }
        }

        this.loadingKeys.add(normalizedPath)

        try {
            // 使用数据源读取目录
            const entries = await this.source.readDirectory(normalizedPath)
            
            // 构建树数据
            const treeData = await this._buildTreeData(normalizedPath, entries, depth, recursive)
            
            // 缓存
            this.loadedDirs.set(normalizedPath, {
                data: treeData,
                depth: depth,
                entries: entries,
                timestamp: Date.now()
            })

            // 更新树
            this._updateTree(normalizedPath, treeData)

            if (!this.rootPath || normalizedPath === this.rootPath) {
                this.treeData = treeData
                this.rootPath = normalizedPath
            }

            // 自动展开根
            this.expandKey(normalizedPath)

            return {
                success: true,
                data: treeData,
                stats: {
                    total: entries.length,
                    dirs: entries.filter(e => e.isDirectory).length,
                    files: entries.filter(e => e.isFile).length
                }
            }
        } catch (error) {
            console.error(`加载目录失败: ${normalizedPath}`, error)
            return { success: false, error: error.message }
        } finally {
            this.loadingKeys.delete(normalizedPath)
        }
    }

    /**
     * 构建树数据（适配 el-tree-v2）
     * @private
     */
    async _buildTreeData(dirPath, entries, depth, recursive, currentDepth = 0) {
        const node = {
            id: dirPath,
            label: this._getBaseName(dirPath),
            path: dirPath,
            type: 'directory',
            isLeaf: false,
            children: [],
            _isPartialLoaded: false,
            _hasChildren: false
        }

        for (const entry of entries) {
            const child = {
                id: entry.path,
                label: entry.name,
                path: entry.path,
                type: entry.isDirectory ? 'directory' : 'file',
                size: entry.size,
                mtime: entry.mtime,
                mode: entry.mode,
                isLeaf: !entry.isDirectory,
                children: [],
                _isPartialLoaded: false,
                _hasChildren: false
            }

            if (entry.isDirectory) {
                // 递归加载子目录
                if (recursive && currentDepth < depth - 1) {
                    const subEntries = await this.source.readDirectory(entry.path)
                    const subTree = await this._buildTreeData(
                        entry.path,
                        subEntries,
                        depth,
                        recursive,
                        currentDepth + 1
                    )
                    child.children = subTree.children || []
                    child._stats = subTree._stats
                } else if (currentDepth < depth - 1) {
                    // 未加载但可展开，添加占位
                    child._hasChildren = true
                    child._isPartialLoaded = true
                    child.children = [{
                        id: `${entry.path}/__placeholder__`,
                        label: '加载中...',
                        path: `${entry.path}/__placeholder__`,
                        type: 'placeholder',
                        isLeaf: true,
                        disabled: true
                    }]
                } else {
                    // 达到最大深度
                    child._hasChildren = true
                    child._isPartialLoaded = true
                }
            }

            node.children.push(child)
        }

        return node
    }

    // ========== 树操作方法 ==========
    async expandDirectory(dirPath, depth = 1) {
        this.expandKey(dirPath)
        
        if (this.loadedDirs.has(dirPath)) {
            return { success: true, fromCache: true }
        }
        
        const result = await this.loadDirectory(dirPath, {
            depth,
            recursive: false,
            forceRefresh: false
        })
        
        if (result.success && this.config.autoSaveState) {
            this.saveState()
        }
        
        return result
    }

    async loadMore(dirPath) {
        const cached = this.loadedDirs.get(dirPath)
        const currentDepth = cached?.depth || 0
        const nextDepth = currentDepth + 1
        
        if (nextDepth > this.config.maxDepth) {
            return { success: false, reachedMaxDepth: true }
        }
        
        return await this.loadDirectory(dirPath, {
            depth: nextDepth,
            recursive: false
        })
    }

    // ========== 状态管理 ==========

    expandKey(key) {
        this.expandedKeys.add(key)
    }

    collapseKey(key) {
        this.expandedKeys.delete(key)
    }

    getTreeData() {
        return this.treeData
    }

    getExpandedKeys() {
        return Array.from(this.expandedKeys)
    }

    isLoadingKey(key) {
        return this.loadingKeys.has(key)
    }

    saveState() {
        try {
            const state = {
                expandedKeys: Array.from(this.expandedKeys),
                selectedKey: this.selectedKey,
                rootPath: this.rootPath,
                timestamp: Date.now()
            }
            const key = `${this.config.storageKey}_${this.source.getSourceType()}_${this._hashPath(this.rootPath)}`
            localStorage.setItem(key, JSON.stringify(state))
        } catch (error) {
            console.warn('保存状态失败:', error)
        }
    }

    restoreState() {
        try {
            const key = `${this.config.storageKey}_${this.source.getSourceType()}_${this._hashPath(this.rootPath)}`
            const data = localStorage.getItem(key)
            if (data) {
                const state = JSON.parse(data)
                this.expandedKeys = new Set(state.expandedKeys || [])
                this.selectedKey = state.selectedKey || null
                return state
            }
        } catch (error) {
            console.warn('恢复状态失败:', error)
        }
        return null
    }

    // ========== 辅助方法 ==========
    _updateTree(dirPath, treeData) {
        if (!this.treeData || this.treeData.length === 0) {
            this.treeData = [treeData]
            return
        }

        const updateNode = (nodes) => {
            for (let i = 0; i < nodes.length; i++) {
                if (nodes[i].path === dirPath) {
                    nodes[i] = treeData
                    return true
                }
                if (nodes[i].children && nodes[i].children.length > 0) {
                    if (updateNode(nodes[i].children)) {
                        return true
                    }
                }
            }
            return false
        }

        if (!updateNode(this.treeData)) {
            this.treeData.push(treeData)
        }
    }

    _getBaseName(path) {
        const parts = path.split('/').filter(p => p)
        return parts[parts.length - 1] || path
    }

    _getParentPath(path) {
        const parts = path.split('/').filter(p => p)
        if (parts.length <= 1) return '/'
        parts.pop()
        return '/' + parts.join('/')
    }

    _hashPath(path) {
        let hash = 0
        for (let i = 0; i < path.length; i++) {
            const char = path.charCodeAt(i)
            hash = ((hash << 5) - hash) + char
            hash = hash & hash
        }
        return hash.toString(36)
    }

    destroy() {
        if (this.config.autoSaveState) {
            this.saveState()
        }
        this.loadedDirs.clear()
        this.nodeMap.clear()
        this.expandedKeys.clear()
        this.loadingKeys.clear()
    }
}

export default FileTreeService