<template>
  <div class="folder-compare-container" :class="theme">
    <!-- 顶部操作栏：保留原有结构 -->
    <div class="compare-header">
      <div class="folder-input-group">
        <el-input
          v-model="leftFolderPath"
          placeholder="请输入左侧文件夹路径"
          class="folder-input"
          @drop="handleDrop('left', $event)"
          @dragover="handleDragOver"
          @change="handleFolderPathChange('left')"
        />
        <el-button type="primary" @click="selectFolder('left')">
          选择文件夹
        </el-button>
      </div>

      <div class="compare-controls">
        <el-button @click="reloadCompare">重新加载</el-button>
        <el-button @click="toggleTheme">
          {{ theme === "light-theme" ? "切换黑色主题" : "切换白色主题" }}
        </el-button>
      </div>

      <div class="folder-input-group">
        <el-input
          v-model="rightFolderPath"
          placeholder="请输入右侧文件夹路径"
          class="folder-input"
          @drop="handleDrop('right', $event)"
          @dragover="handleDragOver"
          @change="handleFolderPathChange('right')"
        />
        <el-button type="primary" @click="selectFolder('right')">
          选择文件夹
        </el-button>
      </div>
    </div>

    <!-- 主体：固定左右布局 + 滚动同步 -->
    <div class="compare-body">
      <!-- 左侧树形表格 -->
      <div class="table-container left-table">
        <div
          class="table-placeholder"
          v-if="!leftFolderPath || rawLeftTreeData.length === 0"
        >
          请选择左侧文件夹
        </div>
        <div v-else class="virtual-table-wrapper" ref="leftTableContainer">
          <el-table-v2
            v-model:expanded-row-keys="leftExpandedRowKeys"
            row-key="id"
            expandColumnKey="name"
            :columns="tableColumns"
            :data="currentLeftTreeData"
            :width="leftTableWidth || 670"
            :height="tableHeight"
            :row-height="40"
            :sortable="true"
            :row-class-name="getRowClassName"
            :scrollbar-always-on="false"
            :row-event-handlers="leftRowEventHandlers"
          />
        </div>
      </div>

      <!-- 右侧树形表格 -->
      <div class="table-container right-table">
        <div
          class="table-placeholder"
          v-if="!rightFolderPath || rawRightTreeData.length === 0"
        >
          请选择右侧文件夹
        </div>
        <div v-else class="virtual-table-wrapper" ref="rightTableContainer">
          <el-table-v2
            v-model:expanded-row-keys="rightExpandedRowKeys"
            row-key="id"
            expandColumnKey="name"
            :columns="rightTableColumns"
            :data="currentRightTreeData"
            :width="rightTableWidth || 670"
            :height="tableHeight"
            :row-height="40"
            :row-class-name="getRowClassName"
            :scrollbar-always-on="true"
            @scroll="handleTableScroll('right', $event)"
            :row-event-handlers="rightRowEventHandlers"
          />
        </div>
      </div>
    </div>
  </div>
  <!-- 右键菜单组件 -->
  <teleport to="body">
    <div
      v-show="contextMenu.visible"
      class="context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      @click.stop
      @contextmenu.prevent
    >
      <div
        v-for="item in contextMenu.items"
        :key="item.label"
        class="context-menu-item"
        @click="handleContextMenuItemClick(item)"
      >
        {{ item.label }}
      </div>
    </div>
  </teleport>
</template>

<script setup lang="jsx">
// @ts-nocheck  // 加这行，关闭TS校验，报红立即消失
import {
  ref,
  reactive,
  toRaw,
  computed,
  onMounted,
  onUnmounted,
  watch,
  nextTick,
  h,
} from "vue";
import { ElMessage, ElButton, ElInput } from "element-plus";
import { ElTableV2 } from "element-plus";
import "element-plus/es/components/table-v2/style/css";

// 导入图标组件
import IconFolder from "@/icons/IconFolder.vue";
import IconFile from "@/icons/IconFile.vue";
import IconArrowLeft from "@/icons/IconArrowLeft.vue";
import IconArrowRight from "@/icons/IconArrowRight.vue";

// 核心修正：提前定义emit
const emit = defineEmits(["row-click", "file-compare"]);

// ========== 主题相关 ==========
const theme = ref("light-theme");
const toggleTheme = () => {
  theme.value = theme.value === "light-theme" ? "dark-theme" : "light-theme";
};

// ========== 滚动同步相关 ==========
// 滚动锁：避免滚动事件循环触发
const scrollLock = ref(false);
// 存储表格DOM元素
const leftTableEl = ref(null);
const rightTableEl = ref(null);

