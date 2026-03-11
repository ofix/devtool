<template>
  <el-splitter-panel :size="800" :min-size="700">
    <div class="hex-view-panel" ref="hexViewRef">
      <!-- 加载进度条 -->
      <div v-if="isLoading" class="loading-mask">
        <el-progress
          :percentage="loadingProgress"
          status="success"
          style="width: 300px"
        />
        <span class="loading-text"
          >正在读取文件：{{ loadingProgress.toFixed(1) }}%</span
        >
      </div>

      <!-- 顶部列头 -->
      <div class="hex-header" ref="hexHeaderRef">
        <div
          class="addr-col header-addr"
          :style="{ width: `${addrColWidth}px` }"
        >
          ADDR
        </div>
        <div class="hex-cols">
          <div v-for="col in 16" :key="col" class="hex-col header-col">
            {{ (col - 1).toString(16).toUpperCase() }}
          </div>
        </div>
        <div class="ascii-col header-ascii">ASCII</div>
      </div>

      <!-- 16进制内容区 -->
      <div
        class="hex-content"
        ref="hexContentRef"
        @contextmenu.prevent="handleContextMenu"
      >
        <canvas ref="hexCanvas" class="hex-canvas"></canvas>
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
import { ElMessage } from "element-plus";

import HexContextMenu from "./HexContextMenu.vue";
import HexRenderer from "./HexRenderer.js";

// 常量定义
const HEX_PER_ROW = 16;
const ROW_HEIGHT = 18;

