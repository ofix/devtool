<template>
  <el-splitter-panel :size="800" :min-size="700">
    <div class="hex-view-panel" ref="hexViewRef">
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

      <!-- 16进制内容区（仅保留容器和单个Canvas） -->
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
import HexRenderer from "./HexRenderer.js"; // 引入独立的渲染类

// 常量定义
const HEX_PER_ROW = 16;
const ROW_HEIGHT = 30;

// Props定义
const props = defineProps({
  hexData: {
    type: Array,
    required: true,
  },
  asciiData: {
    type: Array,
    required: true,
  },
  treeNodes: {
    // 树状结构化数据
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

// 事件定义
const emit = defineEmits([
  "edit-change",
  "selection-change",
  "copy",
  "cut",
  "delete",
  "edit",
  "node-click",
]);

// 响应式数据
const hexViewRef = ref(null);
const hexHeaderRef = ref(null);
const hexContentRef = ref(null);
const hexCanvas = ref(null);
const addrColWidth = computed(() => 8 * 12 + 10); // 地址列宽度

const showContextMenu = ref(false);
const menuX = ref(0);
const menuY = ref(0);

// 渲染器实例
let hexRenderer = null;

// 初始化渲染器
const initRenderer = () => {
  if (!hexContentRef.value || !hexCanvas.value) return;

  hexRenderer = new HexRenderer({
    canvas: hexCanvas.value,
    container: hexContentRef.value,
    hexPerRow: HEX_PER_ROW,
    rowHeight: ROW_HEIGHT,
    addrColWidth: addrColWidth.value,
  });

  // 绑定回调事件
  hexRenderer.onClick = (addr) => {
    // 查找点击地址所在的树节点
    const clickedNode = findNodeByAddr(addr);
    if (clickedNode) {
      emit("node-click", clickedNode);
    }
    emit("selection-change", { start: addr, end: addr });
  };

  hexRenderer.onDblClick = (addr) => {
    emit("edit", { start: addr, end: addr });
  };

  hexRenderer.onSelectionChange = (range) => {
    emit("selection-change", range);
  };

  // 设置初始数据
  hexRenderer.setData(props.hexData, props.asciiData);
  hexRenderer.setTreeNodes(props.treeNodes);
  hexRenderer.setEditMode(props.isEditing, props.editRange);
  hexRenderer.setSelectedRange(props.selectedAddrRange);
};

// 根据地址查找节点
const findNodeByAddr = (addr) => {
  for (const [id, node] of Object.entries(props.treeNodes)) {
    if (addr >= node.start && addr <= node.end) {
      return { id, ...node };
    }
  }
  return null;
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

// 设置颜色区块（高亮范围）
const setColorRanges = (ranges) => {
  if (hexRenderer) {
    hexRenderer.setColorRanges(ranges);
  }
};

// 根据节点ID高亮
const highlightNodeById = (nodeId) => {
  if (!hexRenderer || !nodeId || !props.treeNodes[nodeId]) return;

  const node = props.treeNodes[nodeId];
  setColorRanges([
    {
      start: node.start,
      end: node.end,
      color: "rgba(255, 0, 0, 0.2)", // 默认颜色
    },
  ]);
};

// 根据节点数据高亮
const highlightNode = (nodeData) => {
  if (!hexRenderer || !nodeData) return;

  setColorRanges([
    {
      start: nodeData.start || nodeData.startAddr,
      end: nodeData.end || nodeData.endAddr,
      color: nodeData.color || "rgba(255, 0, 0, 0.2)",
    },
  ]);
};

// 高亮多个节点
const highlightNodes = (nodesData) => {
  if (!hexRenderer || !nodesData) return;

  const ranges = nodesData.map((node) => ({
    start: node.start || node.startAddr,
    end: node.end || node.endAddr,
    color: node.color || "rgba(255, 0, 0, 0.2)",
  }));

  setColorRanges(ranges);
};

// 清除所有高亮
const clearHighlights = () => {
  if (hexRenderer) {
    hexRenderer.setColorRanges([]);
  }
};

// 暴露方法给父组件
defineExpose({
  setColorRanges,
  highlightNodeById,
  highlightNode,
  highlightNodes,
  clearHighlights,
});
// ============ 新增结束 ============

// 生命周期
onMounted(() => {
  nextTick(() => {
    initRenderer();
  });
});

onUnmounted(() => {
  hexRenderer?.destroy();
  document.removeEventListener("mouseup", () => {});
});

// 监听数据变化，更新渲染器
watch(
  () => props.hexData,
  () => {
    hexRenderer?.setData(props.hexData, props.asciiData);
  },
  { deep: true }
);

watch(
  () => props.treeNodes,
  (newNodes) => {
    hexRenderer?.setTreeNodes(newNodes);
  },
  { deep: true }
);

watch(
  () => props.isEditing,
  () => {
    hexRenderer?.setEditMode(props.isEditing, props.editRange);
  }
);

watch(
  () => props.editRange,
  () => {
    hexRenderer?.setEditMode(props.isEditing, props.editRange);
  },
  { deep: true }
);

// 监听选中范围变化，同步到渲染器
watch(
  () => props.selectedAddrRange,
  (newRange) => {
    // hexRenderer?.setSelectedRange(newRange);
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
  width: 30px;
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
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.hex-content {
  height: calc(100% - 30px);
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