// ========== 核心状态 ==========
const leftExpandedRowKeys = ref([]);
const rightExpandedRowKeys = ref([]);
const leftFolderPath = ref("");
const rightFolderPath = ref("");
const rawLeftTreeData = ref([]);
const rawRightTreeData = ref([]);
const alignedLeftTreeData = ref([]);
const alignedRightTreeData = ref([]);
const hasCompareResult = ref(false);

// 当前显示的树数据
const currentLeftTreeData = computed(() => {
  return hasCompareResult.value
    ? alignedLeftTreeData.value
    : rawLeftTreeData.value;
});
const currentRightTreeData = computed(() => {
  return hasCompareResult.value
    ? alignedRightTreeData.value
    : rawRightTreeData.value;
});

// ========== 树形表格配置 - 左侧表格列（JSX语法 + 修正cellData） ==========
const tableColumns = ref([
  {
    key: "name",
    title: "文件/目录名",
    dataKey: "name",
    width: 350,
    sortable: true,
    sortType: null,
    flexGrow: 1, // 弹性增长
    // 左侧名称列cellRenderer（JSX语法 + 修正cellData）
    cellRenderer: ({ cellData, rowData }) => {
      // 空节点逻辑
      if (rowData.path === "") {
        return (
          <div class="cell-content">
            <span class="empty-label"></span>
          </div>
        );
      }
      return (
        <div class="cell-content">
          <div class={`file-icon-wrapper ${rowData.diffType || ""}`}>
            {rowData.isFolder ? (
              <IconFolder class="file-icon" />
            ) : (
              <IconFile class="file-icon" />
            )}
          </div>
          <div class={`file-name ${rowData.diffType || ""}`}>{cellData}</div>
        </div>
      );
    },
  },
  {
    key: "size",
    title: "文件大小",
    dataKey: "size",
    width: 120,
    sortable: true,
    sortType: null,
    flexGrow: 0,
    // 文件大小列cellRenderer（JSX语法 + 修正cellData）
    cellRenderer: ({ cellData, rowData }) => {
      if (rowData.path === "") {
        return <span class="empty-label"></span>;
      }
      return <span>{formatFileSize(cellData) || "-"}</span>;
    },
  },
  {
    key: "mtime",
    title: "修改时间",
    dataKey: "mtime",
    width: 200,
    sortable: true,
    sortType: null,
    flexGrow: 0,
    // 修改时间列cellRenderer（JSX语法 + 修正cellData）
    cellRenderer: ({ cellData, rowData }) => {
      if (rowData.path === "") {
        return <span class="empty-label"></span>;
      }
      return <span>{formatTime(cellData) || "-"}</span>;
    },
  },
]);

// ========== 右侧表格列配置（JSX语法） ==========
const rightTableColumns = ref([
  {
    key: "name",
    title: "文件/目录名",
    dataKey: "name",
    width: 350,
    sortable: true,
    sortType: null,
    flexGrow: 1, // 弹性增长
    // 右侧名称列cellRenderer（JSX语法）
    cellRenderer: ({ cellData, rowData }) => {
      // 空节点逻辑
      if (rowData.isEmptyNode) {
        return (
          <div class="cell-content">
            <span class="empty-label"></span>
          </div>
        );
      }

      return (
        <div class="cell-content">
          <div class={`file-icon-wrapper ${rowData.diffType || ""}`}>
            {rowData.isFolder ? (
              <IconFolder class="file-icon" />
            ) : (
              <IconFile class="file-icon" />
            )}
          </div>
          <div class={`file-name ${rowData.diffType || ""}`}>{cellData}</div>
        </div>
      );
    },
  },
  {
    key: "size",
    title: "文件大小",
    dataKey: "size",
    width: 120,
    sortable: true,
    sortType: null,
    flexGrow: 0,
    // 右侧文件大小列cellRenderer（JSX语法）
    cellRenderer: ({ cellData, rowData }) => {
      if (rowData.isEmptyNode) {
        return <span class="empty-label"></span>;
      }
      return <span>{formatFileSize(cellData) || "-"}</span>;
    },
  },
  {
    key: "mtime",
    title: "修改时间",
    dataKey: "mtime",
    width: 200,
    sortable: true,
    sortType: null,
    flexGrow: 0,
    // 右侧修改时间列cellRenderer（JSX语法）
    cellRenderer: ({ cellData, rowData }) => {
      if (rowData.isEmptyNode) {
        return <span class="empty-label"></span>;
      }
      return <span>{formatTime(cellData) || "-"}</span>;
    },
  },
]);

