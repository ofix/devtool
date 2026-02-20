<template>
  <div class="folder-compare-container">
    <!-- 顶部操作栏：保留文件夹选择按钮 -->
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
        <el-button type="primary" @click="selectFolder('left')"
          >选择文件夹</el-button
        >
      </div>

      <div class="compare-controls">
        <el-button
          type="success"
          @click="startCompare"
          :disabled="!leftFolderPath || !rightFolderPath"
        >
          开始比对
        </el-button>
        <el-button @click="reloadCompare">重新加载</el-button>
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
        <el-button type="primary" @click="selectFolder('right')"
          >选择文件夹</el-button
        >
      </div>
    </div>

    <!-- 主体：固定左右布局（核心） -->
    <div class="compare-body">
      <!-- 左侧文件树 -->
      <div class="tree-container left-tree">
        <div class="tree-placeholder" v-if="!leftFolderPath">
          请选择左侧文件夹
        </div>
        <el-tree-v2
          v-else
          ref="leftTreeRef"
          v-model:expanded-keys="leftExpandedKeys"
          v-model:selected-keys="leftSelectedKeys"
          :data="currentLeftTreeData"
          :props="treeProps"
          :height="treeHeight"
          :indent="4"
          @node-click="handleNodeClick('left', $event)"
          @scroll="handleTreeScroll('left', $event)"
          class="custom-tree"
        >
          <template #default="{ node, data }">
            <div class="tree-line" :class="getLineClass(data)">
              <!-- 空节点样式 -->
              <template v-if="data.isEmptyNode">
                <span class="empty-icon">∅</span>
                <span class="empty-label">（无对应文件）</span>
              </template>
              <template v-else>
                <IconFolder v-if="data.isFolder" />
                <IconFile v-else />
                <span class="line-name">{{ node.label }}</span>

                <!-- 左侧 → 右侧 同步箭头（仅差异行显示） -->
                <IconArrowRight
                  v-if="showSyncLeftToRight(data)"
                  @click.stop="syncOne('left-to-right', data)"
                />
              </template>
            </div>
          </template>
        </el-tree-v2>
      </div>

      <!-- 右侧文件树 -->
      <div class="tree-container right-tree">
        <div class="tree-placeholder" v-if="!rightFolderPath">
          请选择右侧文件夹
        </div>
        <el-tree-v2
          v-else
          ref="rightTreeRef"
          v-model:expanded-keys="rightExpandedKeys"
          v-model:selected-keys="rightSelectedKeys"
          :data="currentRightTreeData"
          :props="treeProps"
          :height="treeHeight"
          :indent="4"
          @node-click="handleNodeClick('right', $event)"
          @scroll="handleTreeScroll('right', $event)"
          class="custom-tree"
        >
          <template #default="{ node, data }">
            <div class="tree-line" :class="getLineClass(data)">
              <!-- 空节点样式 -->
              <template v-if="data.isEmptyNode">
                <span class="empty-icon">∅</span>
                <span class="empty-label">（无对应文件）</span>
              </template>
              <template v-else>
                <!-- 右侧 → 左侧 同步箭头（仅差异行显示） -->
                <IconArrowLeft
                  v-if="showSyncRightToLeft(data)"
                  @click.stop="syncOne('right-to-left', data)"
                />

                <span class="line-name">{{ node.label }}</span>
                <IconFolder v-if="data.isFolder" />
                <IconFile v-else />
              </template>
            </div>
          </template>
        </el-tree-v2>
      </div>
    </div>
  </div>
</template>

<script setup>
import {
  ref,
  reactive,
  toRaw,
  computed,
  onMounted,
  onUnmounted,
  watch,
  h,
} from "vue";
import { ElTreeV2, ElDialog, ElMessage, ElButton, ElInput } from "element-plus";
import IconFolder from "@/icons/IconFolder.vue";
import IconFile from "@/icons/IconFile.vue";
import IconArrowLeft from "@/icons/IconArrowLeft.vue";
import IconArrowRight from "@/icons/IconArrowRight.vue";
import path from "path";
import _ from "lodash-es";

// ========== 核心状态 ==========
// 文件夹路径
const leftFolderPath = ref("");
const rightFolderPath = ref("");

// 原始树数据（单侧渲染用）
const rawLeftTreeData = ref([]);
const rawRightTreeData = ref([]);

// 对齐后树数据（比对后用）
const alignedLeftTreeData = ref([]);
const alignedRightTreeData = ref([]);

