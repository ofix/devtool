<template>
    <div class="file-tree">
      <div class="toolbar">
        <el-input
          v-model="filterText"
          placeholder="搜索文件..."
          prefix-icon="Search"
          size="small"
          clearable
          @input="onFilter"
        />
        <el-button-group>
          <el-button size="small" :icon="Refresh" @click="refresh" :loading="isLoading" />
          <el-button size="small" :icon="Expand" @click="expandAll" />
          <el-button size="small" :icon="Fold" @click="collapseAll" />
        </el-button-group>
      </div>
  
      <div class="source-info">
        <el-tag size="small" type="info">
          {{ sourceType }}
        </el-tag>
        <span class="root-path">{{ rootPathDisplay }}</span>
      </div>
  
      <el-tree-v2
        ref="treeRef"
        :data="treeData"
        :props="treeProps"
        :height="treeHeight"
        :width="treeWidth"
        :expand-on-click-node="false"
        :default-expanded-keys="expandedKeys"
        :highlight-current="true"
        :filter-node-method="filterNode"
        node-key="id"
        @node-click="onNodeClick"
        @node-expand="onNodeExpand"
        @node-collapse="onNodeCollapse"
      >
        <template #default="{ node, data }">
          <div 
            class="custom-tree-node"
            :class="{
              'is-loading': isLoadingKey(data.path),
              'is-selected': selectedKey === data.path,
              'is-partial': data._isPartialLoaded,
              'is-placeholder': data.type === 'placeholder'
            }"
            @contextmenu.prevent="onContextMenu($event, data)"
          >
            <el-icon class="node-icon" :class="{ 'is-directory': data.type === 'directory' }">
              <component :is="getNodeIcon(data)" />
            </el-icon>
            <span class="node-label">{{ data.label }}</span>
            <span v-if="data.type === 'file' && data.size" class="node-size">
              {{ formatSize(data.size) }}
            </span>
            <el-tag v-if="data._isPartialLoaded" size="small" type="info" class="node-tag">
              部分加载
            </el-tag>
            <el-icon v-if="isLoadingKey(data.path)" class="loading-icon">
              <Loading />
            </el-icon>
            <el-button
              v-if="data._isPartialLoaded && !isLoadingKey(data.path)"
              size="small"
              text
              type="primary"
              class="load-more-btn"
              @click.stop="loadMore(data)"
            >
              加载更多
            </el-button>
          </div>
        </template>
      </el-tree-v2>
    </div>
  </template>
  
  <script setup>
  import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
  import { ElMessage } from 'element-plus'
  import {
    Refresh,
    Expand,
    Fold,
    Loading,
    Folder,
    FolderOpened,
    Document
  } from '@element-plus/icons-vue'
  import FileTreeService from '@/services/FileTreeService'
  
  // ========== Props ==========
  const props = defineProps({
    source: {
      type: Object,
      required: true,
      validator: (value) => {
        // 验证是否实现了 IFileSource 接口
        return value && typeof value.readDirectory === 'function'
      }
    },
    rootPath: {
      type: String,
      required: true
    },
    initialDepth: {
      type: Number,
      default: 2
    },
    height: {
      type: Number,
      default: 600
    },
    width: {
      type: String,
      default: '100%'
    }
  })
  
  // ========== Emits ==========
  const emit = defineEmits([
    'file-click',
    'file-open',
    'node-action',
    'load-complete'
  ])
  
  // ========== 创建服务 ==========
  const service = new FileTreeService(props.source, {
    defaultDepth: props.initialDepth,
    autoSaveState: true,
    storageKey: 'filetree'
  })
  
  // ========== 响应式状态 ==========
  const treeRef = ref(null)
  const treeData = ref([])
  const expandedKeys = ref([])
  const filterText = ref('')
  const selectedKey = ref(null)
  const isLoading = ref(false)
  
  // ========== 计算属性 ==========
  const sourceType = computed(() => props.source.getSourceType?.() || 'unknown')
  const rootPathDisplay = computed(() => {
    const path = props.source.getRootPath?.() || props.rootPath
    return path.length > 50 ? '...' + path.slice(-47) : path
  })
  
  // ========== 树配置 ==========
  const treeProps = {
    children: 'children',
    label: 'label',
    value: 'id',
    isLeaf: (data) => data.isLeaf || data.type === 'file'
  }
  
  // ========== 方法 ==========
  
  async function loadTree(recursive = false) {
    isLoading.value = true
    
    try {
      const result = await service.loadDirectory(props.rootPath, {
        depth: props.initialDepth,
        recursive: recursive,
        forceRefresh: true
      })
  
      if (result.success) {
        treeData.value = service.getTreeData()
        expandedKeys.value = service.getExpandedKeys()
        emit('load-complete', result)
      } else {
        ElMessage.error(`加载失败: ${result.error}`)
      }
    } catch (error) {
      console.error('加载树失败:', error)
      ElMessage.error('加载树失败')
    } finally {
      isLoading.value = false
    }
  }
  
  async function onNodeClick(data, node) {
    if (data.type === 'placeholder') {
      await loadMore(data)
      return
    }
  
    if (data.type === 'directory') {
      const isExpanded = service.isKeyExpanded(data.path)
      if (isExpanded) {
        service.collapseKey(data.path)
        expandedKeys.value = service.getExpandedKeys()
      } else {
        await onNodeExpand(data, node)
      }
    } else if (data.type === 'file') {
      selectedKey.value = data.path
      service.selectedKey = data.path
      emit('file-click', data)
      
      const result = await service.readFile(data.path)
      if (result.success) {
        emit('file-open', {
          ...data,
          content: result.content
        })
      }
    }
  }
  
  async function onNodeExpand(data, node) {
    if (data.type !== 'directory') return
  
    try {
      const result = await service.expandDirectory(data.path)
      if (result.success) {
        treeData.value = service.getTreeData()
        expandedKeys.value = service.getExpandedKeys()
      }
    } catch (error) {
      console.error('展开节点失败:', error)
      ElMessage.error('加载子目录失败')
    }
  }
  
  function onNodeCollapse(data, node) {
    if (data.type !== 'directory') return
    service.collapseKey(data.path)
    expandedKeys.value = service.getExpandedKeys()
    service.saveState()
  }
  
  async function loadMore(data) {
    if (data.type === 'placeholder') {
      const realPath = data.path.replace('/__placeholder__', '')
      data = service.findNodeByPath(realPath) || data
    }
  
    const result = await service.loadMore(data.path)
    if (result.success) {
      treeData.value = service.getTreeData()
      expandedKeys.value = service.getExpandedKeys()
    } else if (result.reachedMaxDepth) {
      ElMessage.warning('已达到最大加载深度')
    }
  }
  
  async function refresh() {
    await loadTree(false)
  }
  
  function expandAll() {
    const getAllDirectories = (nodes) => {
      const dirs = []
      for (const node of nodes) {
        if (node.type === 'directory') {
          dirs.push(node.path)
          if (node.children) {
            dirs.push(...getAllDirectories(node.children))
          }
        }
      }
      return dirs
    }
  
    const dirs = getAllDirectories(treeData.value)
    for (const dirPath of dirs) {
      service.expandKey(dirPath)
    }
    expandedKeys.value = service.getExpandedKeys()
    service.saveState()
  }
  
  function collapseAll() {
    service.expandedKeys.clear()
    expandedKeys.value = []
    service.saveState()
  }
  
  function onFilter(value) {
    if (!treeRef.value) return
    treeRef.value.filter(value)
  }
  
  function filterNode(value, data) {
    if (!value) return true
    return data.label.toLowerCase().includes(value.toLowerCase())
  }
  
  function getNodeIcon(data) {
    if (data.type === 'directory') {
      return service.isKeyExpanded(data.path) ? FolderOpened : Folder
    }
    if (data.type === 'placeholder') {
      return Loading
    }
    return Document
  }
  
  function formatSize(bytes) {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
  
  function isLoadingKey(path) {
    return service.isLoadingKey(path)
  }
  
  function onContextMenu(event, data) {
    emit('node-action', { action: 'contextmenu', data, event })
  }
  
  // ========== 暴露方法 ==========
  defineExpose({
    refresh,
    loadFullTree: () => loadTree(true),
    expandAll,
    collapseAll,
    service,
    getTreeData: () => service.getTreeData()
  })
  
  // ========== 生命周期 ==========
  onMounted(() => {
    loadTree(false)
  })
  
  onUnmounted(() => {
    service.destroy()
  })
  
  watch(() => props.rootPath, () => {
    loadTree(false)
  })
  </script>
  
  <style scoped>
  /* 样式与之前相同 */
  </style>