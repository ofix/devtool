<template>
    <Teleport to="body">
      <div
        class="concept-panel"
        :style="panelStyle"
        ref="panelRef"
        @mousedown="startDrag"
      >
        <div class="panel-header" @mousedown="startDrag">
          <span>{{ stockName }} - 概念板块</span>
          <el-button type="text" @click="handleClose" :icon="Close" />
        </div>
        <div class="panel-content">
          <el-skeleton :loading="loading" animated :rows="3">
            <template #default>
              <div v-for="concept in concepts" :key="concept.name" class="concept-item">
                <div class="concept-name">{{ concept.name }}</div>
                <div class="concept-desc">{{ concept.desc }}</div>
              </div>
              <div v-if="concepts.length === 0" class="no-data">
                暂无概念数据
              </div>
            </template>
          </el-skeleton>
        </div>
      </div>
    </Teleport>
  </template>
  
  <script setup>
  import { ref, onMounted, onUnmounted } from 'vue';
  import { Close } from '@element-plus/icons-vue';
  import DataSourceAdapter from './services/DataSourceAdapter';
  
  const props = defineProps({
    stockCode: {
      type: String,
      required: true
    },
    stockName: {
      type: String,
      default: ''
    }
  });
  
  const emit = defineEmits(['close']);
  
  const panelRef = ref(null);
  const concepts = ref([]);
  const loading = ref(true);
  const panelStyle = ref({
    position: 'fixed',
    top: '100px',
    left: '100px',
    width: '300px',
    zIndex: 1000,
    opacity: 0.95
  });
  
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  
  // 加载概念数据
  const loadConcepts = async () => {
    if (!props.stockCode) return;
    
    loading.value = true;
    try {
      concepts.value = await DataSourceAdapter.getStockConcept(props.stockCode);
    } catch (error) {
      console.error('加载概念数据失败:', error);
    } finally {
      loading.value = false;
    }
  };
  
  // 开始拖拽
  const startDrag = (e) => {
    if (e.target.closest('.panel-header')) {
      isDragging = true;
      const rect = panelRef.value.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;
      
      document.addEventListener('mousemove', onDrag);
      document.addEventListener('mouseup', stopDrag);
    }
  };
  
  // 拖拽中
  const onDrag = (e) => {
    if (!isDragging) return;
    
    panelStyle.value.left = e.clientX - dragOffset.x + 'px';
    panelStyle.value.top = e.clientY - dragOffset.y + 'px';
  };
  
  // 停止拖拽
  const stopDrag = () => {
    isDragging = false;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
  };
  
  // 关闭面板
  const handleClose = () => {
    emit('close');
  };
  
  onMounted(() => {
    loadConcepts();
  });
  
  onUnmounted(() => {
    stopDrag();
  });
  </script>
  
  <style scoped>
  .concept-panel {
    background: white;
    border-radius: 4px;
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.3);
    border: 1px solid #ebeef5;
    overflow: hidden;
    user-select: none;
    backdrop-filter: blur(10px);
    background-color: rgba(255, 255, 255, 0.95);
  }
  
  .panel-header {
    padding: 10px 15px;
    background-color: #409eff;
    color: white;
    font-weight: bold;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: move;
  }
  
  .panel-header :deep(.el-button) {
    color: white;
  }
  
  .panel-content {
    padding: 15px;
    max-height: 400px;
    overflow-y: auto;
  }
  
  .concept-item {
    margin-bottom: 15px;
    padding: 8px;
    border-bottom: 1px solid #f0f0f0;
  }
  
  .concept-item:last-child {
    border-bottom: none;
  }
  
  .concept-name {
    font-weight: bold;
    color: #409eff;
    margin-bottom: 4px;
  }
  
  .concept-desc {
    font-size: 12px;
    color: #606266;
  }
  
  .no-data {
    text-align: center;
    color: #909399;
    padding: 20px;
  }
  </style>