// 表格高度（自适应）
const tableHeight = computed(() => {
  const containerHeight = window.innerHeight - 120;
  return containerHeight > 300 ? containerHeight : 600;
});

// 表格宽度（自适应容器）
const leftTableContainer = ref(null);
const rightTableContainer = ref(null);
const leftTableWidth = ref(0);
const rightTableWidth = ref(0);

// ========== 核心业务逻辑（完全保留） ==========
// 加载单个文件夹结构
const loadFolder = async (side, folderPath) => {
  let dirPath = toRaw(folderPath);
  if (!dirPath) return;

  try {
    const result = await window.channel.loadFolder(dirPath);
    if (result.success && result.fileTree) {
      if (side === "left") {
        rawLeftTreeData.value = [result.fileTree];
        if (!hasCompareResult.value) {
          nextTick(() => {
            leftExpandedRowKeys.value = [result.fileTree.id];
          });
        }
      } else {
        rawRightTreeData.value = [result.fileTree];
        // 非比对模式，右侧单独展开根节点
        if (!hasCompareResult.value) {
          nextTick(() => {
            rightExpandedRowKeys.value = [result.fileTree.id];
          });
        }
      }
      startCompare();
      nextTick(() => {
        resizeTableWidth();
        // 初始化表格DOM引用
        if (leftTableContainer.value) {
          leftTableEl.value =
            leftTableContainer.value.querySelector(".el-table-v2");
        }
        if (rightTableContainer.value) {
          rightTableEl.value =
            rightTableContainer.value.querySelector(".el-table-v2");
        }
      });
    } else {
      ElMessage.error(`加载失败：${result?.message || "无文件数据"}`);
    }
  } catch (error) {
    ElMessage.error(
      `加载${side === "left" ? "左侧" : "右侧"}文件夹失败：${error.message}`
    );
    console.error(error);
  }
};

// 文件夹路径变化处理
const handleFolderPathChange = (side) => {
  const folderPath =
    side === "left" ? leftFolderPath.value : rightFolderPath.value;
  if (folderPath) {
    loadFolder(side, folderPath);
    if (hasCompareResult.value) {
      resetCompareState();
    }
  }
};

// 重置比对状态
const resetCompareState = () => {
  hasCompareResult.value = false;
  alignedLeftTreeData.value = [];
  alignedRightTreeData.value = [];
};

// 拖拽处理
const handleDragOver = (e) => {
  e.preventDefault();
  e.stopPropagation();
};

const handleDrop = async (side, e) => {
  e.preventDefault();
  e.stopPropagation();

  try {
    const filePath = e.dataTransfer?.files?.[0]?.path;
    if (filePath) {
      if (side === "left") {
        leftFolderPath.value = filePath;
      } else {
        rightFolderPath.value = filePath;
      }
      await loadFolder(side, filePath);
      resetCompareState();
    }
  } catch (error) {
    ElMessage.error(`拖拽失败：${error.message}`);
  }
};

// 选择文件夹
const selectFolder = async (side) => {
  try {
    const folderPath = await window.channel.selectFolder();
    if (folderPath) {
      if (side === "left") {
        leftFolderPath.value = folderPath;
      } else {
        rightFolderPath.value = folderPath;
      }
      await loadFolder(side, folderPath);
      resetCompareState();
    }
  } catch (error) {
    ElMessage.error(`选择文件夹失败：${error.message}`);
  }
};

// 开始比对
const startCompare = async () => {
  if (!leftFolderPath.value || !rightFolderPath.value) {
    return;
  }

  try {
    const result = await window.channel.diffFolder(
      leftFolderPath.value,
      rightFolderPath.value
    );
    alignedLeftTreeData.value = [result.leftTree];
    alignedRightTreeData.value = [result.rightTree];
    hasCompareResult.value = true;
    // 比对完成后，默认展开左右根节点
    nextTick(() => {
      if (result.leftTree?.id) {
        leftExpandedRowKeys.value = [result.leftTree.id];
        rightExpandedRowKeys.value = [result.rightTree?.id].filter(Boolean);
      }
    });
    console.log(result.leftTree);
    console.log(result.rightTree);
  } catch (error) {
    console.error(`比对失败：${error.message}`);
    console.error(error);
  }
};

