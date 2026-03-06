<template>
  <el-splitter-panel :size="800" :min-size="700">
    <div class="hex-view-panel" ref="hexViewRef" @scroll="handleScroll">
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
        <!-- Canvas分层渲染 -->
        <div class="canvas-container" ref="canvasContainer">
          <canvas ref="lockCanvas" class="hex-canvas"></canvas>
          <canvas ref="selectionCanvas" class="hex-canvas"></canvas>
        </div>

        <!-- 数据展示层 -->
        <div class="visible-content">
          <div v-for="row in visibleRows" :key="row.addr" class="hex-row">
            <!-- 地址列 -->
            <div class="addr-col" :style="{ width: `${addrColWidth}px` }">
              0x{{ row.addr.toString(16).padStart(8, "0").toUpperCase() }}
            </div>

            <!-- 16进制数据列 -->
            <div class="hex-cols">
              <div
                v-for="(hex, idx) in row.hexData"
                :key="idx"
                class="hex-col data-col"
                :class="{
                  'edit-mode':
                    isEditing &&
                    row.addr + idx >= editRange.start &&
                    row.addr + idx <= editRange.end,
                  selected: isSelected(row.addr + idx),
                }"
                @click="handleHexClick(row.addr + idx)"
                @dblclick="handleHexDblClick(row.addr + idx)"
                @keydown="handleKeydown"
                @mousedown="handleSelectionStart(row.addr + idx)"
                @mouseup="handleSelectionEnd"
                :contenteditable="
                  isEditing &&
                  row.addr + idx >= editRange.start &&
                  row.addr + idx <= editRange.end
                "
                :data-addr="row.addr + idx"
              >
                {{ hex.toUpperCase() }}
              </div>
            </div>

            <!-- ASCII列 -->
            <div class="ascii-col">
              <span
                v-for="(char, idx) in row.asciiData"
                :key="idx"
                class="ascii-char"
                :class="{ selected: isSelected(row.addr + idx) }"
                @click="handleAsciiClick(row.addr + idx)"
                @mousedown="handleSelectionStart(row.addr + idx)"
                @mouseup="handleSelectionEnd"
                :data-addr="row.addr + idx"
              >
                {{ char }}
              </span>
            </div>
          </div>
        </div>
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

// 常量定义
const HEX_PER_ROW = 16;
const ROW_HEIGHT = 30;

