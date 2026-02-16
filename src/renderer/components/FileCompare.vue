<template>
  <div class="file-diff-container">
    <!-- 文件路径选择区域 -->
    <div class="file-path-section">
      <div class="path-item">
        <el-input
          v-model="leftFilePath"
          placeholder="请选择左侧文件"
          class="path-input"
          readonly
        />
        <el-button @click="selectFile('left')" type="primary"
          >打开文件</el-button
        >
      </div>
      <div class="path-item">
        <el-input
          v-model="rightFilePath"
          placeholder="请选择右侧文件"
          class="path-input"
          readonly
        />
        <el-button @click="selectFile('right')" type="primary"
          >打开文件</el-button
        >
      </div>
    </div>

    <!-- 对比内容区域 -->
    <div class="diff-content-section" ref="contentSectionRef">
      <!-- 左侧面板 -->
      <div class="diff-panel left-panel" ref="leftPanelRef">
        <el-scrollbar
          ref="leftScrollbar"
          @scroll="handleScroll('left')"
          class="diff-scrollbar"
          wrap-class="diff-scroll-wrap"
        >
          <!-- 单文件模式 -->
          <div v-if="!isDiffMode && leftFilePath" class="original-content">
            <div
              v-for="(line, index) in leftVisibleLines"
              :key="`left-original-${index}`"
              class="original-line"
            >
              <span class="line-number">{{ index + 1 }}</span>
              <span class="line-content">{{ line || "" }}</span>
            </div>
          </div>

          <!-- 对比模式（核心修复） -->
          <div v-else-if="isDiffMode && isValidDiffResult" class="diff-content">
            <!-- 占位容器：必须设置position:relative才能让子元素绝对定位 -->
            <div
              class="virtual-list-placeholder"
              :style="{ height: `${totalHeight}px`, position: 'relative' }"
            >
              <!-- 可视区域内容：直接在占位容器内渲染，避免层级问题 -->
              <div
                class="virtual-list-viewport"
                :style="{
                  position: 'absolute',
                  top: `${viewportTop}px`,
                  left: 0,
                  width: '100%',
                }"
              >
                <div
                  v-for="(segments, renderIdx) in visibleLeftSegments"
                  :key="`left-${renderIdx + visibleStartIndex}`"
                  class="diff-line"
                  :class="{
                    'line-delete': hasDiffSegment(segments, [1, 3]),
                    'line-equal': !hasDiffSegment(segments, [1, 2, 3]),
                    'line-empty': segments.length === 0,
                  }"
                >
                  <span class="line-number">{{
                    renderIdx + visibleStartIndex + 1
                  }}</span>
                  <span class="line-content">
                    <span
                      v-for="(seg, segIdx) in segments"
                      :key="`left-${renderIdx + visibleStartIndex}-${segIdx}`"
                      :class="getCharClass(seg.t)"
                      v-text="seg.v || ''"
                    />
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 空提示 -->
          <div v-else class="empty-tip">
            {{ leftFilePath ? "文件加载中..." : "请选择左侧文件" }}
          </div>
        </el-scrollbar>
      </div>

      <!-- 中间缩略图与控制区 -->
      <div class="diff-thumb-section" v-if="isDiffMode && isValidDiffResult">
        <canvas
          ref="thumbCanvas"
          class="diff-thumb"
          @mousedown="startDragThumb"
        />
        <div class="diff-controls">
          <el-button
            icon="el-icon-arrow-left"
            @click="syncBlock('left')"
            circle
          />
          <el-button
            icon="el-icon-arrow-right"
            @click="syncBlock('right')"
            circle
          />
        </div>
      </div>

      <!-- 右侧面板 -->
      <div class="diff-panel right-panel" ref="rightPanelRef">
        <el-scrollbar
          ref="rightScrollbar"
          @scroll="handleScroll('right')"
          class="diff-scrollbar"
          wrap-class="diff-scroll-wrap"
        >
          <!-- 单文件模式 -->
          <div v-if="!isDiffMode && rightFilePath" class="original-content">
            <div
              v-for="(line, index) in rightVisibleLines"
              :key="`right-original-${index}`"
              class="original-line"
            >
              <span class="line-number">{{ index + 1 }}</span>
              <span class="line-content">{{ line || "" }}</span>
            </div>
          </div>

          <!-- 对比模式（核心修复） -->
          <div v-else-if="isDiffMode && isValidDiffResult" class="diff-content">
            <div
              class="virtual-list-placeholder"
              :style="{ height: `${totalHeight}px`, position: 'relative' }"
            >
              <div
                class="virtual-list-viewport"
                :style="{
                  position: 'absolute',
                  top: `${viewportTop}px`,
                  left: 0,
                  width: '100%',
                }"
              >
                <div
                  v-for="(segments, renderIdx) in visibleRightSegments"
                  :key="`right-${renderIdx + visibleStartIndex}`"
                  class="diff-line"
                  :class="{
                    'line-insert': hasDiffSegment(segments, [2, 3]),
                    'line-equal': !hasDiffSegment(segments, [1, 2, 3]),
                    'line-empty': segments.length === 0,
                  }"
                >
                  <span class="line-number">{{
                    renderIdx + visibleStartIndex + 1
                  }}</span>
                  <span class="line-content">
                    <span
                      v-for="(seg, segIdx) in segments"
                      :key="`right-${renderIdx + visibleStartIndex}-${segIdx}`"
                      :class="getCharClass(seg.t)"
                      v-text="seg.v || ''"
                    />
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 空提示 -->
          <div v-else class="empty-tip">
            {{ rightFilePath ? "文件加载中..." : "请选择右侧文件" }}
          </div>
        </el-scrollbar>
      </div>
    </div>
  </div>
