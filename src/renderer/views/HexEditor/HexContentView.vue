<template>
  <el-splitter-panel :size="800" :min-size="700">
    <div class="hex-view-panel">
      <!-- 顶部列头 -->
      <div class="hex-header" ref="hexHeaderRef">
        <div class="addr-col" :style="{ width: `${addrColWidth}px` }">ADDR</div>
        <div class="hex-cols">
          <div v-for="col in 16" :key="col" class="hex-col">
            {{ (col - 1).toString(16).toUpperCase() }}
          </div>
        </div>
        <div class="ascii-col">ASCII</div>
      </div>

      <!-- 内容区 -->
      <div
        class="hex-content-wrapper"
        ref="hexWrapperRef"
        @scroll="handleScroll"
        @mouseenter="showScrollbar = true"
        @mouseleave="showScrollbar = false"
      >
        <canvas
          ref="hexCanvas"
          class="hex-canvas"
          :class="{ 'scrollbar-visible': showScrollbar }"
        ></canvas>
        <div
          class="scroll-placeholder"
          :style="{ height: totalHeight + 'px' }"
        ></div>
      </div>

      <!-- 右键菜单 -->
      <HexContextMenu
        v-if="showContextMenu"
        :x="menuX"
        :y="menuY"
        @copy="handleCopy"
        @cut="handleCut"
        @delete="handleDelete"
        @edit="handleEdit"
        @close="showContextMenu = false"
      />
    </div>
  </el-splitter-panel>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import HexContextMenu from "./HexContextMenu.vue";
import { HexRenderer } from "./HexRenderer.js";

const props = defineProps({
  dataManager: {
    type: Object,
    required: true,
  },
  totalBytes: {
    type: Number,
    required: true,
  },
  lockedNodes: {
    type: Object,
    default: () => ({}),
  },
  isEditing: {
    type: Boolean,
    default: false,
  },
  editRange: {
    type: Object,
    default: () => ({ start: 0, end: 0 }),
  },
  selectedAddrRange: {
    type: Object,
    default: () => ({ start: -1, end: -1 }),
  },
});

const emit = defineEmits([
  "selection-change",
  "visible-range-change",
  "copy",
  "cut",
  "delete",
  "edit",
]);

// 常量
const HEX_PER_ROW = 16;
const ROW_HEIGHT = 18;
const addrColWidth = 8 * 12 + 10;

// 响应式数据
const hexWrapperRef = ref(null);
const hexCanvas = ref(null);
const showScrollbar = ref(false);
const showContextMenu = ref(false);
const menuX = ref(0);
const menuY = ref(0);
const isLoading = ref(false);

// 计算属性
const totalHeight = computed(() => {
  console.log("totalBytes = ", props.totalBytes);
  let totalHeight = Math.ceil(props.totalBytes / 16) * ROW_HEIGHT;
  console.log("totalHeight = ", totalHeight);
  return totalHeight;
});

// 渲染器实例
let renderer = null;

// 处理滚动
const handleScroll = async (e) => {
  const scrollTop = e.target.scrollTop;
  const visibleStartRow = Math.floor(scrollTop / ROW_HEIGHT);
  const visibleEndRow = Math.ceil(
    (scrollTop + e.target.clientHeight) / ROW_HEIGHT
  );
  const startAddr = visibleStartRow * HEX_PER_ROW;
  const endAddr = Math.min(
    visibleEndRow * HEX_PER_ROW - 1,
    props.totalBytes - 1
  );
  // 确保数据已加载
  await props.dataManager.ensureRangeLoaded(startAddr, endAddr);
  // 更新渲染器
  if (renderer) {
    renderer.setScrollTop(scrollTop);
  }
};