// ========== 展开/折叠同步 ==========
// 同步左右展开状态
const syncExpandedKeys = () => {
  if (!hasCompareResult.value) return;

  const leftKeys = new Set(leftExpandedRowKeys.value);
  const rightKeys = new Set(rightExpandedRowKeys.value);
  const allKeys = new Set([...leftKeys, ...rightKeys]);

  // 双向同步：将任意一侧展开的节点ID同步到另一侧
  rightExpandedRowKeys.value = Array.from(allKeys);
  leftExpandedRowKeys.value = Array.from(allKeys);
};

// 监听左侧展开状态变化，同步到右侧
watch(
  leftExpandedRowKeys,
  (newKeys) => {
    if (!hasCompareResult.value || scrollLock.value) return;
    scrollLock.value = true;
    rightExpandedRowKeys.value = [...newKeys];
    setTimeout(() => {
      scrollLock.value = false;
    }, 10);
  },
  { deep: true }
);

// 监听右侧展开状态变化，同步到左侧
watch(
  rightExpandedRowKeys,
  (newKeys) => {
    if (!hasCompareResult.value || scrollLock.value) return;
    scrollLock.value = true;
    leftExpandedRowKeys.value = [...newKeys];
    setTimeout(() => {
      scrollLock.value = false;
    }, 10);
  },
  { deep: true }
);

// ========== 滚动同步相关 ==========
// 处理表格滚动事件
const handleTableScroll = (side, e) => {
  if (scrollLock.value) return;
  scrollLock.value = true;

  const targetEl = side === "left" ? rightTableEl.value : leftTableEl.value;
  const currentEl = e.target;

  if (targetEl && currentEl) {
    // 同步垂直滚动
    targetEl.scrollTop = currentEl.scrollTop;
    // 同步水平滚动
    targetEl.scrollLeft = currentEl.scrollLeft;
  }

  // 解锁（避免事件防抖）
  setTimeout(() => {
    scrollLock.value = false;
  }, 10);
};

// 重新加载比对
const reloadCompare = () => {
  resetCompareState();
  if (leftFolderPath.value && rightFolderPath.value) {
    startCompare();
  } else {
    if (leftFolderPath.value) loadFolder("left", leftFolderPath.value);
    if (rightFolderPath.value) loadFolder("right", rightFolderPath.value);
  }
};

// 文件大小格式化
const formatFileSize = (size) => {
  if (!size || size === 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let formattedSize = size;

  while (formattedSize >= 1024 && unitIndex < units.length - 1) {
    formattedSize /= 1024;
    unitIndex++;
  }

  return `${formattedSize.toFixed(2)} ${units[unitIndex]}`;
};

// 修改时间
const formatTime = (timestamp) => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// 斑马纹行样式类
const getRowClassName = ({ row, index }) => {
  const baseClass = getLineClass(row);
  const stripeClass = index % 2 === 0 ? "row-even" : "row-odd";
  return `${baseClass} ${stripeClass}`;
};

// 行点击事件
const handleRowClick = (side, row) => {
  emit("row-click", { side, row });

  if (row.isEmptyNode) return;
  if (row.isFolder) return;

  try {
    const rootPath =
      side === "left" ? leftFolderPath.value : rightFolderPath.value;
    const targetRoot =
      side === "left" ? rightFolderPath.value : leftFolderPath.value;
    const relativePath = pathUtils.relative(rootPath, row.path);

    console.log("文件比对：", {
      left: side === "left" ? row.path : pathUtils.join(targetRoot, relativePath),
      right: side === "left" ? pathUtils.join(targetRoot, relativePath) : row.path,
    });
  } catch (error) {
    console.error(`打开文件比对失败：${error.message}`);
  }
};

// 左右同步文件逻辑
const syncOne = async (direction, row) => {
  try {
    ElMessage.info("正在同步，请稍候...");

    const syncParams = {
      direction,
      sourcePath: row.path,
      sourceRoot:
        direction === "left-to-right"
          ? leftFolderPath.value
          : rightFolderPath.value,
      targetRoot:
        direction === "left-to-right"
          ? rightFolderPath.value
          : leftFolderPath.value,
      isFolder: row.isFolder,
      isFile: !row.isFolder,
    };

    console.log("同步参数：", syncParams);
    ElMessage.success("同步成功！");
    reloadCompare();
  } catch (error) {
    console.error(`同步出错：${error.message}`);
    ElMessage.error("同步失败！");
  }
};

const getLineClass = (row) => {
  if (row.isEmptyNode) return "line-empty";
  if (row.diffType === "only") return "line-only";
  if (row.diffType === "different") return "line-different";
  if (row.diffType === "same") return "line-same";
  return "";
};

// ========== 右键菜单状态 ==========
const leftRowEventHandlers = {
  // 右键菜单事件
  onContextmenu: (params) => {
    handleContextMenu(params.event,params.rowData,'left')
  },

  onDblclick: (params) => {
    handleLeftRowDblClick(params.rowData);
  },
};

const rightRowEventHandlers = {
  // 右键菜单事件
  onContextmenu: (params) => {
    console.log(params);
    handleContextMenu(params.event,params.rowData,'right')
  },

  onDblclick: (params) => {
    handleRightRowDblClick(params.rowData);
  },
};


const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  items: [],
  side: null,
  rowData: null,
});