</template>

<script setup>
import {
  ref,
  computed,
  onMounted,
  onUnmounted,
  watch,
  nextTick,
  onUpdated,
} from "vue";
import { ElMessage } from "element-plus";

// 字符段类型枚举
const CHAR_SEGMENT_TYPE = {
  EQUAL: 0,
  DELETE: 1,
  INSERT: 2,
  REPLACE: 3,
};

// 基础状态
const leftFilePath = ref("");
const rightFilePath = ref("");
const leftLines = ref([]);
const rightLines = ref([]);
const diffResult = ref({ l: [], r: [] }); // 初始化空结构，避免null
const thumbCanvas = ref(null);
const isDragging = ref(false);
const currentBlockIndex = ref(0);

// DOM 引用
const contentSectionRef = ref(null);
const leftPanelRef = ref(null);
const rightPanelRef = ref(null);
const leftScrollbar = ref(null);
const rightScrollbar = ref(null);

// 虚拟列表配置
const LINE_HEIGHT = 20;
const VIEWPORT_EXTRA = 10;
const viewportHeight = ref(0);
const scrollTop = ref(0);
const leftOriginalScrollTop = ref(0);
const rightOriginalScrollTop = ref(0);
const isCalculatingDiff = ref(false);

// ========== 核心修复：响应式判断 ==========
// 对比模式
const isDiffMode = computed(() => {
  return (
    !!leftFilePath.value &&
    !!rightFilePath.value &&
    leftLines.value.length &&
    rightLines.value.length
  );
});

// 验证diffResult有效性（关键：避免多层嵌套）
const isValidDiffResult = computed(() => {
  // 兼容主进程返回的双层嵌套
  const realDiff = diffResult.value?.diffResult || diffResult.value;
  return !!realDiff && Array.isArray(realDiff.l) && Array.isArray(realDiff.r);
});

// 真实的diff数据（统一访问路径）
const realDiffData = computed(() => {
  return diffResult.value?.diffResult || diffResult.value;
});

// ========== 虚拟列表核心计算属性 ==========
// 总高度
const totalHeight = computed(() => {
  if (!isValidDiffResult.value) return 0;
  return realDiffData.value.l.length * LINE_HEIGHT;
});

// 可视区域起始索引
const visibleStartIndex = computed(() => {
  if (!isValidDiffResult.value) return 0;
  const start = Math.max(
    0,
    Math.floor(scrollTop.value / LINE_HEIGHT) - VIEWPORT_EXTRA
  );
  return start;
});

// 可视区域结束索引
const visibleEndIndex = computed(() => {
  if (!isValidDiffResult.value) return 0;
  const end = Math.min(
    realDiffData.value.l.length - 1,
    Math.floor((scrollTop.value + viewportHeight.value) / LINE_HEIGHT) +
      VIEWPORT_EXTRA
  );
  return end;
});

// 可视区域偏移量
const viewportTop = computed(() => {
  return visibleStartIndex.value * LINE_HEIGHT;
});

// 左侧可视区域字符段
const visibleLeftSegments = computed(() => {
  if (!isValidDiffResult.value) return [];
  return realDiffData.value.l.slice(
    visibleStartIndex.value,
    visibleEndIndex.value + 1
  );
});

