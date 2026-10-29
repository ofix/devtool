<template>
    <div class="preview">
      <div class="header">
        <span class="title">预览：{{ store.selectedNode?.name || '未选择节点' }}</span>
        <span class="meta" v-if="ds">{{ ds.count }} 行 · {{ ds.columns?.length ?? 0 }} 列</span>
        <div class="spacer" />
        <el-button size="small" :disabled="!store.selectedId" @click="refresh">刷新</el-button>
      </div>
      <div class="body">
        <el-empty v-if="!ds" description="选择一个节点查看数据" />
        <el-table v-else :data="rows" height="100%" size="small" border>
          <el-table-column v-for="c in ds.columns" :key="c" :prop="c" :label="c" min-width="120" show-overflow-tooltip />
        </el-table>
      </div>
    </div>
  </template>
  
  <script setup>
  import { computed } from 'vue'
  import { useDataCleanStore } from '@/stores/StoreDataClean'
  import { runNode } from '../Engine'
  
  const store = useDataCleanStore()
  const ds = computed(() => store.selectedDataset)
  const rows = computed(() => (ds.value?.rows || []).slice(0, 50))
  
  function refresh() {
    if (!store.selectedId) return
    try { runNode(store, store.selectedId) } catch (e) { /* 预览失败静默 */ }
  }
  </script>
  
  <style scoped>
  .preview { flex: 0 0 42vh; display: flex; flex-direction: column; border-bottom: 1px solid #e4e7ed; background: #fafafa; }
  .header { display: flex; align-items: center; gap: 12px; padding: 6px 12px; background: #fff; border-bottom: 1px solid #ebeef5; }
  .title { font-weight: 600; }
  .meta { color: #909399; font-size: 12px; }
  .spacer { flex: 1; }
  .body { flex: 1; overflow: auto; padding: 8px; }
  </style>