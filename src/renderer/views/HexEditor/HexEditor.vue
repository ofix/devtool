<template>
  <TitleBar title="DevTool" wndKey="HexEditorWnd"/>
  <div class="hex-editor-container">
    <!-- 顶部菜单 -->
    <HexMenuBar
      @open-file="handleOpenFile"
      @jump-addr="showJumpDialog = true"
      @undo="handleUndo"
      @redo="handleRedo"
      :undo-disabled="!editHistory.length || currentHistoryIndex < 0"
      :redo-disabled="
        !editHistory.length || currentHistoryIndex >= editHistory.length - 1
      "
    />

    <!-- 跳转地址弹窗 -->
    <HexJumpDialog
      v-model="showJumpDialog"
      :current-addr="jumpAddr"
      @confirm="handleJump"
    />

    <!-- 主体内容 -->
    <el-splitter
      layout="horizontal"
      style="height: 100vh; width: 100vw"
    >
      <!-- 左侧树面板 -->
      <HexTreePanel
        :tree-data="treeData"
        :locked-nodes="lockedNodes"
        @hex-row-click="handleTreeRowClick"
        @lock-node="handleLockNode"
        @edit-node="handleEditNode"
        @delete-node="handleDeleteNode"
      />

      <!-- 中间16进制展示区 -->
      <HexContentView
        ref="hexViewRef"
        :data-manager="dataManager"
        :total-bytes="totalDataBytes"
        :locked-nodes="lockedNodes"
        :is-editing="isEditing"
        :edit-range="editRange"
        :selected-addr-range="selectedAddrRange"
        @selection-change="handleSelectionChange"
        @copy="handleCopy"
        @cut="handleCut"
        @delete="handleDelete"
        @edit="handleEdit"
      />

      <!-- 右侧操作历史面板 -->
      <HexHistoryPanel
        :history-list="displayHistory"
        @history-click="handleHistoryClick"
      />
    </el-splitter>

    <!-- 颜色选择器 -->
    <HexColorPicker
      v-model="showColorPicker"
      :color="selectedColor"
      :position="{ x: colorPickerX, y: colorPickerY }"
      @confirm="handleColorSelect"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import TitleBar from "@/components/TitleBar.vue";
import { hexDataManager } from "./HexDataManager.js";

// 导入子组件
import HexMenuBar from "./HexMenuBar.vue";
import HexTreePanel from "./HexTreePanel.vue";
import HexContentView from "./HexContentView.vue";
import HexHistoryPanel from "./HexHistoryPanel.vue";
import HexJumpDialog from "./HexJumpDialog.vue";
import HexColorPicker from "./HexColorPicker.vue";

// ===================== 常量 =====================
const HEX_PER_ROW = 16;
const ROW_HEIGHT = 30;

// ===================== 状态 =====================
const hexViewRef = ref(null);

const dataManager = hexDataManager; // 直接引用单例

// 其他状态
const totalDataBytes = ref(0);
const deletedAddrs = ref(new Set());
const isEditing = ref(false);
const editRange = ref({ start: 0, end: 0 });
const jumpAddr = ref("");
const selectedAddrRange = ref({ start: -1, end: -1 });
const selectedNode = ref(null);
const lockedNodes = ref({});
const showColorPicker = ref(false);
const selectedColor = ref("#666666");
const colorPickerX = ref(0);
const colorPickerY = ref(0);
const editHistory = ref([]);
const currentHistoryIndex = ref(-1);
const showJumpDialog = ref(false);

const HEX_COLORS = [
  "#FCE4EC",
  "#FF9900",
  "#FFFF00",
  "#00FF00",
  "#00FFFF",
  "#0099FF",
  "#0000FF",
  "#9900FF",
  "#FF00FF",
  "#FF0099",
  "#666666",
  "#999999",
  "#333333",
  "#0066CC",
  "#669900",
  "#CC3300",
];
const treeData = ref([
  {
    id: 1,
    name: "Header",
    addrStart: 0x00,
    addrEnd: 0x1f,
    type: "block",
    color: HEX_COLORS[0],
    children: [
      { id: 11, name: "Magic", addrStart: 0x00, addrEnd: 0x03, type: "string" },
      {
        id: 12,
        name: "Version",
        addrStart: 0x04,
        addrEnd: 0x07,
        type: "digit",
      },
    ],
  },
  {
    id: 2,
    name: "Data",
    addrStart: 0x27,
    addrEnd: 0x32,
    type: "table",
    color: HEX_COLORS[1],
    children: [
      { id: 21, name: "Flags", addrStart: 0x20, addrEnd: 0x23, type: "bit" },
      { id: 22, name: "Length", addrStart: 0x24, addrEnd: 0x27, type: "digit" },
    ],
  },
]);

