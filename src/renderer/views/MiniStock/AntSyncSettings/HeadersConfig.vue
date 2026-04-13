<template>
    <el-card class="config-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>📨 HTTP Headers</span>
          <div class="header-actions">
            <el-button link type="primary" @click="expanded = !expanded">
              {{ expanded ? '收起' : '展开' }}
            </el-button>
          </div>
        </div>
      </template>
      <el-collapse-transition>
        <div v-show="expanded">
          <div class="toolbar">
            <el-button type="primary" size="small" @click="openPasteDialog">
              <el-icon><DocumentCopy /></el-icon>
              从浏览器粘贴
            </el-button>
            <el-button size="small" @click="handleExport">
              <el-icon><Download /></el-icon>
              导出
            </el-button>
            <el-button size="small" @click="handleAdd">
              <el-icon><Plus /></el-icon>
              添加
            </el-button>
          </div>
  
          <div class="quick-add">
            <span class="quick-label">快速添加：</span>
            <el-button size="small" text @click="quickAdd('User-Agent')">UA</el-button>
            <el-button size="small" text @click="quickAdd('Referer')">Referer</el-button>
            <el-button size="small" text @click="quickAdd('Cookie')">Cookie</el-button>
            <el-button size="small" text @click="quickAdd('Accept')">Accept</el-button>
            <el-button size="small" text @click="quickAdd('Accept-Language')">Accept-Language</el-button>
          </div>
  
          <el-table :data="headersList" stripe size="small" @selection-change="handleSelectionChange">
            <el-table-column type="selection" width="45" />
            <el-table-column label="状态" width="70" align="center">
              <template #default="{ row }">
                <el-switch v-model="row.enabled" size="small" @change="emitChange" />
              </template>
            </el-table-column>
            <el-table-column prop="name" label="Header名称" min-width="150">
              <template #default="{ row }">
                <el-tag size="small" type="info">{{ row.name }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="value" label="Header值" min-width="300" show-overflow-tooltip />
            <el-table-column prop="desc" label="描述" min-width="120" show-overflow-tooltip />
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="editHeader(row)">编辑</el-button>
                <el-button link type="danger" size="small" @click="deleteHeader(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
  
          <div class="batch-actions" v-if="selectedHeaders.length > 0">
            <span>已选择 {{ selectedHeaders.length }} 项</span>
            <el-button size="small" @click="batchEnable">启用</el-button>
            <el-button size="small" @click="batchDisable">禁用</el-button>
            <el-button size="small" type="danger" @click="batchDelete">删除</el-button>
          </div>
        </div>
      </el-collapse-transition>
  
      <!-- 编辑弹窗 -->
      <el-dialog v-model="editDialogVisible" :title="editMode === 'add' ? '添加 Header' : '编辑 Header'" width="600px">
        <el-form :model="editingHeader" label-width="100px">
          <el-form-item label="状态">
            <el-switch v-model="editingHeader.enabled" />
          </el-form-item>
          <el-form-item label="Header名称">
            <el-input v-model="editingHeader.name" placeholder="如：User-Agent" />
          </el-form-item>
          <el-form-item label="Header值">
            <el-input v-model="editingHeader.value" type="textarea" rows="4" placeholder="Header值" />
          </el-form-item>
          <el-form-item label="描述">
            <el-input v-model="editingHeader.desc" placeholder="可选" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="editDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveHeader">确认</el-button>
        </template>
      </el-dialog>
  
      <!-- 粘贴解析弹窗 -->
      <PasteHeadersDialog ref="pasteDialogRef" @confirm="handlePasteConfirm" />
    </el-card>
  </template>
  
  <script setup>
  import { ref, watch } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { DocumentCopy, Download, Plus } from '@element-plus/icons-vue'
  import PasteHeadersDialog from './PasteHeadersDialog.vue'
  
  const props = defineProps({
    provider: {
      type: Object,
      required: true
    }
  })
  
  const emit = defineEmits(['change'])
  
  const expanded = ref(true)
  const headersList = ref([])
  const selectedHeaders = ref([])
  const editDialogVisible = ref(false)
  const editMode = ref('add')
  const editingHeader = ref({
    id: '',
    enabled: true,
    name: '',
    value: '',
    desc: ''
  })
  const pasteDialogRef = ref(null)
  
  function emitChange() {
    emit('change')
  }
  
  function getConfig() {
    return headersList.value.map(({ id, enabled, name, value, desc }) => ({
      id, enabled, name, value, desc
    }))
  }
  
  function resetConfig() {
    if (props.provider?.headers) {
      headersList.value = props.provider.headers.map(h => ({ ...h }))
    } else {
      headersList.value = []
    }
  }
  
  function handleSelectionChange(selection) {
    selectedHeaders.value = selection
  }
  
  function handleAdd() {
    editMode.value = 'add'
    editingHeader.value = {
      id: Date.now().toString(),
      enabled: true,
      name: '',
      value: '',
      desc: ''
    }
    editDialogVisible.value = true
  }
  
  function editHeader(header) {
    editMode.value = 'edit'
    editingHeader.value = { ...header }
    editDialogVisible.value = true
  }
  
  function saveHeader() {
    if (!editingHeader.value.name.trim()) {
      ElMessage.warning('请输入Header名称')
      return
    }
    if (!editingHeader.value.value.trim()) {
      ElMessage.warning('请输入Header值')
      return
    }
  
    if (editMode.value === 'add') {
      headersList.value.push({ ...editingHeader.value })
    } else {
      const index = headersList.value.findIndex(h => h.id === editingHeader.value.id)
      if (index !== -1) {
        headersList.value[index] = { ...editingHeader.value }
      }
    }
    editDialogVisible.value = false
    emitChange()
    ElMessage.success(editMode.value === 'add' ? '添加成功' : '修改成功')
  }
  
  function deleteHeader(header) {
    ElMessageBox.confirm(`确定要删除 Header "${header.name}" 吗？`, '提示', {
      type: 'warning'
    }).then(() => {
      const index = headersList.value.findIndex(h => h.id === header.id)
      if (index !== -1) {
        headersList.value.splice(index, 1)
        emitChange()
        ElMessage.success('删除成功')
      }
    }).catch(() => {})
  }
  
  function quickAdd(name) {
    // 检查是否已存在
    if (headersList.value.some(h => h.name === name)) {
      ElMessage.warning(`Header "${name}" 已存在`)
      return
    }
  
    const templates = {
      'User-Agent': { value: 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.251 Safari/537.36', desc: '浏览器标识' },
      'Referer': { value: 'https://quote.eastmoney.com/', desc: '来源页面' },
      'Cookie': { value: '', desc: '认证信息（需自行填写）' },
      'Accept': { value: '*/*', desc: '接受类型' },
      'Accept-Language': { value: 'zh-CN,zh-TW;q=0.9,zh;q=0.8,en-US;q=0.7,en;q=0.6', desc: '语言偏好' }
    }
  
    const template = templates[name]
    headersList.value.push({
      id: Date.now().toString(),
      enabled: true,
      name,
      value: template?.value || '',
      desc: template?.desc || ''
    })
    emitChange()
    ElMessage.success(`已添加 ${name}`)
  }
  
  function batchEnable() {
    selectedHeaders.value.forEach(h => h.enabled = true)
    emitChange()
    ElMessage.success(`已启用 ${selectedHeaders.value.length} 个Header`)
  }
  
  function batchDisable() {
    selectedHeaders.value.forEach(h => h.enabled = false)
    emitChange()
    ElMessage.success(`已禁用 ${selectedHeaders.value.length} 个Header`)
  }
  
  function batchDelete() {
    ElMessageBox.confirm(`确定要删除选中的 ${selectedHeaders.value.length} 个Header吗？`, '提示', {
      type: 'warning'
    }).then(() => {
      const idsToDelete = new Set(selectedHeaders.value.map(h => h.id))
      headersList.value = headersList.value.filter(h => !idsToDelete.has(h.id))
      selectedHeaders.value = []
      emitChange()
      ElMessage.success('删除成功')
    }).catch(() => {})
  }
  
  function openPasteDialog() {
    pasteDialogRef.value?.open()
  }
  
  function handlePasteConfirm(headers) {
    headers.forEach(header => {
      // 如果存在同名Header，根据选项决定是否覆盖
      const existing = headersList.value.find(h => h.name === header.name)
      if (existing) {
        existing.value = header.value
        existing.desc = header.desc || existing.desc
      } else {
        headersList.value.push({
          id: Date.now().toString() + Math.random(),
          enabled: true,
          ...header
        })
      }
    })
    emitChange()
    ElMessage.success(`成功导入 ${headers.length} 个Header`)
  }
  
  function handleExport() {
    const exportData = headersList.value.map(({ name, value, desc, enabled }) => ({
      name, value, desc, enabled
    }))
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${props.provider?.name || 'headers'}_headers.json`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  }
  
  watch(() => props.provider, () => {
    resetConfig()
  }, { immediate: true, deep: true })
  
  defineExpose({ getConfig, resetConfig })
  </script>
  
  <style scoped>
  .config-card {
    margin-bottom: 0;
  }
  
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 500;
  }
  
  .toolbar {
    display: flex;
    gap: 10px;
    margin-bottom: 16px;
  }
  
  .quick-add {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
    padding: 8px 12px;
    background-color: #f5f7fa;
    border-radius: 6px;
  }
  
  .quick-label {
    font-size: 12px;
    color: #909399;
  }
  
  .batch-actions {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid #ebeef5;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  </style>