// 右侧可视区域字符段
const visibleRightSegments = computed(() => {
  if (!isValidDiffResult.value) return [];
  return realDiffData.value.r.slice(
    visibleStartIndex.value,
    visibleEndIndex.value + 1
  );
});

// 单文件模式可视行
const leftVisibleLines = computed(() => {
  if (!leftLines.value.length || isDiffMode.value) return [];
  const start = Math.max(
    0,
    Math.floor(leftOriginalScrollTop.value / LINE_HEIGHT) - VIEWPORT_EXTRA
  );
  const end = Math.min(
    leftLines.value.length - 1,
    Math.floor(
      (leftOriginalScrollTop.value + viewportHeight.value) / LINE_HEIGHT
    ) + VIEWPORT_EXTRA
  );
  return leftLines.value.slice(start, end + 1);
});

const rightVisibleLines = computed(() => {
  if (!rightLines.value.length || isDiffMode.value) return [];
  const start = Math.max(
    0,
    Math.floor(rightOriginalScrollTop.value / LINE_HEIGHT) - VIEWPORT_EXTRA
  );
  const end = Math.min(
    rightLines.value.length - 1,
    Math.floor(
      (rightOriginalScrollTop.value + viewportHeight.value) / LINE_HEIGHT
    ) + VIEWPORT_EXTRA
  );
  return rightLines.value.slice(start, end + 1);
});

// ========== 辅助方法 ==========
const hasDiffSegment = (segments, types) => {
  if (!Array.isArray(segments)) return false;
  return segments.some((seg) => types.includes(seg.t));
};

const getCharClass = (t) => {
  switch (t) {
    case 1:
      return "char-delete";
    case 2:
      return "char-insert";
    case 3:
      return "char-replace";
    default:
      return "char-equal";
  }
};

const safeSetScrollTop = (scrollbarRef, value) => {
  nextTick(() => {
    try {
      if (scrollbarRef.value && scrollbarRef.value.setScrollTop) {
        scrollbarRef.value.setScrollTop(Math.max(0, value));
      }
    } catch (e) {
      console.warn("设置滚动条失败：", e);
    }
  });
};

// ========== 滚动事件（修复同步逻辑） ==========
const handleScroll = (side) => {
  try {
    if (isDiffMode.value && isValidDiffResult.value) {
      // 对比模式：同步滚动
      const scrollbar =
        side === "left" ? leftScrollbar.value : rightScrollbar.value;
      if (!scrollbar) return;

      const newScrollTop =
        scrollbar.wrapRef?.scrollTop || scrollbar.viewRef?.scrollTop || 0;
      if (newScrollTop !== scrollTop.value) {
        scrollTop.value = newScrollTop;
        // 同步另一侧
        const targetScrollbar =
          side === "left" ? rightScrollbar : leftScrollbar;
        safeSetScrollTop(targetScrollbar, newScrollTop);
      }
    } else {
      // 单文件模式
      if (side === "left" && leftScrollbar.value) {
        leftOriginalScrollTop.value =
          leftScrollbar.value.wrapRef?.scrollTop || 0;
      } else if (side === "right" && rightScrollbar.value) {
        rightOriginalScrollTop.value =
          rightScrollbar.value.wrapRef?.scrollTop || 0;
      }
    }
  } catch (e) {
    console.warn("滚动处理失败：", e);
  }
};

// ========== 文件选择 ==========
const selectFile = async (side) => {
  try {
    const result = await window.channel.selectFile(side);
    if (result?.path) {
      side === "left"
        ? (leftFilePath.value = result.path)
        : (rightFilePath.value = result.path);

      // 读取文件内容
      const contentResult = await window.channel.readFileContent(result.path);
      if (contentResult.success) {
        if (side === "left") {
          leftLines.value = [...contentResult.lines];
          leftOriginalScrollTop.value = 0;
        } else {
          rightLines.value = [...contentResult.lines];
          rightOriginalScrollTop.value = 0;
        }
        ElMessage.success(`成功加载${side === "left" ? "左侧" : "右侧"}文件`);
      } else {
        side === "left"
          ? (leftFilePath.value = "")
          : (rightFilePath.value = "");
        side === "left" ? (leftLines.value = []) : (rightLines.value = []);
        ElMessage.error(`读取文件失败：${contentResult.error}`);
      }
    }
  } catch (error) {
    ElMessage.error(`选择文件异常：${error.message}`);
  }
};