// ===================== 计算属性 =====================
// 给子组件的渲染数据（按需返回地址对应的值）
const hexData = computed(() => ({
  get: (addr) => {
    // 优先返回删除标记 → 编辑后数据 → 缓存分片数据 → 默认--
    if (deletedAddrs.value.has(addr)) return "--";
    if (currentChunkData.value.hex[addr] !== undefined)
      return currentChunkData.value.hex[addr];
    return "--";
  },
  length: totalDataBytes.value,
}));

const asciiData = computed(() => ({
  get: (addr) => {
    if (deletedAddrs.value.has(addr)) return ".";
    if (currentChunkData.value.ascii[addr] !== undefined)
      return currentChunkData.value.ascii[addr];
    return ".";
  },
  length: totalDataBytes.value,
}));

const displayHistory = computed(() => {
  return editHistory.value.map((item, index) => ({
    ...item,
    isDisabled: index > currentHistoryIndex.value,
  }));
});

// ===================== 核心方法 =====================
// 初始化测试数据
const initHexData = (startAddr = 0, length = 1024) => {
  totalDataBytes.value = length;
  currentChunkData.value = { hex: {}, ascii: {} };
  chunkCache.value.clear();

  for (let i = startAddr; i < startAddr + length; i++) {
    const hex = Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0");
    currentChunkData.value.hex[i] = hex;
    const charCode = parseInt(hex, 16);
    const ascii =
      charCode >= 32 && charCode <= 126 ? String.fromCharCode(charCode) : ".";
    currentChunkData.value.ascii[i] = ascii;
  }

  maxAddrLength.value = (startAddr + length - 1).toString(16).length;
};

// 打开文件
const handleOpenFile = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "*/*";
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 重置状态
    deletedAddrs.value.clear();
    editHistory.value = [];
    currentHistoryIndex.value = -1;

    // 通过数据管理器加载文件
    dataManager.loadFile(file);

    ElMessage.success(`开始加载文件：${file.name}`);
  };
  input.click();
};

// 跳转地址（核心优化：直接加载目标分片）
const handleJump = (addrStr) => {
  if (!addrStr) {
    ElMessage.warning("请输入跳转地址");
    showJumpDialog.value = false;
    return;
  }

  let addr = 0;
  try {
    addr = parseInt(addrStr.startsWith("0x") ? addrStr.slice(2) : addrStr, 16);
  } catch (e) {
    ElMessage.error("地址格式错误，请输入16进制（如 0x100）或十进制数");
    return;
  }

  if (addr < 0 || addr >= totalDataBytes.value) {
    ElMessage.error(
      `地址超出范围（0 - 0x${(totalDataBytes.value - 1).toString(16).toUpperCase()}）`
    );
    return;
  }

  // 标记为跳转操作，避免滚动触发重复加载
  isJumping.value = true;

  // 加载目标地址所在的分片
  loadFileChunk(addr, addr + HEX_PER_ROW * 10).then(() => {
    // 更新选中范围并通知子组件滚动
    selectedAddrRange.value = { start: addr, end: addr };
    hexViewRef.value?.scrollToAddr(addr);
    ElMessage.success(`已跳转到地址 0x${addr.toString(16).toUpperCase()}`);
  });

  showJumpDialog.value = false;
};

// 编辑数据（核心优化：仅更新当前分片数据）
const handleEditChange = (addr, value) => {
  // 更新当前分片数据
  currentChunkData.value.hex[addr] = value;
  deletedAddrs.value.delete(addr);

  // 更新ASCII
  const charCode = parseInt(value, 16);
  currentChunkData.value.ascii[addr] =
    charCode >= 32 && charCode <= 126 ? String.fromCharCode(charCode) : ".";

  // 同步更新缓存
  for (const [chunkStart, chunkData] of chunkCache.value) {
    if (addr >= chunkStart && addr <= chunkData.end) {
      chunkData.hex[addr] = value;
      chunkData.ascii[addr] = currentChunkData.value.ascii[addr];
      break;
    }
  }
};

// 其他方法（保留原有逻辑，仅调整数据读取方式）
const handleTreeRowClick = (data) => {
  hexViewRef.value?.setColorRanges([
    {
      start: data.addrStart,
      end: data.addrEnd,
      color: data.color ? data.color : HEX_COLORS[0],
    },
  ]);
};

