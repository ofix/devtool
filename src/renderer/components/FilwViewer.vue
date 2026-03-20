<!-- src/renderer/components/FileViewer.vue -->
<template>
    <div class="file-viewer">
      <!-- 筛选工具栏 -->
      <el-card class="filter-bar">
        <el-form :inline="true" :model="filters">
          <el-form-item label="网站来源">
            <el-select v-model="filters.website" placeholder="全部" clearable>
              <el-option
                v-for="site in websites"
                :key="site"
                :label="site"
                :value="site"
              />
            </el-select>
          </el-form-item>
          
          <el-form-item label="文件类型">
            <el-select v-model="filters.type" placeholder="全部" clearable>
              <el-option label="视频" value="video" />
              <el-option label="音频" value="audio" />
              <el-option label="图片" value="image" />
              <el-option label="文档" value="document" />
              <el-option label="其他" value="file" />
            </el-select>
          </el-form-item>
          
          <el-form-item label="时间范围">
            <el-date-picker
              v-model="filters.dateRange"
              type="daterange"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
            />
          </el-form-item>
          
          <el-form-item label="文件大小">
            <el-select v-model="filters.size" placeholder="全部" clearable>
              <el-option label="< 1MB" value="small" />
              <el-option label="1-10MB" value="medium" />
              <el-option label="10-100MB" value="large" />
              <el-option label="> 100MB" value="xlarge" />
            </el-select>
          </el-form-item>
          
          <el-form-item>
            <el-button type="primary" @click="searchFiles">搜索</el-button>
            <el-button @click="resetFilters">重置</el-button>
          </el-form-item>
        </el-form>
      </el-card>
      
      <!-- 文件列表 -->
      <el-card class="file-list">
        <template #header>
          <div class="card-header">
            <span>文件列表 (共 {{ total }} 个文件)</span>
            <el-radio-group v-model="viewMode" size="small">
              <el-radio-button value="grid">网格视图</el-radio-button>
              <el-radio-button value="list">列表视图</el-radio-button>
            </el-radio-group>
          </div>
        </template>
        
        <!-- 网格视图 -->
        <div v-if="viewMode === 'grid'" class="grid-view">
          <div
            v-for="file in files"
            :key="file.id"
            class="file-card"
            @click="viewFile(file)"
          >
            <div class="file-preview">
              <img
                v-if="file.type === 'image'"
                :src="`file://${file.path}`"
                :alt="file.filename"
              />
              <video
                v-else-if="file.type === 'video'"
                :src="`file://${file.path}`"
                muted
              />
              <audio
                v-else-if="file.type === 'audio'"
                :src="`file://${file.path}`"
              />
              <el-icon v-else :size="48">
                <Document />
              </el-icon>
            </div>
            
            <div class="file-info">
              <div class="filename" :title="file.filename">
                {{ file.filename }}
              </div>
              <div class="file-meta">
                <span>{{ file.website }}</span>
                <span>{{ formatSize(file.size) }}</span>
              </div>
              <div class="file-time">
                {{ formatTime(file.downloadTime) }}
              </div>
            </div>
          </div>
        </div>
        
        <!-- 列表视图 -->
        <el-table
          v-else
          :data="files"
          stripe
          @row-click="viewFile"
        >
          <el-table-column prop="filename" label="文件名" min-width="300">
            <template #default="{ row }">
              <div class="file-name-cell">
                <el-icon :size="20">
                  <component :is="getFileIcon(row.type)" />
                </el-icon>
                <span>{{ row.filename }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="website" label="来源网站" width="150" />
          <el-table-column prop="type" label="类型" width="100">
            <template #default="{ row }">
              <el-tag :type="getTypeTag(row.type)" size="small">
                {{ getTypeLabel(row.type) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="size" label="大小" width="120">
            <template #default="{ row }">
              {{ formatSize(row.size) }}
            </template>
          </el-table-column>
          <el-table-column prop="downloadTime" label="下载时间" width="180">
            <template #default="{ row }">
              {{ formatTime(row.downloadTime) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button
                type="primary"
                size="small"
                @click.stop="viewFile(row)"
              >
                查看
              </el-button>
              <el-button
                type="danger"
                size="small"
                @click.stop="deleteFile(row)"
              >
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        
        <!-- 分页 -->
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[12, 24, 48, 96]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="loadFiles"
          @current-change="loadFiles"
        />
      </el-card>
      
      <!-- 文件预览对话框 -->
      <el-dialog
        v-model="showPreview"
        :title="currentFile?.filename"
        width="80%"
        :close-on-click-modal="false"
      >
        <div class="file-preview-dialog">
          <!-- 图片预览 -->
          <el-image
            v-if="currentFile?.type === 'image'"
            :src="`file://${currentFile.path}`"
            fit="contain"
            style="width: 100%; max-height: 70vh"
          />
          
          <!-- 视频播放器 -->
          <video
            v-else-if="currentFile?.type === 'video'"
            :src="`file://${currentFile.path}`"
            controls
            style="width: 100%; max-height: 70vh"
          />
          
          <!-- 音频播放器 -->
          <audio
            v-else-if="currentFile?.type === 'audio'"
            :src="`file://${currentFile.path}`"
            controls
            style="width: 100%"
          />
          
          <!-- PDF预览 -->
          <iframe
            v-else-if="currentFile?.type === 'document' && currentFile.filename.endsWith('.pdf')"
            :src="`file://${currentFile.path}`"
            style="width: 100%; height: 70vh"
          />
          
          <!-- 其他文件 -->
          <div v-else class="unsupported-preview">
            <el-icon :size="64">
              <Document />
            </el-icon>
            <p>该文件类型暂不支持预览</p>
            <el-button type="primary" @click="openFileLocation">
              在文件夹中打开
            </el-button>
          </div>
        </div>
        
        <template #footer>
          <el-button @click="showPreview = false">关闭</el-button>
          <el-button type="primary" @click="openFile">
            打开文件
          </el-button>
          <el-button @click="openFileLocation">
            打开文件位置
          </el-button>
        </template>
      </el-dialog>
    </div>
  </template>
  
  <script setup>
  import { ref, onMounted, computed } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { Document, VideoCamera, Headset, Picture, Files } from '@element-plus/icons-vue'
  import crawlerAPI from '../api/crawlerApi'
  
  // 状态
  const files = ref([])
  const total = ref(0)
  const currentPage = ref(1)
  const pageSize = ref(24)
  const viewMode = ref('grid')
  const showPreview = ref(false)
  const currentFile = ref(null)
  
  // 筛选条件
  const filters = ref({
    website: '',
    type: '',
    dateRange: null,
    size: ''
  })
  
  // 网站列表
  const websites = ref([])
  
  /**
   * 加载文件列表
   */
  const loadFiles = async () => {
    try {
      const params = {
        page: currentPage.value,
        pageSize: pageSize.value,
        ...filters.value
      }
      
      if (filters.value.dateRange) {
        params.startDate = filters.value.dateRange[0]
        params.endDate = filters.value.dateRange[1]
      }
      
      const result = await crawlerAPI.getFiles(params)
      files.value = result.data
      total.value = result.total
    } catch (error) {
      ElMessage.error('加载文件列表失败：' + error.message)
    }
  }
  
  /**
   * 搜索文件
   */
  const searchFiles = () => {
    currentPage.value = 1
    loadFiles()
  }
  
  /**
   * 重置筛选条件
   */
  const resetFilters = () => {
    filters.value = {
      website: '',
      type: '',
      dateRange: null,
      size: ''
    }
    searchFiles()
  }
  
  /**
   * 查看文件
   */
  const viewFile = (file) => {
    currentFile.value = file
    showPreview.value = true
  }
  
  /**
   * 删除文件
   */
  const deleteFile = async (file) => {
    try {
      await ElMessageBox.confirm(
        `确定要删除文件 "${file.filename}" 吗？此操作不可恢复。`,
        '确认删除',
        {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )
      
      await crawlerAPI.deleteFile(file.id)
      ElMessage.success('文件已删除')
      loadFiles()
    } catch (error) {
      if (error !== 'cancel') {
        ElMessage.error('删除失败：' + error.message)
      }
    }
  }
  
  /**
   * 打开文件
   */
  const openFile = () => {
    if (currentFile.value) {
      window.crawlerAPI.openFile(currentFile.value.path)
    }
  }
  
  /**
   * 打开文件位置
   */
  const openFileLocation = () => {
    if (currentFile.value) {
      window.crawlerAPI.openFileLocation(currentFile.value.path)
    }
  }
  
  /**
   * 格式化文件大小
   */
  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
  
  /**
   * 格式化时间
   */
  const formatTime = (time) => {
    return new Date(time).toLocaleString('zh-CN')
  }
  
  /**
   * 获取文件图标
   */
  const getFileIcon = (type) => {
    const icons = {
      'video': VideoCamera,
      'audio': Headset,
      'image': Picture,
      'document': Document,
      'file': Files
    }
    return icons[type] || Document
  }
  
  /**
   * 获取类型标签颜色
   */
  const getTypeTag = (type) => {
    const colors = {
      'video': 'danger',
      'audio': 'warning',
      'image': 'success',
      'document': 'info',
      'file': ''
    }
    return colors[type] || ''
  }
  
  /**
   * 获取类型标签文本
   */
  const getTypeLabel = (type) => {
    const labels = {
      'video': '视频',
      'audio': '音频',
      'image': '图片',
      'document': '文档',
      'file': '其他'
    }
    return labels[type] || type
  }
  
  // 加载网站列表
  const loadWebsites = async () => {
    const status = await crawlerAPI.getAllStatus()
    websites.value = Object.keys(status)
  }
  
  onMounted(() => {
    loadWebsites()
    loadFiles()
  })
  </script>
  
  <style scoped>
  .file-viewer {
    padding: 20px;
  }
  
  .filter-bar {
    margin-bottom: 20px;
  }
  
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .grid-view {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 20px;
    margin-bottom: 20px;
  }
  
  .file-card {
    border: 1px solid #ebeef5;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.3s;
  }
  
  .file-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  }
  
  .file-preview {
    height: 150px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #f5f7fa;
    overflow: hidden;
  }
  
  .file-preview img,
  .file-preview video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  
  .file-info {
    padding: 12px;
  }
  
  .filename {
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .file-meta {
    font-size: 12px;
    color: #909399;
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  
  .file-time {
    font-size: 11px;
    color: #c0c4cc;
  }
  
  .file-name-cell {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .file-preview-dialog {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 400px;
  }
  
  .unsupported-preview {
    text-align: center;
    padding: 40px;
  }
  
  .unsupported-preview p {
    margin: 20px 0;
    color: #909399;
  }
  </style>