// ========== 计算差异（核心修复：兼容多层嵌套） ==========
const calculateDiff = async () => {
  if (isCalculatingDiff.value || !isDiffMode.value) return;

  isCalculatingDiff.value = true;
  try {
    const leftContent = Array.from(leftLines.value);
    const rightContent = Array.from(rightLines.value);
    const diffResult_ = await window.channel.diffFileContent(
      leftContent,
      rightContent
    );

    if (diffResult_.success) {
      // 兼容主进程返回的双层嵌套
      const realDiff =
        diffResult_.diffResult?.diffResult || diffResult_.diffResult;
      diffResult.value = realDiff; // 只存真正的l/r数据

      nextTick(() => {
        drawDiffThumb();
        safeSetScrollTop(leftScrollbar, 0);
        safeSetScrollTop(rightScrollbar, 0);
      });
    } else {
      console.log(`计算差异失败：${diffResult_.error}`);
    }
  } catch (error) {
    console.log(`计算差异异常：${error.message}`);
  } finally {
    isCalculatingDiff.value = false;
  }
};

// ========== 缩略图绘制 ==========
const drawDiffThumb = () => {
  if (!thumbCanvas.value || !isValidDiffResult.value) return;

  const canvas = thumbCanvas.value;
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width;
  canvas.height = rect.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const totalLines = realDiffData.value.l.length;
  if (totalLines === 0) return;

  const lineHeight = canvas.height / totalLines;
  const halfWidth = canvas.width / 2;

  realDiffData.value.l.forEach((leftSegs, lineIdx) => {
    const rightSegs = realDiffData.value.r[lineIdx] || [];
    const y = lineIdx * lineHeight;

    if (hasDiffSegment(leftSegs, [1, 3])) {
      ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
      ctx.fillRect(0, y, halfWidth, lineHeight);
    }
    if (hasDiffSegment(rightSegs, [2, 3])) {
      ctx.fillStyle = "rgba(0, 255, 0, 0.5)";
      ctx.fillRect(halfWidth, y, halfWidth, lineHeight);
    }
  });
};

// ========== 缩略图拖拽 ==========
const startDragThumb = (e) => {
  isDragging.value = true;
  document.addEventListener("mousemove", dragThumb, { passive: false });
  document.addEventListener("mouseup", stopDragThumb);
  e.preventDefault();
};

const dragThumb = (e) => {
  if (!isDragging.value || !thumbCanvas.value || !isValidDiffResult.value)
    return;

  try {
    const canvas = thumbCanvas.value;
    const rect = canvas.getBoundingClientRect();
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    const targetScrollTop = (y / rect.height) * totalHeight.value;
    safeSetScrollTop(leftScrollbar, targetScrollTop);
  } catch (e) {
    console.warn("拖拽失败：", e);
  }
};

const stopDragThumb = () => {
  isDragging.value = false;
  document.removeEventListener("mousemove", dragThumb);
  document.removeEventListener("mouseup", stopDragThumb);
};

// ========== 区块同步 ==========
const syncBlock = (direction) => {
  try {
    if (!isValidDiffResult.value) {
      ElMessage.info("暂无差异区块");
      return;
    }

    const diffLineIndexes = [];
    realDiffData.value.l.forEach((leftSegs, lineIdx) => {
      const rightSegs = realDiffData.value.r[lineIdx] || [];
      if (
        hasDiffSegment(leftSegs, [1, 3]) ||
        hasDiffSegment(rightSegs, [2, 3])
      ) {
        diffLineIndexes.push(lineIdx);
      }
    });

    if (diffLineIndexes.length === 0) {
      ElMessage.info("暂无差异区块");
      return;
    }

    currentBlockIndex.value =
      direction === "left"
        ? (currentBlockIndex.value - 1 + diffLineIndexes.length) %
          diffLineIndexes.length
        : (currentBlockIndex.value + 1) % diffLineIndexes.length;

    const targetScrollTop =
      diffLineIndexes[currentBlockIndex.value] * LINE_HEIGHT;
    safeSetScrollTop(leftScrollbar, targetScrollTop);
    ElMessage.success(
      `跳转到差异行 ${currentBlockIndex.value + 1}/${diffLineIndexes.length}`
    );
  } catch (e) {
    ElMessage.error(`区块跳转失败：${e.message}`);
  }
};

// ========== 监听与初始化 ==========
// 监听文件内容变化，强制触发更新
watch(
  [leftLines, rightLines],
  async () => {
    if (isDiffMode.value) {
      await nextTick();
      calculateDiff();
      // 强制更新视图
      nextTick(() => {
        initViewportSize();
      });
    }
  },
  { deep: true, immediate: false }
);