const handleLockNode = (node) => {
  lockedNodeTemp = node;
  showColorPicker.value = true;
  const nodeEl = document.querySelector(`[data-node-id="${node.id}"]`);
  if (nodeEl) {
    const rect = nodeEl.getBoundingClientRect();
    colorPickerX.value = rect.right + 10;
    colorPickerY.value = rect.top;
  }
  selectedColor.value = lockedNodes.value[node.id]?.color || "#666666";
};

const handleColorSelect = (color) => {
  if (!lockedNodeTemp) return;

  showColorPicker.value = false;

  if (lockedNodes.value[lockedNodeTemp.id]) {
    delete lockedNodes.value[lockedNodeTemp.id];
    ElMessage.success(`已解锁 ${lockedNodeTemp.name}`);
  } else {
    lockedNodes.value[lockedNodeTemp.id] = {
      color,
      start: lockedNodeTemp.addrStart,
      end: lockedNodeTemp.addrEnd,
    };
    ElMessage.success(`已锁定 ${lockedNodeTemp.name} (${color})`);
  }
};

const handleEditNode = (node) => {
  isEditing.value = true;
  editRange.value = { start: node.addrStart, end: node.addrEnd };
  selectedNode.value = node;
  ElMessage.info(`进入编辑模式：${node.name}`);
};

const handleDeleteNode = async (node) => {
  try {
    await ElMessageBox.confirm(`确定要删除 ${node.name} 数据块吗？`, "警告", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    });

    // 标记删除
    for (let i = node.addrStart; i <= node.addrEnd; i++) {
      deletedAddrs.value.add(i);
      // 清空当前分片数据中的对应值
      delete currentChunkData.value.hex[i];
      delete currentChunkData.value.ascii[i];
      // 同步清空缓存
      for (const [, chunkData] of chunkCache.value) {
        delete chunkData.hex[i];
        delete chunkData.ascii[i];
      }
    }

    // 记录操作
    const deletedData = [];
    for (let i = node.addrStart; i <= node.addrEnd; i++) {
      deletedData.push(hexData.value.get(i));
    }
    const historyItem = createHistoryItem("删除", deletedData.join(" "), {
      start: node.addrStart,
      end: node.addrEnd,
    });
    editHistory.value.push(historyItem);
    currentHistoryIndex.value = editHistory.value.length - 1;

    ElMessage.success(`已删除 ${node.name}`);
  } catch (e) {
    ElMessage.info("已取消删除");
  }
};

const handleCopy = () => {
  const { start, end } = selectedAddrRange.value;
  if (start === -1 || end === -1) return;

  const copyData = [];
  for (let i = start; i <= end; i++) {
    copyData.push(hexData.value.get(i).toUpperCase());
  }
  navigator.clipboard.writeText(copyData.join(" "));

  const historyItem = createHistoryItem("复制", copyData.join(" "));
  editHistory.value.push(historyItem);
  currentHistoryIndex.value = editHistory.value.length - 1;

  ElMessage.success("已复制选中的16进制数据");
};

const handleCut = () => {
  const { start, end } = selectedAddrRange.value;
  if (start === -1 || end === -1) return;

  // 保存剪切数据
  const cutData = [];
  for (let i = start; i <= end; i++) {
    cutData.push(hexData.value.get(i).toUpperCase());
  }
  navigator.clipboard.writeText(cutData.join(" "));

  // 标记删除
  for (let i = start; i <= end; i++) {
    deletedAddrs.value.add(i);
    delete currentChunkData.value.hex[i];
    delete currentChunkData.value.ascii[i];
    // 同步清空缓存
    for (const [, chunkData] of chunkCache.value) {
      delete chunkData.hex[i];
      delete chunkData.ascii[i];
    }
  }

  // 记录操作
  const historyItem = createHistoryItem("剪切", cutData.join(" "), {
    start,
    end,
  });
  editHistory.value.push(historyItem);
  currentHistoryIndex.value = editHistory.value.length - 1;

  ElMessage.success("已剪切选中的16进制数据");
};