// ========== 上下文菜单处理 ==========
const handleContextMenu = (e, row, side) => {
  e.preventDefault();
  e.stopPropagation();

  const menuItems = [];

  // 3.1 比较 - 仅文件显示
  if (!row.isFolder && !row.isEmptyNode) {
    menuItems.push({
      label: "比较",
      action: "compare",
      side,
      row,
    });
  }

  // 3.2 重命名 - 文件和文件夹都显示
  if (!row.isEmptyNode) {
    menuItems.push({
      label: "重命名",
      action: "rename",
      side,
      row,
    });
  }

  // 3.3 复制到右边 - 仅左侧节点显示
  if (side === "left" && !row.isEmptyNode) {
    menuItems.push({
      label: "复制到右边",
      action: "copyToRight",
      side,
      row,
    });
  }

  // 3.4 复制到左边 - 仅右侧节点显示
  if (side === "right" && !row.isEmptyNode) {
    menuItems.push({
      label: "复制到左边",
      action: "copyToLeft",
      side,
      row,
    });
  }

  // 3.5 展开所有 - 仅文件夹节点显示
  if (row.isFolder && !row.isEmptyNode) {
    menuItems.push({
      label: "展开所有",
      action: "expandAll",
      side,
      row,
    });
  }

  // 3.6 折叠所有 - 仅文件夹节点显示
  if (row.isFolder && !row.isEmptyNode) {
    menuItems.push({
      label: "折叠所有",
      action: "collapseAll",
      side,
      row,
    });
  }

  // 添加分隔线（如果有多个菜单项）
  if (menuItems.length > 0) {
    contextMenu.value = {
      visible: true,
      x: e.clientX,
      y: e.clientY,
      items: menuItems,
      side,
      rowData: row,
    };
  }
};

// 点击空白处关闭菜单
const handleClickOutside = (e) => {
  if (contextMenu.value.visible) {
    const menuEl = document.querySelector(".context-menu");
    if (menuEl && !menuEl.contains(e.target)) {
      contextMenu.value.visible = false;
    }
  }
};

// 右键菜单项点击处理
const handleContextMenuItemClick = async (item) => {
  contextMenu.value.visible = false;
  const { action, side, row } = item;

  switch (action) {
    case "compare":
      emit("file-compare", {
        side,
        leftPath: side === "left" ? row.path : getMatchingPath(row, "left"),
        rightPath: side === "right" ? row.path : getMatchingPath(row, "right"),
      });
      break;

    case "rename":
      await handleRename(side, row);
      break;

    case "copyToRight":
      await handleCopy(side, row, "right");
      break;

    case "copyToLeft":
      await handleCopy(side, row, "left");
      break;

    case "expandAll":
      await handleExpandAll(side, row, true);
      break;

    case "collapseAll":
      await handleExpandAll(side, row, false);
      break;
  }
};

// 1. 前端兼容的路径工具函数（替代 Node.js path 模块）
const pathUtils = {
  // 判断是否为绝对路径（适配 Windows/macOS/Linux）
  isAbsolute: (p) => {
    if (!p) return false;
    // Windows 绝对路径：以盘符开头（如 C:\）或 \\ 开头
    // if (process.platform === 'win32') {
    //   return /^[A-Za-z]:\\/.test(p) || /^\\\\/.test(p);
    // }
    // macOS/Linux 绝对路径：以 / 开头
    return p.startsWith('/');
  },
  // 计算相对路径（简化版，适配渲染进程）
  relative: (from, to) => {
    if (!from || !to) return '';
    const fromParts = from.split(/[\\/]/).filter(Boolean);
    const toParts = to.split(/[\\/]/).filter(Boolean);
    
    // 找到公共前缀
    let i = 0;
    while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) {
      i++;
    }
    
    // 生成相对路径
    const up = '../'.repeat(fromParts.length - i);
    const down = toParts.slice(i).join('/');
    return up + down || '.';
  },
  // 拼接路径（处理分隔符）
  join: (...paths) => {
    return paths.filter(Boolean).join('/').replace(/\/+/g, '/');
  },
  // 规范化路径
  normalize: (p) => {
    return p.replace(/\\/g, '/').replace(/\/+/g, '/');
  }
};