// 初始化渲染器
const initRenderer = () => {
  if (!hexWrapperRef.value || !hexCanvas.value) return;

  renderer = new HexRenderer({
    canvas: hexCanvas.value,
    wrapper: hexWrapperRef.value,
    dataManager: props.dataManager,
    hexPerRow: HEX_PER_ROW,
    rowHeight: ROW_HEIGHT,
    addrColWidth,
  });

  // 绑定事件
  renderer.onClick = (addr) => {
    emit("selection-change", { start: addr, end: addr });
  };

  renderer.onSelectionChange = (range) => {
    emit("selection-change", range);
  };

  renderer.init();
};

// 滚动到指定地址
const scrollToAddr = (addr) => {
  if (!hexWrapperRef.value || !renderer) return;

  const row = Math.floor(addr / HEX_PER_ROW);
  const scrollTop = row * ROW_HEIGHT;
  hexWrapperRef.value.scrollTop = scrollTop;

  // 手动触发一次滚动
  handleScroll({ target: hexWrapperRef.value });
};

// 请求重新渲染
const requestRender = () => {
  renderer?.requestRender();
};

// 右键菜单
const handleContextMenu = (e) => {
  showContextMenu.value = true;
  menuX.value = e.clientX;
  menuY.value = e.clientY;
};

// 菜单操作
const handleCopy = () => {
  emit("copy");
  showContextMenu.value = false;
};

const handleCut = () => {
  emit("cut");
  showContextMenu.value = false;
};

const handleDelete = () => {
  emit("delete");
  showContextMenu.value = false;
};

const handleEdit = () => {
  emit("edit");
  showContextMenu.value = false;
};

// 暴露方法
defineExpose({
  scrollToAddr,
  requestRender,
  setColorRanges: (ranges) => {
    renderer?.setColorRanges(ranges);
  },
});

// 监听数据管理器事件
onMounted(() => {
  nextTick(() => {
    initRenderer();
  });

  props.dataManager.addListener((event) => {
    if (event.type === "data-updated" || event.type === "single-update") {
      requestRender();
    } else if (event.type === "progress") {
      console.log("数据加载进度 > ", event.progress);
    }
  });
});

onUnmounted(() => {
  renderer?.destroy();
});

// 监听props变化
watch(
  () => props.isEditing,
  () => {
    renderer?.setEditMode(props.isEditing, props.editRange);
  }
);

// watch(
//   () => props.selectedAddrRange,
//   (range) => {
//     renderer?.setSelectedRange(range);
//   },
//   { deep: true }
// );
</script>

<style scoped>
.hex-view-panel {
  width: 100%;
  padding-right:4px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: white;
}

.hex-header {
  display: flex;
  height: 30px;
  background: #f8f9fa;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.addr-col {
  text-align: center;
  color: #999;
  line-height: 30px;
  border-right: 1px solid #e5e7eb;
}

.hex-cols {
  display: flex;
  border-right: 1px solid #e5e7eb;
}

.hex-col {
  width: 24px;
  text-align: center;
  line-height: 30px;
  font-family: monospace;
  color: #666;
  border-right: 1px solid #f0f0f0;
}

.ascii-col {
  width: 200px;
  text-align: center;
  line-height: 30px;
  color: #666;
}

.hex-content-wrapper {
  flex: 1;
  position: relative;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  transition: scrollbar-color 0.2s ease;
}

.hex-content-wrapper:hover {
  scrollbar-color: #94a3b8 #f1f5f9;
}

.hex-content-wrapper::-webkit-scrollbar {
  width: 8px;
  background: transparent;
}

.hex-content-wrapper::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 4px;
}

.hex-content-wrapper:hover::-webkit-scrollbar-thumb {
  background: #94a3b8;
}

.hex-content-wrapper:hover::-webkit-scrollbar-track {
  background: #f1f5f9;
}

.hex-canvas {
  position: sticky;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color:#FFF;
  will-change: transform;
}

.scroll-placeholder {
  width: 1px;
  pointer-events: none;
  position: relative;
  z-index: 0;
}
</style>
