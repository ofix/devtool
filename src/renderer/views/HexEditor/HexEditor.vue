<template>
  <TitleBar title="DevTool" />
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
      style="height: calc(100vh - 40px); width: 100vw"
    >
      <!-- 左侧树面板 -->
      <HexTreePanel
        :tree-data="treeData"
        :locked-nodes="lockedNodes"
        @node-click="handleTreeClick"
        @lock-node="handleLockNode"
        @edit-node="handleEditNode"
        @delete-node="handleDeleteNode"
      />

      <!-- 中间16进制展示区 -->
      <HexContentView
        :hex-data="hexData"
        :ascii-data="asciiData"
        :locked-nodes="lockedNodes"
        :is-editing="isEditing"
        :edit-range="editRange"
        :selected-addr-range="selectedAddrRange"
        @edit-change="handleEditChange"
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

    <!-- 颜色选择器（全局单例） -->
    <HexColorPicker
      v-model="showColorPicker"
      :color="selectedColor"
      :position="{ x: colorPickerX, y: colorPickerY }"
      @confirm="handleColorSelect"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import TitleBar from "@/components/TitleBar.vue";

// 导入子组件
import HexMenuBar from "./HexMenuBar.vue";
import HexTreePanel from "./HexTreePanel.vue";
import HexContentView from "./HexContentView.vue";
import HexHistoryPanel from "./HexHistoryPanel.vue";
import HexJumpDialog from "./HexJumpDialog.vue";
import HexColorPicker from "./HexColorPicker.vue";

// ===================== 全局常量 =====================
const HEX_PER_ROW = 16;
const ROW_HEIGHT = 30;

// ===================== 全局状态 =====================
// 数据相关
const hexData = ref([]);
const asciiData = ref([]);
const totalDataLength = ref(1024);
const deletedAddrs = ref(new Set());
const maxAddrLength = ref(8);

// 编辑相关
const isEditing = ref(false);
const editRange = ref({ start: 0, end: 0 });
const originalHexData = ref([]);
const jumpAddr = ref("");

// 选中相关
const selectedAddrRange = ref({ start: -1, end: -1 });
const selectedNode = ref(null);

// 锁定相关
const lockedNodes = ref({});
const showColorPicker = ref(false);
const selectedColor = ref("#666666");
const colorPickerX = ref(0);
const colorPickerY = ref(0);
let lockedNodeTemp = null;

// 操作历史
const editHistory = ref([]);
const currentHistoryIndex = ref(-1);

// 弹窗控制
const showJumpDialog = ref(false);

// 树数据
const treeData = ref([
  {
    id: 1,
    name: "Header",
    addrStart: 0x00,
    addrEnd: 0x1f,
    type: "block",
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
    addrStart: 0x20,
    addrEnd: 0xff,
    type: "table",
    children: [
      { id: 21, name: "Flags", addrStart: 0x20, addrEnd: 0x23, type: "bit" },
      { id: 22, name: "Length", addrStart: 0x24, addrEnd: 0x27, type: "digit" },
    ],
  },
]);

// ===================== 计算属性 =====================
const displayHistory = computed(() => {
  return editHistory.value.map((item, index) => ({
    ...item,
    isDisabled: index > currentHistoryIndex.value,
  }));
});

const totalRows = computed(() => Math.ceil(hexData.value.length / HEX_PER_ROW));
const totalRowHeight = computed(() => totalRows.value * ROW_HEIGHT);

// ===================== 核心方法 =====================
// 初始化数据
const initHexData = (startAddr = 0, length = 1024) => {
  hexData.value = [];
  asciiData.value = [];
  totalDataLength.value = length;

  for (let i = startAddr; i < startAddr + length; i++) {
    const hex = Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0");
    hexData.value.push(hex);
    const charCode = parseInt(hex, 16);
    const ascii =
      charCode >= 32 && charCode <= 126 ? String.fromCharCode(charCode) : ".";
    asciiData.value.push(ascii);
  }

  maxAddrLength.value = (startAddr + length - 1).toString(16).length;
};

// 打开文件
const handleOpenFile = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "*";
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // 转换为16进制数据
      hexData.value = [];
      asciiData.value = [];
      totalDataLength.value = uint8Array.length;

      for (let i = 0; i < uint8Array.length; i++) {
        const hex = uint8Array[i].toString(16).padStart(2, "0");
        hexData.value.push(hex);
        const charCode = uint8Array[i];
        const ascii =
          charCode >= 32 && charCode <= 126
            ? String.fromCharCode(charCode)
            : ".";
        asciiData.value.push(ascii);
      }

      maxAddrLength.value = (totalDataLength.value - 1).toString(16).length;

      // 更新树节点数据
      treeData.value = [
        {
          id: 1,
          name: file.name,
          addrStart: 0x00,
          addrEnd: totalDataLength.value - 1,
          type: "file",
          children: [],
        },
      ];

      ElMessage.success(
        `成功加载文件：${file.name} (${totalDataLength.value} 字节)`
      );
    } catch (error) {
      ElMessage.error(`加载文件失败：${error.message}`);
    }
  };
  input.click();
};