// 2. 适配前端的 getMatchingPath 函数
const getMatchingPath = (row, targetSide) => {
  if (!row?.path || !leftFolderPath.value || !rightFolderPath.value) {
    console.error('路径计算失败：核心参数缺失', {
      rowPath: row?.path,
      leftFolder: leftFolderPath.value,
      rightFolder: rightFolderPath.value
    });
    return '';
  }

  const sourceRoot = row.path;
  const sourceSide = targetSide === "left" ? "right" : "left";
  
  const sourceRootPath = sourceSide === "left" ? leftFolderPath.value : rightFolderPath.value;
  const targetRootPath = targetSide === "left" ? leftFolderPath.value : rightFolderPath.value;

  try {
    if (!pathUtils.isAbsolute(sourceRootPath) || !pathUtils.isAbsolute(sourceRoot)) {
      throw new Error(`路径必须为绝对路径：sourceRootPath=${sourceRootPath}, sourceRoot=${sourceRoot}`);
    }
    
    const relativePath = pathUtils.relative(sourceRootPath, sourceRoot);
    const targetPath = pathUtils.join(targetRootPath, relativePath);
    return pathUtils.normalize(targetPath);
  } catch (err) {
    console.error('路径计算出错：', err.message);
    return '';
  }
};

// 重命名处理
const handleRename = async (side, row) => {
  const newName = prompt("请输入新名称", row.name);
  if (!newName || newName === row.name) return;

  try {
    const result = await window.channel.rename({
      path: row.path,
      newName,
      isFolder: row.isFolder,
    });

    if (result.success) {
      reloadCompare();
    } else {
      ElMessage.error(`重命名失败: ${result.message}`);
    }
  } catch (error) {
    ElMessage.error(`重命名失败: ${error.message}`);
  }
};

// 复制处理
const handleCopy = async (sourceSide, row, targetSide) => {
  try {
    const sourcePath = row.path;
    const targetRoot =
      targetSide === "left" ? leftFolderPath.value : rightFolderPath.value;
    const sourceRoot =
      sourceSide === "left" ? leftFolderPath.value : rightFolderPath.value;
    const relativePath = pathUtils.relative(sourceRoot, sourcePath);
    const targetPath = pathUtils.join(targetRoot, relativePath);

    const result = await window.channel.copy({
      sourcePath,
      targetPath,
      isFolder: row.isFolder,
    });

    if (result.success) {
      reloadCompare();
    } else {
      ElMessage.error(`复制失败: ${result.message}`);
    }
  } catch (error) {
    ElMessage.error(`复制失败: ${error.message}`);
  }
};

// ========== 递归展开/折叠 ==========
const handleExpandAll = async (side, folderNode, expand) => {
  if (!folderNode.isFolder) return;

  // 收集所有子文件夹ID
  const collectFolderIds = (node, ids = []) => {
    if (node.isFolder) {
      ids.push(node.id);
      if (node.children) {
        node.children.forEach((child) => collectFolderIds(child, ids));
      }
    }
    return ids;
  };

  const folderIds = collectFolderIds(folderNode);

  if (expand) {
    // 展开
    const currentKeys = new Set(
      side === "left" ? leftExpandedRowKeys.value : rightExpandedRowKeys.value
    );
    folderIds.forEach((id) => currentKeys.add(id));

    if (side === "left") {
      leftExpandedRowKeys.value = Array.from(currentKeys);
    } else {
      rightExpandedRowKeys.value = Array.from(currentKeys);
    }
  } else {
    // 折叠
    const currentKeys = (
      side === "left" ? leftExpandedRowKeys.value : rightExpandedRowKeys.value
    ).filter((id) => !folderIds.includes(id));

    if (side === "left") {
      leftExpandedRowKeys.value = currentKeys;
    } else {
      rightExpandedRowKeys.value = currentKeys;
    }
  }
};

// ========== 双击处理 ==========
// 左侧单元格点击（用于区分单击和双击）
let clickTimer = null;
const handleLeftRowClick = (row) => {
  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
  }
  clickTimer = setTimeout(() => {
    handleRowClick("left", row);
    clickTimer = null;
  }, 200);
};