// 定义Props
const props = defineProps({
  hexData: {
    type: Array,
    required: true,
  },
  asciiData: {
    type: Array,
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

// 定义事件
const emit = defineEmits([
  "edit-change",
  "selection-change",
  "copy",
  "cut",
  "delete",
  "edit",
]);

// 响应式数据
const hexViewRef = ref(null);
const hexHeaderRef = ref(null);
const hexContentRef = ref(null);
const canvasContainer = ref(null);
const lockCanvas = ref(null);
const selectionCanvas = ref(null);

const scrollTop = ref(0);
const visibleStartRow = ref(0);
const addrColWidth = computed(() => 8 * 12 + 10); // 地址列宽度

const showContextMenu = ref(false);
const menuX = ref(0);
const menuY = ref(0);

// 选中相关
let selectionStartAddr = ref(-1);
let isDraggingSelection = ref(false);

// 计算属性
const totalRows = computed(() => Math.ceil(props.hexData.length / HEX_PER_ROW));
const visibleRows = computed(() => {
  const rows = [];
  const endRow = Math.min(visibleStartRow.value + 50, totalRows.value); // 每次渲染50行
  for (let i = visibleStartRow.value; i < endRow; i++) {
    const startIdx = i * HEX_PER_ROW;
    const endIdx = Math.min(startIdx + HEX_PER_ROW, props.hexData.length);
    rows.push({
      addr: startIdx,
      hexData: props.hexData.slice(startIdx, endIdx),
      asciiData: props.asciiData.slice(startIdx, endIdx),
    });
  }
  return rows;
});

// 方法
const isSelected = (addr) => {
  return (
    addr >= props.selectedAddrRange.start && addr <= props.selectedAddrRange.end
  );
};

// Canvas初始化
const initCanvas = () => {
  if (!canvasContainer.value) return;

  const rect = canvasContainer.value.getBoundingClientRect();
  const canvases = [lockCanvas.value, selectionCanvas.value];
  canvases.forEach((canvas) => {
    canvas.width = rect.width;
    canvas.height = rect.height;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  });
};

// 渲染锁定层
const renderLockLayer = () => {
  if (!lockCanvas.value) return;

  const ctx = lockCanvas.value.getContext("2d");
  ctx.clearRect(0, 0, lockCanvas.value.width, lockCanvas.value.height);

  // 遍历锁定节点
  Object.values(props.lockedNodes).forEach((node) => {
    const { start, end, color } = node;
    if (start === undefined || end === undefined) return;

    // 计算行范围
    const startRow = Math.floor(start / HEX_PER_ROW);
    const endRow = Math.floor(end / HEX_PER_ROW);

    // 只渲染可视区域内的行
    if (endRow < visibleStartRow.value || startRow > visibleStartRow.value + 50)
      return;

    for (let row = startRow; row <= endRow; row++) {
      const rowTop = (row - visibleStartRow.value) * ROW_HEIGHT;
      const rowStartAddr = row * HEX_PER_ROW;
      const colStart = Math.max(start - rowStartAddr, 0);
      const colEnd = Math.min(end - rowStartAddr, HEX_PER_ROW - 1);

      // 绘制背景
      ctx.fillStyle = color;
      ctx.fillRect(
        addrColWidth.value + colStart * 30,
        rowTop,
        (colEnd - colStart + 1) * 30,
        ROW_HEIGHT
      );

      // 绘制ASCII背景
      const asciiStartX = addrColWidth.value + HEX_PER_ROW * 30 + 10;
      ctx.fillRect(
        asciiStartX + colStart * 12,
        rowTop,
        (colEnd - colStart + 1) * 12,
        ROW_HEIGHT
      );

      // 绘制白色文字
      ctx.fillStyle = "white";
      ctx.font = "14px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // 16进制文字
      for (let col = colStart; col <= colEnd; col++) {
        const addr = rowStartAddr + col;
        if (addr > end) break;
        const x = addrColWidth.value + col * 30 + 15;
        const y = rowTop + 15;
        ctx.fillText((props.hexData[addr] || "--").toUpperCase(), x, y);
      }

      // ASCII文字
      for (let col = colStart; col <= colEnd; col++) {
        const addr = rowStartAddr + col;
        if (addr > end) break;
        const x = asciiStartX + col * 12 + 6;
        const y = rowTop + 15;
        ctx.fillText(props.asciiData[addr] || ".", x, y);
      }
    }
  });
};

// 渲染选中层
const renderSelectionLayer = () => {
  if (!selectionCanvas.value) return;

  const ctx = selectionCanvas.value.getContext("2d");
  ctx.clearRect(
    0,
    0,
    selectionCanvas.value.width,
    selectionCanvas.value.height
  );

  const { start, end } = props.selectedAddrRange;
  if (start === -1 || end === -1) return;

  // 绘制选中框
  ctx.strokeStyle = "#0099FF";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 3]);
  ctx.beginPath();

  const startRow = Math.floor(start / HEX_PER_ROW);
  const endRow = Math.floor(end / HEX_PER_ROW);
  const startRowTop = (startRow - visibleStartRow.value) * ROW_HEIGHT;
  const endRowTop = (endRow - visibleStartRow.value) * ROW_HEIGHT;

  const startCol = start % HEX_PER_ROW;
  const endCol = end % HEX_PER_ROW;

  // 16进制选中框
  ctx.rect(
    addrColWidth.value + startCol * 30,
    startRowTop,
    (endCol - startCol + 1) * 30 + (endRow - startRow) * HEX_PER_ROW * 30,
    endRowTop + ROW_HEIGHT - startRowTop
  );

  // ASCII选中框
  const asciiStartX = addrColWidth.value + HEX_PER_ROW * 30 + 10;
  ctx.rect(
    asciiStartX + startCol * 12,
    startRowTop,
    (endCol - startCol + 1) * 12 + (endRow - startRow) * HEX_PER_ROW * 12,
    endRowTop + ROW_HEIGHT - startRowTop
  );

  ctx.stroke();
  ctx.setLineDash([]);
};

// 滚动处理
const handleScroll = (e) => {
  scrollTop.value = e.target.scrollTop;
  visibleStartRow.value = Math.floor(scrollTop.value / ROW_HEIGHT);
  // 重新渲染Canvas
  renderLockLayer();
  renderSelectionLayer();
};

// 选中处理
const handleSelectionStart = (addr) => {
  selectionStartAddr.value = addr;
  emit("selection-change", { start: addr, end: addr });
  isDraggingSelection.value = true;
  document.addEventListener("mousemove", handleSelectionDrag);
};

const handleSelectionDrag = (e) => {
  if (!isDraggingSelection.value) return;

  // 获取鼠标下的元素地址
  const targetEl = document.elementFromPoint(e.clientX, e.clientY);
  let currentAddr = -1;

  if (targetEl) {
    if (targetEl.dataset.addr) {
      currentAddr = parseInt(targetEl.dataset.addr);
    } else if (targetEl.parentElement?.dataset.addr) {
      currentAddr = parseInt(targetEl.parentElement.dataset.addr);
    }
  }

  if (currentAddr !== -1 && currentAddr !== selectionStartAddr.value) {
    emit("selection-change", {
      start: Math.min(selectionStartAddr.value, currentAddr),
      end: Math.max(selectionStartAddr.value, currentAddr),
    });
    renderSelectionLayer();
  }
};

const handleSelectionEnd = () => {
  if (isDraggingSelection.value) {
    isDraggingSelection.value = false;
    document.removeEventListener("mousemove", handleSelectionDrag);
  }
};

const handleHexClick = (addr) => {
  emit("selection-change", { start: addr, end: addr });
};

const handleAsciiClick = (addr) => {
  emit("selection-change", { start: addr, end: addr });
};

// 编辑处理
const handleHexDblClick = (addr) => {
  // 进入编辑模式
  emit("edit", { start: addr, end: addr });
};

const handleKeydown = (e) => {
  const el = e.target;
  const addr = parseInt(el.dataset.addr);

  // 禁止默认删除行为
  if (e.key === "Backspace" || e.key === "Delete") {
    e.preventDefault();
    emit("edit-change", addr, "--");
    return;
  }

  // 只允许16进制字符
  const validChars = /^[0-9a-fA-F]$/;
  if (e.key.length === 1 && !validChars.test(e.key)) {
    e.preventDefault();
    ElMessage.warning("仅允许输入16进制字符（0-9, a-f, A-F）");
    return;
  }

  // 处理输入
  setTimeout(() => {
    let content = el.textContent.trim().toUpperCase();
    if (content.length > 2) content = content.slice(0, 2);
    else if (content.length < 2) content = content.padStart(2, "0");

    el.textContent = content;
    emit("edit-change", addr, content);

    // 自动切换到下一个字节
    if (content.length === 2 && props.isEditing) {
      const nextAddr = addr + 1;
      if (nextAddr <= props.editRange.end) {
        const nextEl = document.querySelector(`[data-addr="${nextAddr}"]`);
        if (nextEl) {
          nextEl.focus();
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(nextEl);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }
  }, 0);
};

// 右键菜单
const handleContextMenu = (e) => {
  const { start, end } = props.selectedAddrRange;
  if (start === -1) return;

  showContextMenu.value = true;
  menuX.value = e.clientX;
  menuY.value = e.clientY;
};

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

// 生命周期
onMounted(() => {
  nextTick(() => {
    initCanvas();
    renderLockLayer();
    renderSelectionLayer();
  });

  // 监听窗口大小变化
  window.addEventListener("resize", () => {
    initCanvas();
    renderLockLayer();
    renderSelectionLayer();
  });

  // 全局鼠标抬起事件
  document.addEventListener("mouseup", () => {
    if (isDraggingSelection.value) {
      handleSelectionEnd();
    }
  });
});

onUnmounted(() => {
  window.removeEventListener("resize", () => {
    initCanvas();
    renderLockLayer();
    renderSelectionLayer();
  });

  document.removeEventListener("mouseup", () => {
    if (isDraggingSelection.value) {
      handleSelectionEnd();
    }
  });
});

// 监听锁定节点变化
watch(
  () => props.lockedNodes,
  () => {
    renderLockLayer();
  },
  { deep: true }
);

// 监听选中范围变化
watch(
  () => props.selectedAddrRange,
  () => {
    renderSelectionLayer();
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

.hex-col.data-col {
  cursor: text;
  position: relative;
  z-index: 1;
}

.hex-col.data-col.selected {
  background-color: rgba(0, 153, 255, 0.2);
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

.ascii-char {
  width: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-family: monospace;
  position: relative;
  z-index: 1;
}

.ascii-char.selected {
  background-color: rgba(0, 153, 255, 0.2);
}

.hex-content {
  height: calc(100% - 30px);
  position: relative;
  overflow-y: auto;
  scrollbar-width: thin;
}

.canvas-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 2;
}

.hex-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.visible-content {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  z-index: 1;
}

.hex-row {
  display: flex;
  height: 30px;
  line-height: 30px;
}

.edit-mode {
  background-color: rgba(147, 112, 219, 0.1);
  border-radius: 2px;
}
</style>