const handleDelete = () => {
  const { start, end } = selectedAddrRange.value;
  if (start === -1 || end === -1) return;

  // 保存删除前数据
  const deletedData = [];
  for (let i = start; i <= end; i++) {
    deletedData.push(hexData.value.get(i).toUpperCase());
  }

  // 标记删除
  for (let i = start; i <= end; i++) {
    deletedAddrs.value.add(i);
    delete currentChunkData.value.hex[i];
    delete currentChunkData.value.ascii[i];
    // 同步清空缓存
    for (const [, chunkData] of chunkCache.value) {
      delete chunkData.hex[i];
      delete chunkData.ascii[i];
    }
  }

  // 记录操作
  const historyItem = createHistoryItem("删除", deletedData.join(" "), {
    start,
    end,
  });
  editHistory.value.push(historyItem);
  currentHistoryIndex.value = editHistory.value.length - 1;

  ElMessage.success("已删除选中的16进制数据");
};

const handleEdit = () => {
  const { start, end } = selectedAddrRange.value;
  if (start === -1 || end === -1) return;

  isEditing.value = true;
  editRange.value = { start, end };
  ElMessage.info("进入编辑模式");
};

const handleHistoryClick = (row) => {
  const index = editHistory.value.findIndex((item) => item === row);
  if (index === -1) return;

  currentHistoryIndex.value = index;
  ElMessage.info(`已回滚到【${row.type}】操作`);
};

const handleUndo = () => {
  if (currentHistoryIndex.value >= 0) {
    currentHistoryIndex.value--;
    ElMessage.success("已撤销上一步操作");
  }
};

const handleRedo = () => {
  if (currentHistoryIndex.value < editHistory.value.length - 1) {
    currentHistoryIndex.value++;
    ElMessage.success("已重做上一步操作");
  }
};

const createHistoryItem = (type, change, addrRange = null) => {
  const formattedChange = formatChangeData(type, change, addrRange);

  return {
    type,
    change,
    addrRange,
    originalData: addrRange
      ? Array.from({ length: addrRange.end - addrRange.start + 1 }, (_, i) =>
          hexData.value.get(addrRange.start + i)
        )
      : [],
    formattedChange,
    expanded: false,
    displayLines: formattedChange.split("<br/>").length,
    firstThreeLinesLength: 0,
    isDisabled: false,
  };
};

const formatChangeData = (type, change, addrRange) => {
  let formatted = "";

  const splitLines = (data) => {
    const parts = data.split(" ");
    const lines = [];
    let currentLine = [];

    parts.forEach((part) => {
      if (part && part !== "--") {
        currentLine.push(part.toUpperCase());
        if (currentLine.length === 16) {
          lines.push(currentLine.join(" "));
          currentLine = [];
        }
      }
    });

    if (currentLine.length > 0) {
      lines.push(currentLine.join(" "));
    }
    return lines;
  };

  const lines = splitLines(change);

  if (type === "修改") {
    formatted += '<div class="change-block original">修改前：<br/>';
    lines.forEach(
      (line) => (formatted += `<div class="data-line">${line}</div>`)
    );
    formatted += "</div>";

    const newData = addrRange
      ? Array.from({ length: addrRange.end - addrRange.start + 1 }, (_, i) =>
          hexData.value.get(addrRange.start + i)
        ).join(" ")
      : "";
    const newLines = splitLines(newData);
    formatted += '<div class="change-block modified">修改后：<br/>';
    newLines.forEach(
      (line) => (formatted += `<div class="data-line">${line}</div>`)
    );
    formatted += "</div>";
  } else if (type === "删除") {
    formatted += '<div class="change-block deleted">删除前：<br/>';
    lines.forEach(
      (line) => (formatted += `<div class="data-line">${line}</div>`)
    );
    formatted += "</div>";
  } else if (type === "新增") {
    formatted += '<div class="change-block added">新增后：<br/>';
    lines.forEach(
      (line) => (formatted += `<div class="data-line">${line}</div>`)
    );
    formatted += "</div>";
  } else {
    lines.forEach(
      (line) => (formatted += `<div class="data-line">${line}</div>`)
    );
  }

  return formatted;
};

const handleSelectionChange = (range) => {
  selectedAddrRange.value = range;
};

// 生命周期
onMounted(() => {
  // 监听数据管理器事件
  dataManager.addListener(handleDataEvent);
});

onUnmounted(() => {
  dataManager.removeListener(handleDataEvent);
});

const handleDataEvent = (event) => {
  switch (event.type) {
    case "file-loaded":
      totalDataBytes.value = event.totalBytes;
      console.log(`文件加载完成，共 ${event.totalBytes} 字节`);
      break;
    case "progress":
      // 可以在这里更新进度条
      break;
    case "data-updated":
      // 触发视图更新
      hexViewRef.value?.requestRender();
      break;
  }
};
</script>

<style scoped>
.hex-editor-container {
  height: calc(100vh - var(--dt-titlebar-height));
  width: 100vw;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
