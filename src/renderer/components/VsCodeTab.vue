<template>
    <div class="vscode-tab-container">
      <!-- 标签栏容器（带自定义滚动） -->
      <div 
        ref="tabScrollRef"
        class="vscode-tab-scroll-wrapper"
        @wheel="handleWheel"
      >
        <!-- 标签列表 -->
        <div class="vscode-tab-list" :style="{ left: `-${scrollLeft}px` }">
          <div 
            v-for="(tab, index) in tabs" 
            :key="tab.key"
            class="vscode-tab-item"
            :class="{ active: activeKey === tab.key }"
            @click="handleTabClick(tab.key)"
          >
            <!-- 标签内容（自定义插槽） -->
            <div 
              class="vscode-tab-content"
              :title="getTabTitle(tab)"
            >
              <slot 
                :name="`tab-${tab.key}`" 
                :tab="tab"
              >
                <!-- 默认标题（截断处理） -->
                {{ truncateTitle(getTabTitle(tab)) }}
              </slot>
            </div>
            <!-- 关闭按钮 -->
            <div 
              class="vscode-tab-close"
              @click.stop="handleCloseTab(tab.key)"
            >
              <i class="el-icon-close"></i>
            </div>
          </div>
        </div>
      </div>
  
      <!-- 自定义滚动条 -->
      <div 
        v-if="showScrollBar"
        class="vscode-tab-scrollbar"
      >
        <div 
          class="vscode-tab-scrollbar-thumb"
          :style="{ 
            left: `${scrollBarLeft}px`, 
            width: `${scrollBarWidth}px` 
          }"
          @mousedown="handleScrollBarDown"
        ></div>
      </div>
  
      <!-- 标签内容区域 -->
      <div class="vscode-tab-panel">
        <slot 
          name="panel" 
          :activeKey="activeKey"
          :tabs="tabs"
        ></slot>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
  
  // Props 定义
  const props = defineProps({
    // 标签列表 [{ key: string, title: string, ...其他自定义属性 }]
    tabs: {
      type: Array,
      required: true,
      default: () => []
    },
    // 激活的标签key
    activeKey: {
      type: String,
      required: true
    },
    // 标签最大显示字符数
    maxChar: {
      type: Number,
      default: 32
    }
  });
  
  // 事件定义
  const emit = defineEmits(['tab-change', 'tab-close']);
  
  // 响应式数据
  const tabScrollRef = ref(null); // 滚动容器ref
  const scrollLeft = ref(0); // 标签列表左偏移量
  const showScrollBar = ref(false); // 是否显示滚动条
  const scrollBarLeft = ref(0); // 滚动条滑块左偏移
  const scrollBarWidth = ref(0); // 滚动条滑块宽度
  const isDragging = ref(false); // 是否拖拽滚动条
  
  // ========== 所有方法函数提前定义（核心修复） ==========
  // 方法：获取标签标题
  const getTabTitle = (tab) => {
    return tab.title || tab.key;
  };
  
  // 方法：截断标题（超出maxChar显示...）
  const truncateTitle = (title) => {
    if (title.length <= props.maxChar) return title;
    return title.substring(0, props.maxChar) + '...';
  };
  
  // 方法：限制滚动范围（不超出边界）
  const limitScrollRange = () => {
    const maxScroll = Math.max(0, tabListWidth.value - scrollViewWidth.value);
    scrollLeft.value = Math.max(0, Math.min(scrollLeft.value, maxScroll));
  };
  
  // 方法：更新滚动条状态
  const updateScrollBar = () => {
    const totalWidth = tabListWidth.value;
    const viewWidth = scrollViewWidth.value;
    
    // 判断是否显示滚动条
    showScrollBar.value = totalWidth > viewWidth;
    
    if (!showScrollBar.value) {
      scrollLeft.value = 0;
      return;
    }
  
    // 计算滚动条滑块宽度和位置
    const ratio = viewWidth / totalWidth;
    scrollBarWidth.value = Math.max(20, viewWidth * ratio); // 最小宽度20px
    scrollBarLeft.value = (scrollLeft.value / (totalWidth - viewWidth)) * (viewWidth - scrollBarWidth.value);
  };
  
  // 方法：滚动到激活的标签
  const scrollToActiveTab = () => {
    if (!tabScrollRef.value || !props.activeKey) return;
    
    const activeTab = tabScrollRef.value.querySelector(`.vscode-tab-item[class*="active"]`);
    if (!activeTab) return;
  
    const tabRect = activeTab.getBoundingClientRect();
    const containerRect = tabScrollRef.value.getBoundingClientRect();
    const tabLeft = tabRect.left - containerRect.left + scrollLeft.value;
    const tabRight = tabLeft + tabRect.width;
  
    // 标签左侧超出可视区域
    if (tabLeft < scrollLeft.value) {
      scrollLeft.value = tabLeft - 10; // 留10px边距
    }
    // 标签右侧超出可视区域
    else if (tabRight > scrollLeft.value + scrollViewWidth.value) {
      scrollLeft.value = tabRight - scrollViewWidth.value + 10;
    }
  
    // 限制滚动范围
    limitScrollRange();
    updateScrollBar();
  };
  
  // 方法：鼠标滚轮横向滚动
  const handleWheel = (e) => {
    e.preventDefault();
    // 滚轮方向：向上/向左 减，向下/向右 加
    scrollLeft.value += e.deltaY > 0 ? 50 : -50;
    limitScrollRange();
    updateScrollBar();
  };
  
  // 方法：点击标签切换
  const handleTabClick = (key) => {
    emit('tab-change', key);
  };
  
  // 方法：关闭标签
  const handleCloseTab = (key) => {
    emit('tab-close', key);
  };
  
  // 方法：滚动条鼠标按下
  const handleScrollBarDown = (e) => {
    e.preventDefault();
    isDragging.value = true;
    // 记录鼠标初始位置
    window.scrollBarStartX = e.clientX;
    window.scrollBarStartLeft = scrollBarLeft.value;
  };
  
  // 方法：滚动条鼠标移动
  const handleScrollBarMove = (e) => {
    if (!isDragging.value) return;
    
    const deltaX = e.clientX - window.scrollBarStartX;
    const maxScrollBarLeft = scrollViewWidth.value - scrollBarWidth.value;
    // 计算新的滚动条位置
    const newScrollBarLeft = Math.max(0, Math.min(window.scrollBarStartLeft + deltaX, maxScrollBarLeft));
    scrollBarLeft.value = newScrollBarLeft;
    
    // 计算标签列表的偏移量
    const maxScroll = tabListWidth.value - scrollViewWidth.value;
    scrollLeft.value = (newScrollBarLeft / (maxScrollBarLeft || 1)) * maxScroll;
    limitScrollRange();
  };
  
  // 方法：滚动条鼠标松开
  const handleScrollBarUp = () => {
    isDragging.value = false;
  };
  
  // ========== 计算属性（在方法之后，watch之前） ==========
  // 计算属性：标签容器总宽度
  const tabListWidth = computed(() => {
    if (!tabScrollRef.value) return 0;
    const tabItems = tabScrollRef.value.querySelectorAll('.vscode-tab-item');
    let totalWidth = 0;
    tabItems.forEach(item => {
      totalWidth += item.offsetWidth;
    });
    return totalWidth;
  });
  
  // 计算属性：滚动容器可视宽度
  const scrollViewWidth = computed(() => {
    return tabScrollRef.value ? tabScrollRef.value.clientWidth : 0;
  });
  
  // ========== Watch 监听（最后定义） ==========
  // 监听标签变化，更新滚动状态
  watch(
    [() => props.tabs, scrollViewWidth, tabListWidth],
    () => {
      updateScrollBar();
    },
    { immediate: true }
  );
  
  // 监听激活标签变化，自动滚动到可视区域
  watch(
    () => props.activeKey,
    () => {
      scrollToActiveTab();
    },
    { immediate: true }
  );
  
  // ========== 生命周期 ==========
  // 初始化
  onMounted(() => {
    window.addEventListener('mousemove', handleScrollBarMove);
    window.addEventListener('mouseup', handleScrollBarUp);
  });
  
  // 销毁
  onUnmounted(() => {
    window.removeEventListener('mousemove', handleScrollBarMove);
    window.removeEventListener('mouseup', handleScrollBarUp);
  });
  </script>
  
  <style scoped>
  /* 整体容器 */
  .vscode-tab-container {
    width: 100%;
    height: 100%;
    background-color: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    display: flex;
    flex-direction: column;
  }
  
  /* 标签滚动容器 */
  .vscode-tab-scroll-wrapper {
    width: 100%;
    height: 40px;
    position: relative;
    overflow: hidden;
    background-color: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
  }
  
  /* 标签列表 */
  .vscode-tab-list {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    display: flex;
    transition: left 0.1s ease;
  }
  
  /* 单个标签 */
  .vscode-tab-item {
    height: 100%;
    min-width: 80px;
    max-width: 280px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background-color: #f9fafb;
    border-right: 1px solid #e5e7eb;
    cursor: pointer;
    box-sizing: border-box;
    white-space: nowrap;
  }
  
  /* 激活的标签 */
  .vscode-tab-item.active {
    background-color: #ffffff;
    border-top: 2px solid #007acc;
    border-bottom: 1px solid #ffffff;
    margin-bottom: -1px;
  }
  
  /* 标签内容 */
  .vscode-tab-content {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #374151;
    font-size: 14px;
    padding-right: 8px;
  }
  
  /* 激活标签的内容 */
  .vscode-tab-item.active .vscode-tab-content {
    color: #007acc;
    font-weight: 500;
  }
  
  /* 关闭按钮 */
  .vscode-tab-close {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: #9ca3af;
    font-size: 12px;
    transition: all 0.2s ease;
  }
  
  .vscode-tab-close:hover {
    background-color: #e5e7eb;
    color: #374151;
  }
  
  /* 自定义滚动条 */
  .vscode-tab-scrollbar {
    width: 100%;
    height: 4px;
    background-color: #f3f4f6;
    position: relative;
    margin-top: -1px;
  }
  
  /* 滚动条滑块 */
  .vscode-tab-scrollbar-thumb {
    position: absolute;
    top: 0;
    height: 100%;
    background-color: #007acc;
    border-radius: 2px;
    cursor: grab;
  }
  
  .vscode-tab-scrollbar-thumb:active {
    cursor: grabbing;
  }
  
  /* 标签内容区域 */
  .vscode-tab-panel {
    flex: 1;
    width: 100%;
    padding: 16px;
    box-sizing: border-box;
    overflow: auto;
  }
  </style>