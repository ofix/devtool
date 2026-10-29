<template>
    <div class="toolbar">
      <el-button size="small" @click="importFile('csv')">导入 CSV</el-button>
      <el-button size="small" @click="importFile('json')">导入 JSON</el-button>
      <el-divider direction="vertical" />
      <el-button v-for="s in STEP_TYPES" :key="s.type" size="small" @click="store.addTransformNode(s.type)">
        {{ s.icon }} {{ s.label }}
      </el-button>
      <el-divider direction="vertical" />
      <el-button size="small" @click="store.addOutputNode()">＋ 输出</el-button>
      <div class="spacer" />
      <el-button type="primary" size="small" :loading="store.running" @click="onRun">运行</el-button>
    </div>
  </template>
  
  <script setup>
  import { useDataCleanStore } from '@/stores/StoreDataClean'
  import { STEP_TYPES } from '../Steps'
  import { runAll, runNode } from '../Engine'
  import { ElMessage } from 'element-plus'
  
  const store = useDataCleanStore()
  
  function importFile(kind) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = kind === 'csv' ? '.csv' : '.json'
    input.onchange = async () => {
      const file = input.files[0]
      if (!file) return
      const text = await file.text()
      try {
        let rows = [], columns = []
        if (kind === 'csv') {
          const lines = text.split(/\r?\n/).filter(Boolean)
          columns = lines[0].split(',').map(s => s.trim())
          rows = lines.slice(1).map(line => {
            const cells = line.split(',')
            return Object.fromEntries(columns.map((c, i) => [c, cells[i] ?? '']))
          })
        } else {
          const data = JSON.parse(text)
          rows = Array.isArray(data) ? data : [data]
          columns = rows[0] ? Object.keys(rows[0]) : []
        }
        store.addInputNode(file.name, rows, columns)
        ElMessage.success(`已导入 ${file.name}：${rows.length} 行`)
      } catch (e) { ElMessage.error(`解析失败：${e.message}`) }
    }
    input.click()
  }
  
  function onRun() {
    store.running = true
    try {
      runAll(store)
      ElMessage.success('运行完成')
      // 预览当前选中节点
      if (store.selectedId) runNode(store, store.selectedId)
    } catch (e) {
      ElMessage.error(`运行失败：${e.message}`)
    } finally { store.running = false }
  }
  </script>
  
  <style scoped>
  .toolbar { display: flex; align-items: center; gap: 4px; padding: 8px 12px; border-bottom: 1px solid #e4e7ed; background: #fff; }
  .spacer { flex: 1; }
  </style>