// 监听diffResult变化，强制更新视图
watch(
  () => diffResult.value,
  () => {
    if (isValidDiffResult.value) {
      nextTick(() => {
        initViewportSize();
        drawDiffThumb();
      });
    }
  },
  { deep: true }
);

const initViewportSize = () => {
  nextTick(() => {
    if (leftPanelRef.value) {
      const rect = leftPanelRef.value.getBoundingClientRect();
      viewportHeight.value = Math.max(100, rect.height - 20);
    }

    if (thumbCanvas.value) {
      thumbCanvas.value.width = 60;
      thumbCanvas.value.height = viewportHeight.value;
    }
  });
};

onMounted(() => {
  initViewportSize();
  window.addEventListener("resize", initViewportSize);
});

onUpdated(() => {
  initViewportSize();
});

onUnmounted(() => {
  window.removeEventListener("resize", initViewportSize);
  document.removeEventListener("mousemove", dragThumb);
  document.removeEventListener("mouseup", stopDragThumb);
});
</script>

<style scoped>
.file-diff-container {
  width: 100%;
  height: 100vh; /* 强制占满视口高度 */
  display: flex;
  flex-direction: column;
  padding: 10px;
  box-sizing: border-box;
  overflow: hidden;
}

.file-path-section {
  display: flex;
  gap: 20px;
  margin-bottom: 10px;
  flex-shrink: 0;
}

.path-item {
  flex: 1;
  display: flex;
  gap: 10px;
}

.path-input {
  flex: 1;
}

.diff-content-section {
  flex: 1;
  display: flex;
  gap: 0;
  overflow: hidden;
  position: relative;
}

.diff-panel {
  flex: 1;
  border: 1px solid #e6e6e6;
  overflow: hidden;
  position: relative;
  height: 100%;
}

.diff-scrollbar {
  width: 100%;
  height: 100%;
}

/* 修复滚动条样式 */
:deep(.diff-scroll-wrap) {
  overflow-x: hidden !important;
  height: 100% !important;
}

:deep(.el-scrollbar__view) {
  width: 100% !important;
  height: 100% !important;
}

/* 单文件模式样式 */
.original-content {
  position: relative;
  width: 100%;
  min-height: 100%;
}

.original-line {
  display: flex;
  height: 20px;
  line-height: 20px;
  font-family: monospace;
  font-size: 14px;
  width: 100%;
  box-sizing: border-box;
}

/* 对比模式核心样式（修复定位） */
.diff-content {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.virtual-list-placeholder {
  width: 100%;
  pointer-events: none;
}

.virtual-list-viewport {
  will-change: top;
  z-index: 1;
}

.diff-line {
  display: flex;
  height: 20px;
  line-height: 20px;
  font-family: monospace;
  font-size: 14px;
  width: 100%;
  box-sizing: border-box;
  white-space: pre;
}

.line-number {
  width: 60px;
  text-align: right;
  padding-right: 10px;
  border-right: 1px solid #e6e6e6;
  color: #999;
  flex-shrink: 0;
  user-select: none;
}

.line-content {
  flex: 1;
  padding-left: 10px;
  color: #000;
  white-space: pre;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 行样式 */
.line-delete {
  background: rgba(255, 0, 0, 0.1);
}

.line-insert {
  background: rgba(0, 255, 0, 0.1);
}

.line-equal {
  color: #333;
}

.line-empty {
  opacity: 0.5;
}

/* 字符样式（强制生效） */
.char-delete {
  background-color: #ffebee !important;
  text-decoration: line-through !important;
  color: #b71c1c !important;
  padding: 0 1px;
}

.char-insert {
  background-color: #e8f5e9 !important;
  text-decoration: underline !important;
  color: #2e7d32 !important;
  padding: 0 1px;
}

.char-replace {
  background-color: #fff8e1 !important;
  font-weight: bold !important;
  color: #ff8f00 !important;
  padding: 0 1px;
}

.char-equal {
  color: #333;
}

/* 缩略图区域 */
.diff-thumb-section {
  width: 60px;
  border: 1px solid #e6e6e6;
  border-left: none;
  border-right: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #f5f5f5;
  flex-shrink: 0;
}

.diff-thumb {
  width: 100%;
  flex: 1;
  cursor: grab;
  display: block;
}

.diff-thumb:active {
  cursor: grabbing;
}

.diff-controls {
  padding: 10px 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex-shrink: 0;
}

/* 空提示 */
.empty-tip {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  z-index: 2;
  pointer-events: none;
}
</style>