// Props定义
const props = defineProps({
  hexData: {
    type: Object,
    required: true,
  },
  asciiData: {
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
  // 新增：加载状态（从父组件传递）
  isLoading: {
    type: Boolean,
    default: false,
  },
  loadingProgress: {
    type: Number,
    default: 0,
  },
});

// 事件定义
const emit = defineEmits([
  "edit-change",
  "selection-change",
  "copy",
  "cut",
  "delete",
  "edit",
  "node-click",
  "visible-range-change", // 新增：通知父组件可视区域变化
]);

// 响应式数据
const hexViewRef = ref(null);
const hexHeaderRef = ref(null);
const hexContentRef = ref(null);
const hexCanvas = ref(null);
const addrColWidth = computed(() => 8 * 12 + 10);
const totalHeight = ref(0);

const showContextMenu = ref(false);
const menuX = ref(0);
const menuY = ref(0);

// 渲染器实例
let hexRenderer = null;

// 初始化渲染器
const initRenderer = () => {
  if (!hexContentRef.value || !hexCanvas.value) return;
  totalHeight.value = Math.ceil(props.totalBytes / 16) * ROW_HEIGHT;
  hexRenderer = new HexRenderer({
    canvas: hexCanvas.value,
    container: hexContentRef.value,
    hexPerRow: HEX_PER_ROW,
    rowHeight: ROW_HEIGHT,
    addrColWidth: addrColWidth.value,
    totalBytes: props.totalBytes
  });

  // 监听可视区域变化，通知父组件
  hexRenderer.onVisibleRangeChange = (startAddr, endAddr) => {
    emit("visible-range-change", startAddr, endAddr);
  };

  // 绑定回调事件
  hexRenderer.onClick = (addr) => {
    emit("node-click", addr);
    emit("selection-change", { start: addr, end: addr });
  };

  hexRenderer.onDblClick = (addr) => {
    emit("edit", { start: addr, end: addr });
  };

  hexRenderer.onSelectionChange = (range) => {
    emit("selection-change", range);
  };

  // 设置初始数据（适配新的数据结构）
  hexRenderer.setData(
    {
      get: (addr) => props.hexData.get(addr),
      length: props.hexData.length,
    },
    {
      get: (addr) => props.asciiData.get(addr),
      length: props.asciiData.length,
    }
  );

  hexRenderer.init();
};

// 滚动到指定地址（供父组件调用）
const scrollToAddr = (addr) => {
  if (!hexContentRef.value || !hexRenderer) return;

  const row = Math.floor(addr / HEX_PER_ROW);
  const scrollTop = row * ROW_HEIGHT;
  hexContentRef.value.scrollTop = scrollTop;

  // 强制更新可视区域并渲染
  hexRenderer.calcVisibleRange();
  hexRenderer.render();
};

// 右键菜单处理
const handleContextMenu = (e) => {
  showContextMenu.value = true;
  menuX.value = e.clientX;
  menuY.value = e.clientY;
};

// 菜单操作处理
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

// 暴露方法给父组件
defineExpose({
  // 设置颜色区块（高亮范围）
  setColorRanges: (ranges) => {
    if (hexRenderer) {
      hexRenderer.setColorRanges(ranges);
    }
  },
  // 根据节点ID高亮
  highlightNodeById: (nodeId) => {
    if (!hexRenderer || !nodeId || !props.treeNodes[nodeId]) return;
    const node = props.treeNodes[nodeId];
    setColorRanges([
      {
        start: node.start,
        end: node.end,
        color: "rgba(255, 0, 0, 0.2)", // 默认颜色
      },
    ]);
  },
  // 根据节点数据高亮
  highlightNode: (nodeData) => {
    if (!hexRenderer || !nodeData) return;
    setColorRanges([
      {
        start: nodeData.start || nodeData.startAddr,
        end: nodeData.end || nodeData.endAddr,
        color: nodeData.color || "rgba(255, 0, 0, 0.2)",
      },
    ]);
  },
  // 高亮多个节点
  highlightNodes: (nodesData) => {
    if (!hexRenderer || !nodesData) return;
    const ranges = nodesData.map((node) => ({
      start: node.start || node.startAddr,
      end: node.end || node.endAddr,
      color: node.color || "rgba(255, 0, 0, 0.2)",
    }));
    setColorRanges(ranges);
  },
  // 清除所有高亮
  clearHighlights: () => {
    if (hexRenderer) {
      hexRenderer.setColorRanges([]);
    }
  },
  scrollToAddr, // 新增：暴露滚动方法
});

// 生命周期
onMounted(() => {
  // 延迟初始化，确保容器尺寸正确
  const initTimer = setTimeout(() => {
    nextTick(() => {
      initRenderer();
    });
  }, 100);

  onUnmounted(() => {
    clearTimeout(initTimer);
    hexRenderer?.destroy();
    document.removeEventListener("mouseup", () => {});
  });
});

onUnmounted(() => {
  hexRenderer?.destroy();
  document.removeEventListener("mouseup", () => {});
});

// 监听数据变化，更新渲染器
watch(
  () => [props.hexData, props.asciiData],
  () => {
    if (hexRenderer) {
      hexRenderer.setData(
        {
          get: (addr) => props.hexData.get(addr),
          length: props.hexData.length,
        },
        {
          get: (addr) => props.asciiData.get(addr),
          length: props.asciiData.length,
        }
      );
    }
  },
  { deep: true }
);

watch(
  () => props.isEditing,
  () => {
    if (hexRenderer) {
      hexRenderer.setEditMode(props.isEditing, props.editRange);
    }
  }
);

watch(
  () => props.totalBytes,
  () => {
    if (hexRenderer) {
      hexRenderer.updateTotalBytes(props.totalBytes);
    }
  }
);

watch(
  () => props.editRange,
  () => {
    if (hexRenderer) {
      hexRenderer.setEditMode(props.isEditing, props.editRange);
    }
  },
  { deep: true }
);

watch(
  () => props.selectedAddrRange,
  (newRange) => {
    if (hexRenderer) {
      hexRenderer.setSelectedRange(newRange);
    }
  },
  { deep: true }
);
</script>

<style scoped>
.hex-view-panel {
  height: 100%;
  position: relative;
  overflow: hidden;
}

/* 加载进度样式 */
.loading-mask {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 9999;
  background: rgba(255, 255, 255, 0.8);
  padding: 20px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.loading-text {
  font-size: 14px;
  color: #666;
}

.hex-header {
  display: flex;
  height: 30px;
  line-height: 30px;
  background: #f8f9fa;
  position: sticky;
  top: 0;
  z-index: 10;
  border-bottom: 1px solid #e5e7eb;
}

.addr-col {
  text-align: center;
  color: #999;
  user-select: none;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 100px;
}

.hex-cols {
  display: flex;
  height: 100%;
}

.hex-col {
  width: 24px;
  text-align: center;
  font-family: monospace;
  user-select: none;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ascii-col {
  width: 200px;
  text-align: center;
  user-select: none;
  padding: 0 10px;
  box-sizing: border-box;
  height: 100%;
}

.hex-content {
  height: 100%;
  position: relative;
  overflow-y: auto;
  scrollbar-width: thin;
}

.hex-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  cursor: default;
}
</style>