// 左侧单元格双击
const handleLeftRowDblClick = (row) => {
  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
  }

  // 4. 双击文件夹展开/折叠
  if (row.isFolder) {
    const expandedKeys = [...leftExpandedRowKeys.value];
    const index = expandedKeys.indexOf(row.id);
    if (index === -1) {
      expandedKeys.push(row.id);
    } else {
      expandedKeys.splice(index, 1);
    }
    leftExpandedRowKeys.value = expandedKeys;
  } else {
    // 5. 双击文件触发比较
    emit("file-compare", {
      side: "left",
      leftPath: row.path,
      rightPath: getMatchingPath(row, "right"),
    });
  }
};

// 右侧单元格双击
const handleRightRowDblClick = (row) => {
  // 4. 双击文件夹展开/折叠
  if (row.isFolder) {
    const expandedKeys = [...rightExpandedRowKeys.value];
    const index = expandedKeys.indexOf(row.id);
    if (index === -1) {
      expandedKeys.push(row.id);
    } else {
      expandedKeys.splice(index, 1);
    }
    rightExpandedRowKeys.value = expandedKeys;
  } else {
    // 5. 双击文件触发比较
    emit("file-compare", {
      side: "right",
      leftPath: getMatchingPath(row, "left"),
      rightPath: row.path,
    });
  }
};

// 右侧单元格点击
const handleRightCellClick = (row) => {
  handleRowClick("right", row);
};

// ========== 自适应宽度计算（修复50%布局） ==========
const resizeTableWidth = () => {
  nextTick(() => {
    if (leftTableContainer.value) {
      // 左侧宽度 = 容器宽度 - 边框 - 内边距
      leftTableWidth.value = leftTableContainer.value.clientWidth - 2;
    }
    if (rightTableContainer.value) {
      // 右侧宽度 = 容器宽度 - 边框 - 内边距 - 滚动条宽度
      const scrollBarWidth = 12; // 滚动条宽度
      rightTableWidth.value =
        rightTableContainer.value.clientWidth - 2 - scrollBarWidth;
    }

    // 更新表格DOM引用
    if (leftTableContainer.value) {
      leftTableEl.value =
        leftTableContainer.value.querySelector(".el-table-v2");
    }
    if (rightTableContainer.value) {
      rightTableEl.value =
        rightTableContainer.value.querySelector(".el-table-v2");
    }
  });
};

// ========== 在 onMounted 中添加事件监听 ==========
onMounted(() => {
  resizeTableWidth();
  window.addEventListener("resize", resizeTableWidth);
  document.addEventListener("click", handleClickOutside);

  watch(
    [
      rawLeftTreeData,
      rawRightTreeData,
      currentLeftTreeData,
      currentRightTreeData,
    ],
    () => {
      nextTick(() => {
        resizeTableWidth();
      });
    },
    { deep: true }
  );
});

onUnmounted(() => {
  window.removeEventListener("resize", resizeTableWidth);
  document.removeEventListener("click", handleClickOutside);
});

// 监听路径变化
watch(
  leftFolderPath,
  (newVal) => {
    if (newVal) handleFolderPathChange("left");
  },
  { immediate: false }
);

watch(
  rightFolderPath,
  (newVal) => {
    if (newVal) handleFolderPathChange("right");
  },
  { immediate: false }
);
</script>

<style scoped>
/* 基础容器样式 */
.folder-compare-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 16px;
  box-sizing: border-box;
  transition: background-color 0.3s;
  overflow: hidden;
}

/* 主题样式 */
.light-theme {
  background-color: #f8f9fa;
  color: #333;
}
.dark-theme {
  background-color: #1e1e1e;
  color: #e0e0e0;
}

/* 顶部操作栏 */
.compare-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.folder-input-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 280px;
}
.folder-input {
  flex: 1;
  height: 40px;
}
.compare-controls {
  display: flex;
  gap: 8px;
}

/* 主体布局 */
.compare-body {
  display: flex;
  flex: 1;
  gap: 16px;
  overflow: hidden;
  flex-wrap: nowrap;
  width: 100%;
  min-height: 0;
}

/* 表格容器 - 各占50% */
.table-container {
  flex: 1 1 50%;
  width: 50%;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  transition: background-color 0.3s;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 左侧表格隐藏滚动条 */
.left-table :deep(.el-table-v2__main) {
  overflow: hidden !important;
}

.left-table :deep(.el-table-v2__body) {
  overflow: hidden !important;
}

/* 右侧表格正常显示滚动条 */
.right-table :deep(.el-table-v2__main) {
  overflow-y: auto !important;
  overflow-x: auto !important;
}

.right-table :deep(.el-table-v2__body) {
  overflow: visible !important;
}

/* 虚拟表格容器 */
.virtual-table-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 2;
  flex: 1;
}