// 跳转地址
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

  if (addr < 0 || addr >= hexData.value.length) {
    ElMessage.error(
      `地址超出范围（0 - 0x${(hexData.value.length - 1).toString(16).toUpperCase()}）`
    );
    return;
  }

  // 更新选中范围
  selectedAddrRange.value = { start: addr, end: addr };
  ElMessage.success(`已跳转到地址 0x${addr.toString(16).toUpperCase()}`);
  showJumpDialog.value = false;
};

// 树节点操作
const handleTreeClick = (data) => {
  selectedNode.value = data;
  ElMessage.success(`选中：${data.name}`);
};

const handleLockNode = (node) => {
  // 保存临时节点
  lockedNodeTemp = node;
  // 显示颜色选择器
  showColorPicker.value = true;
  const nodeEl = document.querySelector(`[data-node-id="${node.id}"]`);
  if (nodeEl) {
    const rect = nodeEl.getBoundingClientRect();
    colorPickerX.value = rect.right + 10;
    colorPickerY.value = rect.top;
  }
  // 设置默认颜色
  selectedColor.value = lockedNodes.value[node.id]?.color || "#666666";
};

const handleColorSelect = (color) => {
  if (!lockedNodeTemp) return;

  showColorPicker.value = false;

  // 切换锁定状态
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
      hexData.value[i] = "--";
      asciiData.value[i] = ".";
    }

    // 记录操作
    const deletedData = hexData.value
      .slice(node.addrStart, node.addrEnd + 1)
      .join(" ");
    const historyItem = createHistoryItem("删除", deletedData, {
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

// 编辑操作
const handleEditChange = (addr, value) => {
  hexData.value[addr] = value;
  deletedAddrs.value.delete(addr);
  // 更新ASCII
  const charCode = parseInt(value, 16);
  asciiData.value[addr] =
    charCode >= 32 && charCode <= 126 ? String.fromCharCode(charCode) : ".";
};

// 右键菜单操作
const handleCopy = () => {
  const { start, end } = selectedAddrRange.value;
  if (start === -1 || end === -1) return;

  const copyData = hexData.value
    .slice(start, end + 1)
    .map((h) => h.toUpperCase())
    .join(" ");
  navigator.clipboard.writeText(copyData);

  // 记录操作
  const historyItem = createHistoryItem("复制", copyData);
  editHistory.value.push(historyItem);
  currentHistoryIndex.value = editHistory.value.length - 1;

  ElMessage.success("已复制选中的16进制数据");
};

const handleCut = () => {
  const { start, end } = selectedAddrRange.value;
  if (start === -1 || end === -1) return;

  // 保存剪切数据
  const cutData = hexData.value
    .slice(start, end + 1)
    .map((h) => h.toUpperCase())
    .join(" ");
  navigator.clipboard.writeText(cutData);

  // 标记删除
  for (let i = start; i <= end; i++) {
    deletedAddrs.value.add(i);
    hexData.value[i] = "--";
    asciiData.value[i] = ".";
  }

  // 记录操作
  const historyItem = createHistoryItem("剪切", cutData, { start, end });
  editHistory.value.push(historyItem);
  currentHistoryIndex.value = editHistory.value.length - 1;

  ElMessage.success("已剪切选中的16进制数据");
};

const handleDelete = () => {
  const { start, end } = selectedAddrRange.value;
  if (start === -1 || end === -1) return;

  // 保存删除前数据
  const deletedData = hexData.value
    .slice(start, end + 1)
    .map((h) => h.toUpperCase())
    .join(" ");

  // 标记删除
  for (let i = start; i <= end; i++) {
    deletedAddrs.value.add(i);
    hexData.value[i] = "--";
    asciiData.value[i] = ".";
  }

  // 记录操作
  const historyItem = createHistoryItem("删除", deletedData, { start, end });
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

// 操作历史
const handleHistoryClick = (row) => {
  const index = editHistory.value.findIndex((item) => item === row);
  if (index === -1) return;

  // 更新当前历史索引
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

// 选中范围变更
const handleSelectionChange = (range) => {
  selectedAddrRange.value = range;
};

// 辅助方法：创建历史记录项
const createHistoryItem = (type, change, addrRange = null) => {
  // 格式化数据
  const formattedChange = formatChangeData(type, change, addrRange);

  return {
    type,
    change,
    addrRange,
    originalData: addrRange
      ? hexData.value.slice(addrRange.start, addrRange.end + 1)
      : [],
    formattedChange,
    expanded: false,
    displayLines: formattedChange.split("<br/>").length,
    firstThreeLinesLength: 0,
    isDisabled: false,
  };
};

// 辅助方法：格式化变更数据
const formatChangeData = (type, change, addrRange) => {
  let formatted = "";

  // 按16字节分行
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
      ? hexData.value.slice(addrRange.start, addrRange.end + 1).join(" ")
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

// ===================== 生命周期 =====================
onMounted(() => {
  initHexData();
});

onUnmounted(() => {
  // 清理事件监听等
});
</script>

<style scoped>
.hex-editor-container {
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
