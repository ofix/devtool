<template>
  <el-splitter-panel :size="800" :min-size="700">
    <div class="hex-view-panel">
      <!-- 顶部列头 -->
      <div class="hex-header" ref="hexHeaderRef">
        <div class="addr-col" :style="{ width: `${addrWidth}px` }"></div>
        <div
          class="hex-cols"
          :style="{
            width: `${hexWidth}px`,
          }"
        >
          <div v-for="col in 16" :key="col" class="hex-col">
            {{ (col - 1).toString(16).toUpperCase() }}
          </div>
        </div>
        <div class="ascii-col" :style="{ width: `${asciiWidth}px` }"></div>
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

const HEX_COLS = 16; // 每行渲染的16进制数据列数

// 响应式数据
const hexWrapperRef = ref(null);
const hexCanvas = ref(null);
const showScrollbar = ref(false);
const showContextMenu = ref(false);
const addrWidth = ref(120);
const hexWidth = ref(384);
const asciiWidth = ref(256);
const rowHeight = ref(22);
const menuX = ref(0);
const menuY = ref(0);
// 渲染器实例
let renderer = null;

// 计算属性
const totalHeight = computed(() => {
  let totalHeight = Math.ceil(props.totalBytes / 16) * rowHeight.value;
  return totalHeight;
});

// 处理滚动
const handleScroll = async (e) => {
  const scrollTop = e.target.scrollTop;
  const visibleStartRow = Math.floor(scrollTop / rowHeight.value);
  const visibleEndRow = Math.ceil(
    (scrollTop + e.target.clientHeight) / rowHeight.value
  );
  const startAddr = visibleStartRow * HEX_COLS;
  const endAddr = Math.min(visibleEndRow * HEX_COLS - 1, props.totalBytes - 1);
  // 确保数据已加载
  await props.dataManager.ensureRangeLoaded(startAddr, endAddr);
};

// 初始化渲染器
const initRenderer = () => {
  if (!hexWrapperRef.value || !hexCanvas.value) return;

  renderer = new HexRenderer({
    canvas: hexCanvas.value,
    wrapper: hexWrapperRef.value,
    dataManager: props.dataManager,
    hexPerRow: HEX_COLS,
  });

  // 绑定事件
  renderer.onClick = (addr) => {
    emit("selection-change", { start: addr, end: addr });
  };

  renderer.onSelectionChange = (range) => {
    emit("selection-change", range);
  };

  renderer.onDimensionChanged = (newSize) => {
    addrWidth.value = newSize.addrWidth;
    hexWidth.value = newSize.hexWidth;
    asciiWidth.value = newSize.asciiWidth;
    rowHeight.value = newSize.rowHeight;
  };

  renderer.init();
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

watch(
  () => props.totalBytes,
  () => {
    console.log("fileSizedChanged: ", props.totalBytes);
    renderer?.onFileSizeChanged();
  }
);
</script>

<style scoped>
.hex-view-panel {
  width: 100%;
  padding-right: 4px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: white;
}

.hex-header {
  display: flex;
  height: 30px;
  border-bottom: 1px solid #e5e7eb;
  overflow:hidden;
  width: fit-content; /* 容器宽度适配子元素总宽度 */
}

.addr-col {
  padding-left:4px;
  color: #999;
  line-height: 30px;
  box-sizing: border-box;
}

.hex-cols {
  display: flex;
  box-sizing:border-box;
}

.hex-col {
  flex: 1;
  text-align: center;
  line-height: 30px;
  font-family: monospace;
  color: #999;
  box-sizing: border-box;
}

.ascii-col {
  text-align: center;
  line-height: 30px;
  overflow:hidden;
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
  background-color: #fff;
  will-change: transform;
}

.scroll-placeholder {
  width: 1px;
  pointer-events: none;
  position: relative;
  z-index: 0;
}
</style>
