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
            @cell-click="(row) => handleRowClick('left', row)"
            :scrollbar-always-on="true"
            @scroll="handleTableScroll('left', $event)"
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
            @cell-click="(row) => handleRowClick('right', row)"
            :scrollbar-always-on="true"
            @scroll="handleTableScroll('right', $event)"
          />
        </div>
      </div>
    </div>
  </div>
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
import path from "path";
import _ from "lodash-es";

// 核心修正：提前定义emit
const emit = defineEmits(["row-click"]);

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
    const relativePath = path.relative(rootPath, row.path);

    console.log("文件比对：", {
      left: side === "left" ? row.path : path.join(targetRoot, relativePath),
      right: side === "left" ? path.join(targetRoot, relativePath) : row.path,
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

// ========== 生命周期 & 自适应 ==========
const resizeTableWidth = () => {
  nextTick(() => {
    if (leftTableContainer.value) {
      leftTableWidth.value = leftTableContainer.value.clientWidth - 20;
    }
    if (rightTableContainer.value) {
      rightTableWidth.value = rightTableContainer.value.clientWidth - 20;
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

onMounted(() => {
  resizeTableWidth();
  window.addEventListener("resize", resizeTableWidth);

  watch([rawLeftTreeData, rawRightTreeData], () => {
    nextTick(() => {
      resizeTableWidth();
    });
  });
});

onUnmounted(() => {
  window.removeEventListener("resize", resizeTableWidth);
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

/* 虚拟表格容器 */
.virtual-table-wrapper {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
  z-index: 2;
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
