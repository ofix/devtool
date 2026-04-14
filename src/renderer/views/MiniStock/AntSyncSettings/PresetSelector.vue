<!-- PresetSelector.vue -->
<template>
    <el-dialog 
      v-model="visible" 
      title="导入浏览器预设" 
      width="700px"
      :close-on-click-modal="false"
    >
      <div class="preset-selector">
        <div class="preset-grid">
          <div
            v-for="preset in presetOptions"
            :key="preset.value"
            class="preset-card"
            :class="{ active: selectedValue === preset.value }"
            :style="{ '--preset-color': preset.color }"
            @click="selectedValue = preset.value"
          >
            <div class="preset-icon" :style="{ background: `${preset.color}20` }">
              <!-- 修复：使用 component 动态渲染图标组件 -->
              <component :is="preset.icon" class="preset-icon-svg" />
            </div>
            <div class="preset-info">
              <div class="preset-label">{{ preset.label }}</div>
              <div class="preset-desc">{{ preset.description }}</div>
            </div>
            <div v-if="selectedValue === preset.value" class="preset-check">
              <el-icon :color="preset.color"><Check /></el-icon>
            </div>
          </div>
        </div>
        
        <div class="preset-tip">
          <el-icon><InfoFilled /></el-icon>
          <span>提示：导入将覆盖同名的 Header，不会删除其他 Header</span>
        </div>
      </div>
      
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="handleConfirm">导入</el-button>
      </template>
    </el-dialog>
  </template>
  
  <script setup>
  import { ref, computed } from 'vue'
  import { Check, InfoFilled } from '@element-plus/icons-vue'
  import IconBrowser360 from '@/icons/IconBrowser360.vue';
  import IconBrowserEdge from '@/icons/IconBrowserEdge.vue';
  import IconBrowserQQ from '@/icons/IconBrowserQQ.vue';
  import IconBrowserChrome from '@/icons/IconBrowserChrome.vue';
  import IconBrowserFirefox from '@/icons/IconBrowserFirefox.vue';
  import IconBrowserSafari from '@/icons/IconBrowserSafari.vue';
  import IconBrowserLiebao from "@/icons/IconBrowserLiebao.vue";
  
  const props = defineProps({
    modelValue: {
      type: Boolean,
      default: false
    }
  })
  
  const emit = defineEmits(['update:modelValue', 'confirm'])
  
  const visible = computed({
    get: () => props.modelValue,
    set: (val) => emit('update:modelValue', val)
  })
  
  const selectedValue = ref('Chrome (Windows)')
  
  // 预设选项配置（只包含展示信息）
  const presetOptions = [
    { 
      label: "Chrome (Windows)", 
      value: "Chrome (Windows)",
      icon: IconBrowserChrome,
      color: "#4285F4",
      description: "Windows Chrome 浏览器"
    },
    { 
      label: "Chrome (macOS)", 
      value: "Chrome (macOS)",
      icon: IconBrowserChrome,
      color: "#4285F4",
      description: "macOS Chrome 浏览器"
    },
    { 
      label: "Firefox (Windows)", 
      value: "Firefox (Windows)",
      icon: IconBrowserFirefox,
      color: "#FF9400",
      description: "Windows Firefox 浏览器"
    },
    { 
      label: "Safari (macOS)", 
      value: "Safari (macOS)",
      icon: IconBrowserSafari,
      color: "#0066CC",
      description: "macOS Safari 浏览器"
    },
    { 
      label: "Edge (Windows)", 
      value: "Edge (Windows)",
      icon: IconBrowserEdge,
      color: "#0078D7",
      description: "Windows Edge 浏览器"
    },
    { 
      label: "360 浏览器", 
      value: "360 Browser",
      icon: IconBrowser360,
      color: "#FF6600",
      description: "360 安全浏览器"
    },
    { 
      label: "QQ 浏览器", 
      value: "QQ Browser",
      icon: IconBrowserQQ,
      color: "#12B7F5",
      description: "QQ 浏览器"
    },
    { 
      label: "猎豹浏览器", 
      value: "Liebao Browser",
      icon: IconBrowserLiebao,
      color: "#FF9900",
      description: "猎豹浏览器"
    },
    { 
      label: "Mobile (iPhone)", 
      value: "Mobile (iPhone)",
      icon: IconBrowserSafari,
      color: "#34C759",
      description: "iPhone Safari 浏览器"
    },
    { 
      label: "Mobile (Android)", 
      value: "Mobile (Android)",
      icon: IconBrowserChrome,
      color: "#3DDC84",
      description: "Android Chrome 浏览器"
    },
  ]
  
  function handleConfirm() {
    // 只返回选中的值，具体的 headers 数据由父组件提供
    emit('confirm', selectedValue.value)
    visible.value = false
  }
  
  // 重置选中状态（每次打开对话框时重置）
  function resetSelection() {
    selectedValue.value = 'Chrome (Windows)'
  }
  
  // 暴露重置方法给父组件
  defineExpose({ resetSelection })
  </script>
  
  <style scoped>
  .preset-selector {
    padding: 8px 0;
  }
  
  .preset-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 20px;
    max-height: 400px;
    overflow-y: auto;
    padding: 4px;
  }
  
  .preset-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border: 2px solid #e4e7ed;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.25s ease;
    background: white;
    position: relative;
  }
  
  .preset-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
  
  .preset-card.active {
    border-color: var(--preset-color);
    background: rgba(66, 133, 244, 0.05);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }
  
  .preset-icon {
    width: 48px;
    height: 48px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  
  .preset-icon-svg {
    width: 32px;
    height: 32px;
  }
  
  .preset-info {
    flex: 1;
    min-width: 0;
  }
  
  .preset-label {
    font-weight: 600;
    margin-bottom: 4px;
    color: #303133;
  }
  
  .preset-desc {
    font-size: 12px;
    color: #909399;
  }
  
  .preset-check {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  
  .preset-tip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background-color: #f5f7fa;
    border-radius: 8px;
    font-size: 12px;
    color: #909399;
  }
  
  .preset-tip .el-icon {
    font-size: 16px;
  }
  
  /* 滚动条样式 */
  .preset-grid::-webkit-scrollbar {
    width: 6px;
  }
  
  .preset-grid::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 3px;
  }
  
  .preset-grid::-webkit-scrollbar-thumb {
    background: #c1c1c1;
    border-radius: 3px;
  }
  
  .preset-grid::-webkit-scrollbar-thumb:hover {
    background: #a8a8a8;
  }
  </style>