// 是否有比对结果
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

// 树配置
const leftExpandedKeys = ref([]);
const rightExpandedKeys = ref([]);
const leftSelectedKeys = ref([]);
const rightSelectedKeys = ref([]);
const treeProps = {
  id: "path",
  key: "path",
  label: "name",
  children: "children",
};

// 树容器引用
const leftTreeRef = ref(null);
const rightTreeRef = ref(null);

// 树高度（自适应）
const treeHeight = computed(() => {
  const containerHeight = window.innerHeight - 120;
  return containerHeight > 300 ? containerHeight : 600;
});

// 文件比对弹窗
const fileCompareVisible = ref(false);
const leftCompareFilePath = ref("");
const rightCompareFilePath = ref("");

// 锁
const scrollLock = ref(false);
const expandLock = ref(false);

// ========== 核心方法 ==========
// 加载单个文件夹结构
const loadFolder = async (side, folderPath) => {
  let dirPath = toRaw(folderPath);
  if (!dirPath) return;

  try {
    const result = await window.channel.loadFolder(dirPath);

    if (result.success) {
      if (side === "left") {
        rawLeftTreeData.value = [result.fileTree];
        leftExpandedKeys.value = [folderPath];
      } else {
        rawRightTreeData.value = [result.fileTree];
        rightExpandedKeys.value = [folderPath];
      }
    } else {
      ElMessage.error(`加载失败：${result.message}`);
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
    const filePath = e.dataTransfer.files?.[0]?.path;
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
    ElMessage.warning("请先选择左右两侧的文件夹路径");
    return;
  }

  try {
    const result = await window.channel.diffFolder(
      leftFolderPath.value,
      rightFolderPath.value
    );
    console.log(result.leftTree, result.rightTree);
    alignedLeftTreeData.value = [result.leftTree];
    alignedRightTreeData.value = [result.rightTree];
    hasCompareResult.value = true;
  } catch (error) {
    console.error(`比对失败：${error.message}`);
    console.error(error);
  }
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

// 节点点击
const handleNodeClick = (side, data) => {
  if (data.isEmptyNode) return;

  if (data.isFolder) {
    syncExpandedKeys(side, data.path);
    return;
  }

  try {
    const rootPath =
      side === "left" ? leftFolderPath.value : rightFolderPath.value;
    const targetRoot =
      side === "left" ? rightFolderPath.value : leftFolderPath.value;
    const relativePath = path.relative(rootPath, data.path);

    if (side === "left") {
      leftCompareFilePath.value = data.path;
      rightCompareFilePath.value = path.join(targetRoot, relativePath);
    } else {
      leftCompareFilePath.value = path.join(targetRoot, relativePath);
      rightCompareFilePath.value = data.path;
    }

    fileCompareVisible.value = true;
  } catch (error) {
    console.error(`打开文件比对失败：${error.message}`);
  }
};

// 同步展开节点
const syncExpandedKeys = (side, nodePath) => {
  if (expandLock.value) return;
  expandLock.value = true;

  try {
    const relativePath = path.relative(
      side === "left" ? leftFolderPath.value : rightFolderPath.value,
      nodePath
    );
    const targetRoot =
      side === "left" ? rightFolderPath.value : leftFolderPath.value;
    const targetPath = path.join(targetRoot, relativePath);

    if (side === "left") {
      if (
        leftExpandedKeys.value.includes(nodePath) &&
        !rightExpandedKeys.value.includes(targetPath)
      ) {
        rightExpandedKeys.value = [...rightExpandedKeys.value, targetPath];
      }
    } else {
      if (
        rightExpandedKeys.value.includes(nodePath) &&
        !leftExpandedKeys.value.includes(targetPath)
      ) {
        leftExpandedKeys.value = [...leftExpandedKeys.value, targetPath];
      }
    }
  } catch (error) {
    console.error("展开状态同步失败：", error);
  } finally {
    setTimeout(() => (expandLock.value = false), 50);
  }
};

// 滚动同步
const handleTreeScroll = (side, event) => {
  if (scrollLock.value) return;
  scrollLock.value = true;

  try {
    const { scrollTop } = event.target;
    const targetScrollbar =
      side === "left"
        ? rightTreeRef.value?.$el.querySelector(".el-tree-v2-scrollbar")
        : leftTreeRef.value?.$el.querySelector(".el-tree-v2-scrollbar");

    if (targetScrollbar) {
      targetScrollbar.scrollTop = scrollTop;
    }
  } catch (error) {
    console.error("滚动同步失败：", error);
  } finally {
    setTimeout(() => (scrollLock.value = false), 30);
  }
};

// ========== 核心新增：单行同步逻辑 ==========
/**
 * 判断左侧行是否显示 → 右侧箭头
 * @param {Object} data 节点数据
 */
const showSyncLeftToRight = (data) => {
  if (!hasCompareResult.value) return false;
  if (data.isEmptyNode) return false;
  // 仅左侧存在 或 内容不同 时显示
  return data.diffType === "only" || data.diffType === "different";
};

/**
 * 判断右侧行是否显示 ← 左侧箭头
 * @param {Object} data 节点数据
 */
const showSyncRightToLeft = (data) => {
  if (!hasCompareResult.value) return false;
  if (data.isEmptyNode) return false;
  // 仅右侧存在 或 内容不同 时显示
  return data.diffType === "only" || data.diffType === "different";
};

/**
 * 单行同步
 * @param {string} direction 同步方向 left-to-right / right-to-left
 * @param {Object} data 节点数据
 */
const syncOne = async (direction, data) => {
  try {
    ElMessage.info("正在同步，请稍候...");

    // 构建同步参数
    const syncParams = {
      direction,
      sourcePath: data.path,
      sourceRoot:
        direction === "left-to-right"
          ? leftFolderPath.value
          : rightFolderPath.value,
      targetRoot:
        direction === "left-to-right"
          ? rightFolderPath.value
          : leftFolderPath.value,
      isFolder: data.isFolder,
      isFile: !data.isFolder,
    };

    // 调用主进程单行同步
    // 无需调用主进程进行同步
    // const result = await window.channel.syncFolderItem(syncParams);

    if (result.success) {
      console.log("同步成功！");
      // 重新加载比对结果
      reloadCompare();
    } else {
      console.error(`同步失败：${result.message}`);
    }
  } catch (error) {
    console.error(`同步出错：${error.message}`);
    console.error("单行同步失败：", error);
  }
};

/**
 * 获取行样式类
 * @param {Object} data 节点数据
 */
const getLineClass = (data) => {
  return {
    "tree-line": true,
    "line-only": data.diffType === "only",
    "line-different": data.diffType === "different",
    "line-same": data.diffType === "same",
    "line-empty": data.isEmptyNode,
  };
};

// ========== 生命周期 ==========
onMounted(() => {
  window.addEventListener("resize", () => {
    rawLeftTreeData.value = [...rawLeftTreeData.value];
    rawRightTreeData.value = [...rawRightTreeData.value];
  });
});

onUnmounted(() => {
  window.removeEventListener("resize", () => {});
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
/* 容器样式 */
.folder-compare-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 16px;
  box-sizing: border-box;
  background-color: #f8f9fa;
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

/* 主体：固定左右布局（核心） */
.compare-body {
  display: flex;
  flex: 1;
  gap: 16px;
  overflow: hidden;
  /* 强制左右布局，永不换行 */
  flex-wrap: nowrap;
}

/* 树容器 */
.tree-container {
  flex: 1;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #ffffff;
  overflow: hidden;
  position: relative;
  /* 固定宽度比例，左右各占一半 */
  min-width: 45%;
  max-width: 45%;
}

/* 树占位符 */
.tree-placeholder {
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
  background: #fafafa;
}

/* 树行样式 */
.tree-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  padding: 0 8px;
  cursor: pointer;
}

/* 空节点样式 */
.line-empty {
  color: #999999;
  cursor: not-allowed;
  background-color: #fafafa;
}

.empty-icon {
  margin-right: 8px;
  font-size: 14px;
  color: #ccc;
}

.empty-label {
  font-size: 12px;
  color: #999;
  font-style: italic;
}

/* 行图标 */
.line-icon {
  margin: 0 8px;
  font-size: 16px;
}

/* 行名称 */
.line-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0 8px;
}

/* 同步按钮 */
.sync-btn {
  opacity: 0.7;
  transition: all 0.2s;
}

.sync-btn:hover {
  opacity: 1;
  background-color: #e8f4ff;
}

.right-btn {
  color: #67c23a;
}

.left-btn {
  color: #67c23a;
}

/* 差异行样式 */
.line-only {
  background-color: #e8f4ff;
}

.line-different {
  background-color: #fff2f0;
}

.line-same {
  color: #666666;
}

/* 滚动条优化 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>