/* 右键菜单样式 */
.context-menu {
  position: fixed;
  z-index: 9999;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  padding: 4px 0;
  min-width: 120px;
}

.dark-theme .context-menu {
  background: #2c2c2c;
  border-color: #444;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.3);
}

.context-menu-item {
  padding: 8px 16px;
  cursor: pointer;
  font-size: 14px;
  color: #333;
  transition: background-color 0.2s;
}

.context-menu-item:hover {
  background-color: #ecf5ff;
}

.dark-theme .context-menu-item {
  color: #e0e0e0;
}

.dark-theme .context-menu-item:hover {
  background-color: #409eff;
  color: #fff;
}

.context-menu-item.disabled {
  color: #999;
  cursor: not-allowed;
}

.dark-theme .context-menu-item.disabled {
  color: #666;
}

/* 表格容器 */
.table-container {
  flex: 1;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  min-width: 45%;
  max-width: 45%;
  transition: background-color 0.3s;
  height: 100%;
}
.light-theme .table-container {
  border: 1px solid #e4e7ed;
  background: #ffffff;
}
.dark-theme .table-container {
  border: 1px solid #333;
  background: #252525;
}

/* 表格占位符 */
.table-placeholder {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  font-size: 16px;
  transition: background-color 0.3s;
  z-index: 1;
}
.light-theme .table-placeholder {
  background: #fafafa;
}
.dark-theme .table-placeholder {
  background: #2c2c2c;
}

/* 单元格样式 */
/* 图标包装器 */
/* 强制穿透到表格内部单元格 */
:deep(.el-table-v2 .cell-content) {
  display: flex !important;
  align-items: center !important; /* 垂直居中 */
  gap: 4px;
  height: 100%;
  width: 100%;
}

:deep(.file-icon-wrapper) {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  line-height: 0;
}

:deep(.file-icon-wrapper svg) {
  width: 100%;
  height: 100%;
  fill: currentColor;
}

:deep(.file-name) {
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  height: 100%;
}

/* 颜色控制 */
:deep(.file-icon-wrapper.only),
:deep(.file-name.only) {
  color: #028d02;
}

:deep(.file-icon-wrapper.different),
:deep(.file-name.different) {
  color: #ff4d4f;
}

.sync-arrow:hover {
  opacity: 1;
}

/* 空节点样式 */
.empty-label {
  font-size: 12px;
  color: #999;
  font-style: italic;
}

/* 斑马纹样式 */
.light-theme .row-even {
  background-color: #ffffff;
}
.light-theme .row-odd {
  background-color: #f5f5f5;
}
.dark-theme .row-even {
  background-color: #252525;
}
.dark-theme .row-odd {
  background-color: #303030;
}

/* 差异行样式 */
.line-only {
  transition: background-color 0.2s;
}
.light-theme .line-only {
  background-color: #e8f4ff !important;
}
.dark-theme .line-only {
  background-color: #2a3b4c !important;
}
.line-different {
  transition: background-color 0.2s;
}
.light-theme .line-different {
  background-color: #fff2f0 !important;
}
.dark-theme .line-different {
  background-color: #4c2a2a !important;
}
.line-same {
  opacity: 0.8;
}
.line-empty {
  cursor: not-allowed;
  transition: background-color 0.2s;
}
.light-theme .line-empty {
  background-color: #fafafa !important;
}
.dark-theme .line-empty {
  background-color: #2c2c2c !important;
}

/* 滚动条优化 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.light-theme ::-webkit-scrollbar-track {
  background: #f1f1f1;
}
.dark-theme ::-webkit-scrollbar-track {
  background: #333;
}
.light-theme ::-webkit-scrollbar-thumb {
  background: #c1c1c1;
}
.dark-theme ::-webkit-scrollbar-thumb {
  background: #555;
}
::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* 样式穿透修复 */
:deep(.el-table-v2) {
  width: 100%;
  height: 100%;
}
:deep(.el-table-v2-header) {
  background-color: var(--el-table-v2-header-background-color, #f9fafb);
}
:deep(.el-table-v2-body) {
  background-color: transparent;
}
.dark-theme :deep(.el-table-v2) {
  --el-table-v2-text-color: #e0e0e0;
  --el-table-v2-header-text-color: #fff;
  --el-table-v2-header-background-color: #333;
  --el-table-v2-border-color: #444;
}
</style>
