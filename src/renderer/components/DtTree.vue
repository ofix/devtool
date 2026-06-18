<template>
    <div class="dt-tree" ref="treeWrapper">
      <!-- 粘性滚动头部 -->
      <div 
        class="dt-tree-sticky-header" 
        v-show="stickyPath && stickyPath.length > 0"
        ref="stickyHeader"
      >
        <span class="sticky-path">
          <span 
            v-for="(part, index) in stickyPath" 
            :key="index"
            class="path-part"
          >
            <span v-if="index > 0" class="path-separator"> › </span>
            <span class="path-name">{{ part }}</span>
          </span>
        </span>
        <el-button 
          size="small" 
          text 
          @click.stop="clearSearch"
          v-if="searchKeyword"
          class="clear-search-btn"
        >
          ✕
        </el-button>
      </div>
  
      <!-- 搜索框 -->
      <div class="dt-tree-search" v-if="showSearch">
        <el-input
          ref="searchInput"
          v-model="searchKeyword"
          size="small"
          placeholder="筛选文件名..."
          prefix-icon="Search"
          clearable
          @input="handleSearch"
          @keydown.esc="clearSearch"
          @keydown.down.prevent="navigateSearchResults(1)"
          @keydown.up.prevent="navigateSearchResults(-1)"
        />
        <span class="search-result-count" v-if="searchKeyword">
          {{ searchResults.length }} 个结果
        </span>
      </div>
      <el-tree-v2
        ref="treeRef"
        :data="treeData"
        :props="treeProps"
        :height="treeHeight"
        :highlight-current="true"
        :current-node-key="currentKey"
        :default-expanded-keys="expandedKeys"
        @node-click="handleNodeClick"
        @current-change="handleCurrentChange"
        class="dt-tree-v2"
      >
        <template #default="{ node, data }">
          <div 
            class="dt-tree-node"
            :class="{
              'is-highlight': isHighlighted(data),
              'is-search-match': isSearchMatch(data),
              'is-search-active': searchKeyword && isSearchMatch(data)
            }"
            :data-key="data.id || data.key"
          >
            <span class="node-icon">
              {{ getNodeIcon(data) }}
            </span>
            <span class="node-label" v-html="highlightText(getNodeLabel(data))" />
            <span class="node-extra" v-if="getNodeExtra(data)">
              {{ getNodeExtra(data) }}
            </span>
          </div>
        </template>
      </el-tree-v2>
    </div>
  </template>
  
  <script>
  import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
  import { ElTreeV2 } from 'element-plus'
  
  export default {
    name: 'DtTree',
    components: { ElTreeV2 },
    props: {
      // 树数据
      data: {
        type: Array,
        required: true
      },
      // 节点配置
      props: {
        type: Object,
        default: () => ({
          label: 'label',
          children: 'children',
          key: 'id'
        })
      },
      // 当前选中的节点key
      currentKey: {
        type: [String, Number],
        default: null
      },
      // 展开的节点keys
      expandedKeys: {
        type: Array,
        default: () => []
      },
      // 树高度
      height: {
        type: Number,
        default: 400
      },
      // 是否显示搜索框
      showSearch: {
        type: Boolean,
        default: true
      },
      // 是否启用粘性滚动
      enableSticky: {
        type: Boolean,
        default: true
      }
    },
    emits: ['node-click', 'current-change', 'search', 'update:currentKey', 'update:expandedKeys'],
    
    setup(props, { emit, expose }) {
      const treeRef = ref(null)
      const treeWrapper = ref(null)
      const stickyHeader = ref(null)
      const searchInput = ref(null)
      
      // 搜索相关状态
      const searchKeyword = ref('')
      const searchResults = ref([])
      const searchResultIndex = ref(-1)
      const highlightedNodes = ref(new Set())
      
      // 粘性滚动状态
      const stickyPath = ref([])
      const isScrolling = ref(false)
      let scrollTimer = null
      
      // 树的高度（动态计算）
      const treeHeight = computed(() => {
        const wrapper = treeWrapper.value
        if (!wrapper) return props.height
        const searchHeight = props.showSearch ? 40 : 0
        const headerHeight = stickyPath.value.length > 0 ? 36 : 0
        return wrapper.clientHeight - searchHeight - headerHeight - 8
      })
      
      // 树数据（处理搜索高亮）
      const treeData = computed(() => {
        if (!searchKeyword.value) return props.data
        return filterTree(props.data, searchKeyword.value)
      })
      
      // 获取节点标签
      const getNodeLabel = (data) => {
        return data[props.props.label] || data.label || ''
      }
      
      // 获取节点图标
      const getNodeIcon = (data) => {
        const children = data[props.props.children]
        if (children && children.length > 0) return '📁'
        return '📄'
      }
      
      // 获取节点额外信息
      const getNodeExtra = (data) => {
        return data.extra || ''
      }
      
      // 判断节点是否高亮（当前选中）
      const isHighlighted = (data) => {
        const key = data[props.props.key] || data.id || data.key
        return key === props.currentKey
      }
      
      // 判断节点是否匹配搜索
      const isSearchMatch = (data) => {
        if (!searchKeyword.value) return false
        const key = data[props.props.key] || data.id || data.key
        return highlightedNodes.value.has(key)
      }
      
      // 高亮搜索文本
      const highlightText = (text) => {
        if (!searchKeyword.value || !text) return text
        const regex = new RegExp(escapeRegExp(searchKeyword.value), 'gi')
        return text.replace(regex, (match) => `<span class="search-highlight">${match}</span>`)
      }
      
      // 转义正则表达式特殊字符
      const escapeRegExp = (string) => {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      }
      
      // 过滤树（保留匹配的节点及其父节点）
      const filterTree = (nodes, keyword) => {
        const result = []
        highlightedNodes.value = new Set()
        
        for (const node of nodes) {
          const label = getNodeLabel(node)
          const children = node[props.props.children]
          const isMatch = label.toLowerCase().includes(keyword.toLowerCase())
          
          let filteredChildren = []
          if (children && children.length > 0) {
            filteredChildren = filterTree(children, keyword)
          }
          
          // 如果当前节点匹配或有匹配的子节点，保留
          if (isMatch || filteredChildren.length > 0) {
            const newNode = { ...node }
            if (isMatch) {
              const key = newNode[props.props.key] || newNode.id || newNode.key
              highlightedNodes.value.add(key)
            }
            if (filteredChildren.length > 0) {
              newNode[props.props.children] = filteredChildren
            }
            result.push(newNode)
          }
        }
        
        return result
      }
      
      // 搜索处理
      const handleSearch = (keyword) => {
        searchKeyword.value = keyword
        searchResultIndex.value = -1
        
        if (keyword) {
          // 展开所有匹配的父级节点
          expandAllParents()
          // 高亮第一个匹配结果
          nextTick(() => {
            scrollToFirstSearchResult()
          })
        }
        
        emit('search', keyword)
      }
      
      // 展开所有匹配节点的父级
      const expandAllParents = () => {
        // 这里需要根据实际的数据结构展开父节点
        // el-tree-v2 的展开需要通过 expandedKeys 控制
        const keys = getAllMatchedParentKeys(props.data, searchKeyword.value)
        emit('update:expandedKeys', keys)
      }
      
      const getAllMatchedParentKeys = (nodes, keyword, parents = []) => {
        let keys = []
        for (const node of nodes) {
          const label = getNodeLabel(node)
          const children = node[props.props.children]
          const isMatch = label.toLowerCase().includes(keyword.toLowerCase())
          
          if (isMatch) {
            // 添加所有父级节点的key
            for (const parent of parents) {
              const key = parent[props.props.key] || parent.id || parent.key
              if (key) keys.push(key)
            }
          }
          
          if (children && children.length > 0) {
            const childKeys = getAllMatchedParentKeys(children, keyword, [...parents, node])
            keys = [...keys, ...childKeys]
          }
        }
        return [...new Set(keys)]
      }
      
      // 滚动到第一个搜索结果
      const scrollToFirstSearchResult = () => {
        if (searchResults.value.length === 0) return
        const firstResult = searchResults.value[0]
        const key = firstResult[props.props.key] || firstResult.id || firstResult.key
        if (key && treeRef.value) {
          treeRef.value.scrollToNode(key, 'center')
          searchResultIndex.value = 0
        }
      }
      
      // 导航搜索结果
      const navigateSearchResults = (direction) => {
        if (searchResults.value.length === 0) return
        
        const total = searchResults.value.length
        searchResultIndex.value = (searchResultIndex.value + direction + total) % total
        
        const result = searchResults.value[searchResultIndex.value]
        const key = result[props.props.key] || result.id || result.key
        if (key && treeRef.value) {
          treeRef.value.scrollToNode(key, 'center')
          // 高亮该节点
          emit('update:currentKey', key)
        }
      }
      
      // 清除搜索
      const clearSearch = () => {
        searchKeyword.value = ''
        searchResults.value = []
        searchResultIndex.value = -1
        highlightedNodes.value = new Set()
        emit('search', '')
      }
      
      // 处理节点点击
      const handleNodeClick = (data, node, component) => {
        const key = data[props.props.key] || data.id || data.key
        emit('update:currentKey', key)
        emit('node-click', data, node, component)
      }
      
      // 处理当前节点变化
      const handleCurrentChange = (data, node) => {
        const key = data ? (data[props.props.key] || data.id || data.key) : null
        emit('current-change', data, node)
      }
      
      // 粘性滚动逻辑
      const handleScroll = (event) => {
        if (!props.enableSticky) return
        
        const container = event.target
        if (!container) return
        
        // 节流处理
        if (!isScrolling.value) {
          isScrolling.value = true
          window.requestAnimationFrame(() => {
            updateStickyHeader(container)
            isScrolling.value = false
          })
        }
      }
      
      const updateStickyHeader = (container) => {
        // 获取容器中的所有可见节点
        const visibleNodes = container.querySelectorAll('.dt-tree-node')
        let currentPath = []
        
        for (const nodeEl of visibleNodes) {
          const rect = nodeEl.getBoundingClientRect()
          const containerRect = container.getBoundingClientRect()
          
          // 检查节点是否在可视区域内
          if (rect.top >= containerRect.top && rect.top < containerRect.bottom) {
            // 获取节点的路径数据
            const key = nodeEl.dataset.key
            if (key) {
              const data = findNodeByKey(props.data, key)
              if (data) {
                currentPath = getNodePath(data)
                break
              }
            }
          }
        }
        
        stickyPath.value = currentPath
      }
      
      // 根据key查找节点
      const findNodeByKey = (nodes, key) => {
        for (const node of nodes) {
          const nodeKey = node[props.props.key] || node.id || node.key
          if (nodeKey === key) return node
          
          const children = node[props.props.children]
          if (children && children.length > 0) {
            const result = findNodeByKey(children, key)
            if (result) return result
          }
        }
        return null
      }
      
      // 获取节点的完整路径
      const getNodePath = (node) => {
        const path = []
        let current = node
        
        while (current) {
          path.unshift(getNodeLabel(current))
          current = current._parent || null
        }
        
        return path
      }
      
      // 滚动到指定节点
      const scrollToNode = (key, align = 'center') => {
        if (treeRef.value && key) {
          treeRef.value.scrollToNode(key, align)
        }
      }
      
      // 设置当前高亮节点
      const setCurrentKey = (key) => {
        if (treeRef.value && key) {
          treeRef.value.setCurrentKey(key)
          scrollToNode(key, 'center')
        }
      }
      
      // 获取搜索框焦点
      const focusSearch = () => {
        if (searchInput.value) {
          searchInput.value.focus()
        }
      }
      
      // 生命周期钩子
      onMounted(() => {
        // 监听树的滚动事件
        const treeEl = treeWrapper.value?.querySelector('.el-tree-v2__inner')
        if (treeEl) {
          treeEl.addEventListener('scroll', handleScroll)
        }
        
        // 键盘快捷键：Ctrl+F / Cmd+F 聚焦搜索
        const handleKeydown = (event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
            event.preventDefault()
            focusSearch()
          }
        }
        document.addEventListener('keydown', handleKeydown)
        
        // 清理函数
        onUnmounted(() => {
          if (treeEl) {
            treeEl.removeEventListener('scroll', handleScroll)
          }
          document.removeEventListener('keydown', handleKeydown)
        })
      })
      
      // 暴露方法
      expose({
        scrollToNode,
        setCurrentKey,
        focusSearch,
        clearSearch,
        treeRef
      })
      
      return {
        treeRef,
        treeWrapper,
        stickyHeader,
        searchInput,
        searchKeyword,
        searchResults,
        searchResultIndex,
        highlightedNodes,
        stickyPath,
        isScrolling,
        treeHeight,
        treeData,
        getNodeLabel,
        getNodeIcon,
        getNodeExtra,
        isHighlighted,
        isSearchMatch,
        highlightText,
        handleSearch,
        navigateSearchResults,
        clearSearch,
        handleNodeClick,
        handleCurrentChange,
        scrollToNode,
        setCurrentKey,
        focusSearch
      }
    }
  }
  </script>
  
  <style scoped>
  .dt-tree {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--el-bg-color);
    border-radius: 4px;
    overflow: hidden;
  }
  
  /* 粘性滚动头部 */
  .dt-tree-sticky-header {
    position: sticky;
    top: 0;
    z-index: 10;
    padding: 6px 12px;
    background: var(--el-bg-color-page);
    border-bottom: 1px solid var(--el-border-color-light);
    font-size: 13px;
    color: var(--el-text-color-secondary);
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 36px;
    flex-shrink: 0;
  }
  
  .sticky-path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
  
  .path-part {
    display: inline;
  }
  
  .path-separator {
    color: var(--el-text-color-placeholder);
    margin: 0 2px;
  }
  
  .path-name {
    color: var(--el-text-color-primary);
    font-weight: 500;
  }
  
  .path-name:last-child {
    color: var(--el-color-primary);
  }
  
  .clear-search-btn {
    flex-shrink: 0;
    margin-left: 8px;
  }
  
  /* 搜索框 */
  .dt-tree-search {
    padding: 8px 12px;
    border-bottom: 1px solid var(--el-border-color-light);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--el-bg-color);
  }
  
  .dt-tree-search .el-input {
    flex: 1;
    min-width: 0;
  }
  
  .search-result-count {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    white-space: nowrap;
    flex-shrink: 0;
  }
  
  /* 树节点样式 */
  .dt-tree-node {
    display: flex;
    align-items: center;
    padding: 3px 12px;
    cursor: pointer;
    transition: background-color 0.15s ease;
    font-size: 13px;
    line-height: 1.6;
    min-height: 28px;
    border-radius: 2px;
    position: relative;
  }
  
  .dt-tree-node:hover {
    background-color: var(--el-fill-color-light);
  }
  
  .dt-tree-node.is-highlight {
    background-color: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
  }
  
  .dt-tree-node.is-highlight:hover {
    background-color: var(--el-color-primary-light-8);
  }
  
  .dt-tree-node.is-search-match {
    background-color: var(--el-color-warning-light-9);
  }
  
  .dt-tree-node.is-search-match.is-highlight {
    background-color: var(--el-color-primary-light-8);
  }
  
  .node-icon {
    margin-right: 6px;
    font-size: 14px;
    flex-shrink: 0;
  }
  
  .node-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .node-extra {
    margin-left: 8px;
    font-size: 11px;
    color: var(--el-text-color-placeholder);
    flex-shrink: 0;
  }
  
  /* 搜索高亮 */
  .search-highlight {
    background-color: var(--el-color-warning-light-5);
    padding: 0 2px;
    border-radius: 2px;
    font-weight: 500;
  }
  
  /* el-tree-v2 样式覆盖 */
  .dt-tree-v2 {
    flex: 1;
    overflow: hidden;
  }
  
  .dt-tree-v2 :deep(.el-tree-v2__inner) {
    padding: 4px 0;
  }
  
  .dt-tree-v2 :deep(.el-tree-v2__node) {
    padding: 0;
  }
  
  .dt-tree-v2 :deep(.el-tree-v2__node-content) {
    padding: 0;
  }
  
  /* 滚动条样式 */
  .dt-tree-v2 :deep(.el-tree-v2__inner::-webkit-scrollbar) {
    width: 6px;
    height: 6px;
  }
  
  .dt-tree-v2 :deep(.el-tree-v2__inner::-webkit-scrollbar-track) {
    background: transparent;
  }
  
  .dt-tree-v2 :deep(.el-tree-v2__inner::-webkit-scrollbar-thumb) {
    background: var(--el-border-color-darker);
    border-radius: 3px;
  }
  
  .dt-tree-v2 :deep(.el-tree-v2__inner::-webkit-scrollbar-thumb:hover) {
    background: var(--el-border-color);
  }
  </style>