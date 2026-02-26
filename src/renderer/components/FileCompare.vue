<template>
  <div class="bc-diff-container">
    <!-- 文件路径栏 -->
    <div class="bc-path-bar" ref="pathBarRef">
      <div class="bc-path-item">
        <span class="bc-path-label">左侧文件：</span>
        <el-input
          v-model="leftFilePath"
          placeholder="未选择文件"
          class="bc-path-input"
          readonly
          size="small"
        />
        <el-button @click="selectFile('left')" type="primary" size="small"
          >浏览</el-button
        >
      </div>
      <div class="bc-path-item">
        <span class="bc-path-label">右侧文件：</span>
        <el-input
          v-model="rightFilePath"
          placeholder="未选择文件"
          class="bc-path-input"
          readonly
          size="small"
        />
        <el-button @click="selectFile('right')" type="primary" size="small"
          >浏览</el-button
        >
      </div>
    </div>

    <!-- 核心对比区域 -->
    <div class="bc-main-container" ref="mainContainerRef">
      <!-- 左侧面板 -->
      <div class="bc-panel bc-panel-left">
        <!-- 行号栏 -->
        <div class="bc-line-number-gutter">
          <div
            v-for="(line, idx) in visibleLineNumbers"
            :key="`left-ln-${visibleStartIndex}-${idx}`"
            class="bc-line-number"
          >
            {{ visibleStartIndex + idx + 1 }}
          </div>
        </div>

        <!-- 内容区域 -->
        <div
          class="bc-content-area"
          ref="leftContentRef"
          @scroll="handleContentScroll('left', $event)"
        >
          <div
            class="bc-content-placeholder"
            :style="{ height: `${totalHeight}px` }"
          ></div>

          <div
            class="bc-viewport-content"
            :style="{ top: `${scrollTopValue}px` }"
          >
            <!-- 原始内容模式 -->
            <div v-if="!isDiffMode && leftLines.length" class="bc-raw-content">
              <div
                v-for="(line, idx) in visibleRawLeftLines"
                :key="`left-raw-${visibleStartIndex}-${idx}`"
                class="bc-content-line bc-line-equal"
              >
                <span class="bc-line-content" v-text="line || ''" />
              </div>
            </div>
            <!-- 对比模式 -->
            <div v-else-if="isDiffMode && isValidDiffResult">
              <div
                v-for="(segments, idx) in visibleLeftSegments"
                :key="`left-content-${visibleStartIndex}-${idx}`"
                class="bc-content-line"
                :class="getContentLineClass(segments, 'left')"
              >
                <!-- 行内同步箭头：黑色无高亮 -->
                <div
                  v-if="hasLineDiff(visibleStartIndex + idx)"
                  class="bc-line-sync-btn"
                >
                  <div
                    v-if="isLineDelete(visibleStartIndex + idx)"
                    class="custom-arrow-btn"
                    @click.stop="
                      syncLine(visibleStartIndex + idx, 'left-to-right')
                    "
                    title="将此行左侧内容同步到右侧"
                  >
                    <IconArrowRight />
                  </div>
                </div>
                <!-- 行内容 -->
                <span class="bc-line-content">
                  <span
                    v-for="(seg, segIdx) in segments"
                    :key="`left-seg-${visibleStartIndex}-${idx}-${segIdx}`"
                    :class="getCharClass(seg.t)"
                    v-text="seg.v || ''"
                  />
                </span>
              </div>
            </div>
            <div
              v-else-if="!leftLines.length && leftFilePath"
              class="bc-empty-content"
            >
              <p>文件加载中...</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 中间控制区：确保按钮在最顶部 -->
      <div class="bc-divider" v-if="leftFilePath || rightFilePath">
        <!-- 控制按钮：在最顶部 -->
        <!-- <div class="bc-control-buttons">
          <el-button
            icon="el-icon-refresh"
            @click="refreshDiff"
            circle
            size="small"
            :disabled="!isDiffMode"
            title="重新对比"
          />
          <el-button
            icon="el-icon-arrow-left"
            @click="syncBlock('prev')"
            circle
            size="small"
            :disabled="diffBlocks.length === 0"
            title="上一个差异块"
          />
          <el-button
            icon="el-icon-arrow-right"
            @click="syncBlock('next')"
            circle
            size="small"
            :disabled="diffBlocks.length === 0"
            title="下一个差异块"
          />
          <el-button
            icon="el-icon-back"
            @click="undo"
            circle
            size="small"
            :disabled="!canUndo"
            title="撤销 (Ctrl+Z)"
          />
          <el-button
            icon="el-icon-forward"
            @click="redo"
            circle
            size="small"
            :disabled="!canRedo"
            title="重做 (Ctrl+Y)"
          />
        </div> -->

        <!-- 缩略图：在按钮下方 -->
        <div
          class="bc-thumbnail-container"
          v-if="isDiffMode && isValidDiffResult"
        >
          <canvas
            ref="thumbCanvas"
            class="bc-thumbnail"
            @mousedown="startDragThumb"
          />
          <div
            class="bc-viewport-indicator"
            :style="{
              top: `${viewportIndicatorTop}px`,
              height: `${viewportIndicatorHeight}px`,
            }"
          ></div>
        </div>
      </div>

      <!-- 右侧面板 -->
      <div class="bc-panel bc-panel-right">
        <!-- 行号栏 -->
        <div class="bc-line-number-gutter">
          <div
            v-for="(line, idx) in visibleLineNumbers"
            :key="`right-ln-${visibleStartIndex}-${idx}`"
            class="bc-line-number"
          >
            {{ visibleStartIndex + idx + 1 }}
          </div>
        </div>

        <!-- 内容区域 -->
        <div
          class="bc-content-area"
          ref="rightContentRef"
          @scroll="handleContentScroll('right', $event)"
        >
          <div
            class="bc-content-placeholder"
            :style="{ height: `${totalHeight}px` }"
          ></div>

          <div
            class="bc-viewport-content"
            :style="{ top: `${scrollTopValue}px` }"
          >
            <!-- 原始内容模式 -->
            <div v-if="!isDiffMode && rightLines.length" class="bc-raw-content">
              <div
                v-for="(line, idx) in visibleRawRightLines"
                :key="`right-raw-${visibleStartIndex}-${idx}`"
                class="bc-content-line bc-line-equal"
              >
                <span class="bc-line-content" v-text="line || ''" />
              </div>
            </div>
            <!-- 对比模式 -->
            <div v-else-if="isDiffMode && isValidDiffResult">
              <div
                v-for="(segments, idx) in visibleRightSegments"
                :key="`right-content-${visibleStartIndex}-${idx}`"
                class="bc-content-line"
                :class="getContentLineClass(segments, 'right')"
              >
                <!-- 行内同步箭头：黑色无高亮 -->
                <div
                  v-if="hasLineDiff(visibleStartIndex + idx)"
                  class="bc-line-sync-btn"
                >
                  <div
                    v-if="isLineInsert(visibleStartIndex + idx)"
                    class="custom-arrow-btn"
                    @click.stop="
                      syncLine(visibleStartIndex + idx, 'right-to-left')
                    "
                    title="将此行右侧内容同步到左侧"
                  >
                    <IconArrowLeft />
                  </div>
                </div>
                <!-- 行内容 -->
                <span class="bc-line-content">
                  <span
                    v-for="(seg, segIdx) in segments"
                    :key="`right-seg-${visibleStartIndex}-${idx}-${segIdx}`"
                    :class="getCharClass(seg.t)"
                    v-text="seg.v || ''"
                  />
                </span>
              </div>
            </div>
            <div
              v-else-if="!rightLines.length && rightFilePath"
              class="bc-empty-content"
            >
              <p>文件加载中...</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态提示 -->
    <div class="bc-empty-state" v-if="!leftFilePath && !rightFilePath">
      <div class="bc-empty-content">
        <el-icon size="48"><Document /></el-icon>
        <p class="bc-empty-text">{{ emptyStateText }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { ElMessage, ElIcon } from "element-plus";
import { Document } from "@element-plus/icons-vue";
// 导入自定义箭头组件
import IconArrowLeft from "@/icons/IconArrowLeft.vue";
import IconArrowRight from "@/icons/IconArrowRight.vue";

// ========== 常量定义 ==========
const CHAR_SEGMENT_TYPE = Object.freeze({
  EQUAL: 0, // 相同
  DELETE: 1, // 左侧删除
  INSERT: 2, // 右侧插入
  REPLACE: 3, // 替换
});

const LINE_HEIGHT = 20;
const LINE_NUMBER_WIDTH = 60;
const VIEWPORT_EXTRA = 15;

// ========== 状态管理 ==========
// 文件基础信息
const leftFilePath = ref("");
const rightFilePath = ref("");
const originalLeftLines = ref([]); // 原始左侧内容（不可变）
const originalRightLines = ref([]); // 原始右侧内容（不可变）
const leftLines = ref([]); // 当前左侧内容（可编辑）
const rightLines = ref([]); // 当前右侧内容（可编辑）
const diffResult = ref({ l: [], r: [] });

// 撤销/重做历史
const historyStack = ref([]); // 操作历史栈
const historyIndex = ref(-1); // 当前历史位置（-1表示初始状态）
const isHistoryChanging = ref(false); // 正在执行撤销/重做

// DOM 引用
const pathBarRef = ref(null);
const mainContainerRef = ref(null);
const leftContentRef = ref(null);
const rightContentRef = ref(null);
const thumbCanvas = ref(null);

// 滚动状态
const scrollTopValue = ref(0);
const viewportHeight = ref(0);
const isScrolling = ref(false);
const isDraggingThumb = ref(false);

// 防抖锁
const isDrawingThumb = ref(false);
const thumbnailDebounceTimer = ref(null);

// 差异区块
const diffBlocks = ref([]);
const currentBlockIndex = ref(0);
const isCalculatingDiff = ref(false);

// ========== 核心计算属性 ==========
// 对比模式判断
const isDiffMode = computed(() => {
  return (
    !!leftFilePath.value &&
    !!rightFilePath.value &&
    leftLines.value.length &&
    rightLines.value.length
  );
});

// 有效差异结果判断
const isValidDiffResult = computed(() => {
  const realDiff = diffResult.value?.diffResult || diffResult.value;
  return (
    !!realDiff &&
    Array.isArray(realDiff.l) &&
    Array.isArray(realDiff.r) &&
    realDiff.l.length > 0
  );
});

// 真实差异数据
const realDiffData = computed(() => {
  return diffResult.value?.diffResult || diffResult.value;
});

// 总高度
const totalHeight = computed(() => {
  if (!isValidDiffResult.value) {
    const maxLines = Math.max(leftLines.value.length, rightLines.value.length);
    return maxLines * LINE_HEIGHT;
  }
  return realDiffData.value.l.length * LINE_HEIGHT;
});

// 可视区域起始行号
const visibleStartIndex = computed(() => {
  if (!leftFilePath.value && !rightFilePath.value) return 0;
  const currentLine = Math.floor(scrollTopValue.value / LINE_HEIGHT);
  return Math.max(0, currentLine - VIEWPORT_EXTRA);
});

// 可视区域结束行号
const visibleEndIndex = computed(() => {
  if (!leftFilePath.value && !rightFilePath.value) return 0;
  const currentLine = Math.floor(scrollTopValue.value / LINE_HEIGHT);
  const visibleLines = Math.ceil(viewportHeight.value / LINE_HEIGHT);

  let totalLines = 0;
  if (isDiffMode.value && isValidDiffResult.value) {
    totalLines = realDiffData.value.l.length;
  } else {
    totalLines = Math.max(leftLines.value.length, rightLines.value.length);
  }

  return Math.min(totalLines - 1, currentLine + visibleLines + VIEWPORT_EXTRA);
});

// 可视行数
const visibleLineNumbers = computed(() => {
  if (!leftFilePath.value && !rightFilePath.value) return [];
  const count = visibleEndIndex.value - visibleStartIndex.value + 1;
  return count > 0 ? Array(count).fill(0) : [];
});

// 左侧可视内容段（对比模式）
const visibleLeftSegments = computed(() => {
  if (!isValidDiffResult.value) return [];
  return realDiffData.value.l.slice(
    visibleStartIndex.value,
    visibleEndIndex.value + 1
  );
});

// 右侧可视内容段（对比模式）
const visibleRightSegments = computed(() => {
  if (!isValidDiffResult.value) return [];
  const lines = realDiffData.value.r.slice(
    visibleStartIndex.value,
    visibleEndIndex.value + 1
  );

  // 修复：对于相等行，显示左侧内容
  return lines.map((line, i) => {
    if (line.length === 1 && line[0].t === CHAR_SEGMENT_TYPE.EQUAL) {
      return realDiffData.value.l[visibleStartIndex.value + i] || [];
    }
    return line;
  });
});

// 左侧原始内容（非对比模式）
const visibleRawLeftLines = computed(() => {
  if (isDiffMode.value) return [];
  return leftLines.value.slice(
    visibleStartIndex.value,
    visibleEndIndex.value + 1
  );
});

// 右侧原始内容（非对比模式）
const visibleRawRightLines = computed(() => {
  if (isDiffMode.value) return [];
  return rightLines.value.slice(
    visibleStartIndex.value,
    visibleEndIndex.value + 1
  );
});

// 缩略图相关计算属性
const viewportIndicatorTop = computed(() => {
  if (!isValidDiffResult.value || !thumbCanvas.value) return 0;
  const canvasHeight = thumbCanvas.value.clientHeight;
  const currentLine = Math.floor(scrollTopValue.value / LINE_HEIGHT);
  return (currentLine / realDiffData.value.l.length) * canvasHeight;
});

const viewportIndicatorHeight = computed(() => {
  if (!isValidDiffResult.value || !thumbCanvas.value) return 0;
  const canvasHeight = thumbCanvas.value.clientHeight;
  const visibleLines = Math.ceil(viewportHeight.value / LINE_HEIGHT);
  return (visibleLines / realDiffData.value.l.length) * canvasHeight;
});

// 空状态文本
const emptyStateText = computed(() => {
  if (!leftFilePath.value && !rightFilePath.value)
    return "请选择要对比的两个文件";
  if (!leftFilePath.value) return "请选择左侧文件";
  if (!rightFilePath.value) return "请选择右侧文件";
  return "文件对比中...";
});

// 撤销/重做可用性判断
const canUndo = computed(() => {
  return historyIndex.value >= 0;
});

const canRedo = computed(() => {
  return historyIndex.value < historyStack.value.length - 1;
});

// ========== 差异行判断方法 ==========
// 判断某行是否有差异
const hasLineDiff = (lineIdx) => {
  if (
    !isValidDiffResult.value ||
    lineIdx < 0 ||
    lineIdx >= realDiffData.value.l.length
  ) {
    return false;
  }

  const leftSegs = realDiffData.value.l[lineIdx] || [];
  const rightSegs = realDiffData.value.r[lineIdx] || [];

  const hasDelete = leftSegs.some((seg) => seg.t === CHAR_SEGMENT_TYPE.DELETE);
  const hasInsert = rightSegs.some((seg) => seg.t === CHAR_SEGMENT_TYPE.INSERT);
  const hasReplace =
    leftSegs.some((seg) => seg.t === CHAR_SEGMENT_TYPE.REPLACE) ||
    rightSegs.some((seg) => seg.t === CHAR_SEGMENT_TYPE.REPLACE);

  return hasDelete || hasInsert || hasReplace;
};

// 判断某行是否是左侧删除行
const isLineDelete = (lineIdx) => {
  if (
    !isValidDiffResult.value ||
    lineIdx < 0 ||
    lineIdx >= realDiffData.value.l.length
  ) {
    return false;
  }

  const leftSegs = realDiffData.value.l[lineIdx] || [];
  return leftSegs.some(
    (seg) =>
      seg.t === CHAR_SEGMENT_TYPE.DELETE || seg.t === CHAR_SEGMENT_TYPE.REPLACE
  );
};

// 判断某行是否是右侧插入行
const isLineInsert = (lineIdx) => {
  if (
    !isValidDiffResult.value ||
    lineIdx < 0 ||
    lineIdx >= realDiffData.value.l.length
  ) {
    return false;
  }

  const rightSegs = realDiffData.value.r[lineIdx] || [];
  return rightSegs.some(
    (seg) =>
      seg.t === CHAR_SEGMENT_TYPE.INSERT || seg.t === CHAR_SEGMENT_TYPE.REPLACE
  );
};

// ========== 样式辅助方法 ==========
const getContentLineClass = (segments, side) => {
  const classes = ["bc-content-line"];

  if (!Array.isArray(segments) || segments.length === 0) {
    classes.push("bc-line-empty");
    return classes;
  }

  const hasDelete = segments.some((seg) => seg.t === CHAR_SEGMENT_TYPE.DELETE);
  const hasInsert = segments.some((seg) => seg.t === CHAR_SEGMENT_TYPE.INSERT);
  const hasReplace = segments.some(
    (seg) => seg.t === CHAR_SEGMENT_TYPE.REPLACE
  );

  if (side === "left") {
    if (hasDelete || hasReplace) classes.push("bc-line-delete");
    else if (!hasDelete && !hasInsert && !hasReplace)
      classes.push("bc-line-equal");
  } else {
    if (hasInsert || hasReplace) classes.push("bc-line-insert");
    else if (!hasDelete && !hasInsert && !hasReplace)
      classes.push("bc-line-equal");
  }

  return classes;
};

const getCharClass = (t) => {
  switch (t) {
    case CHAR_SEGMENT_TYPE.DELETE:
      return "bc-char-delete";
    case CHAR_SEGMENT_TYPE.INSERT:
      return "bc-char-insert";
    case CHAR_SEGMENT_TYPE.REPLACE:
      return "bc-char-replace";
    default:
      return "bc-char-equal";
  }
};

const hasDiffSegment = (segments, types) => {
  if (!Array.isArray(segments)) return false;
  return segments.some((seg) => types.includes(seg.t));
};

// ========== 滚动同步逻辑 ==========
const handleContentScroll = (side, e) => {
  if (isScrolling.value || (!leftFilePath.value && !rightFilePath.value))
    return;

  isScrolling.value = true;

  try {
    const newScrollTop = e.target.scrollTop;
    scrollTopValue.value = newScrollTop;

    const targetContentRef = side === "left" ? rightContentRef : leftContentRef;
    if (
      targetContentRef.value &&
      targetContentRef.value.scrollTop !== newScrollTop
    ) {
      targetContentRef.value.scrollTop = newScrollTop;
    }

    updateThumbnailIndicatorDebounced();
  } catch (error) {
    console.error("滚动同步失败:", error);
  } finally {
    setTimeout(() => {
      isScrolling.value = false;
    }, 16);
  }
};

const scrollToLine = (lineIndex) => {
  if (!leftFilePath.value && !rightFilePath.value) return;

  let totalLines = 0;
  if (isDiffMode.value && isValidDiffResult.value) {
    totalLines = realDiffData.value.l.length;
  } else {
    totalLines = Math.max(leftLines.value.length, rightLines.value.length);
  }

  if (lineIndex < 0 || lineIndex >= totalLines) return;

  const newScrollTop = lineIndex * LINE_HEIGHT;
  scrollTopValue.value = newScrollTop;

  if (leftContentRef.value) {
    leftContentRef.value.scrollTop = newScrollTop;
  }
  if (rightContentRef.value) {
    rightContentRef.value.scrollTop = newScrollTop;
  }

  updateThumbnailIndicator();
};

// ========== 缩略图相关 ==========
const drawDiffThumbnail = () => {
  if (isDrawingThumb.value || !thumbCanvas.value || !isValidDiffResult.value)
    return;

  isDrawingThumb.value = true;

  try {
    const canvas = thumbCanvas.value;
    const ctx = canvas.getContext("2d");

    const canvasWidth = canvas.clientWidth;
    const canvasHeight = canvas.clientHeight;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    const totalLines = realDiffData.value.l.length;
    if (totalLines === 0) return;

    const lineHeight = canvasHeight / totalLines;
    const halfWidth = canvasWidth / 2;

    for (let lineIdx = 0; lineIdx < totalLines; lineIdx++) {
      const leftSegs = realDiffData.value.l[lineIdx] || [];
      const rightSegs = realDiffData.value.r[lineIdx] || [];
      const y = lineIdx * lineHeight;

      if (
        hasDiffSegment(leftSegs, [
          CHAR_SEGMENT_TYPE.DELETE,
          CHAR_SEGMENT_TYPE.REPLACE,
        ])
      ) {
        ctx.fillStyle = "rgba(224, 0, 0, 0.6)";
        ctx.fillRect(0, y, halfWidth, lineHeight);
      }

      if (
        hasDiffSegment(rightSegs, [
          CHAR_SEGMENT_TYPE.INSERT,
          CHAR_SEGMENT_TYPE.REPLACE,
        ])
      ) {
        ctx.fillStyle = "rgba(0, 128, 0, 0.6)";
        ctx.fillRect(halfWidth, y, halfWidth, lineHeight);
      }
    }
  } catch (error) {
    console.error("绘制缩略图失败:", error);
  } finally {
    isDrawingThumb.value = false;
  }
};

const updateThumbnailIndicator = () => {
  if (!thumbCanvas.value || !isValidDiffResult.value) return;

  if (!isDrawingThumb.value) {
    drawDiffThumbnail();
  }

  const canvas = thumbCanvas.value;
  const ctx = canvas.getContext("2d");

  ctx.save();

  ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    0,
    viewportIndicatorTop.value,
    canvas.clientWidth,
    viewportIndicatorHeight.value
  );

  ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
  ctx.fillRect(
    0,
    viewportIndicatorTop.value,
    canvas.clientWidth,
    viewportIndicatorHeight.value
  );

  ctx.restore();
};

const updateThumbnailIndicatorDebounced = () => {
  if (thumbnailDebounceTimer.value) {
    clearTimeout(thumbnailDebounceTimer.value);
  }

  thumbnailDebounceTimer.value = setTimeout(() => {
    if (isValidDiffResult.value) {
      updateThumbnailIndicator();
    }
  }, 30);
};

const initThumbnail = () => {
  if (isValidDiffResult.value && thumbCanvas.value) {
    drawDiffThumbnail();
    updateThumbnailIndicator();
  }
};

const startDragThumb = (e) => {
  if (!isValidDiffResult.value) return;

  isDraggingThumb.value = true;
  const canvasRect = thumbCanvas.value.getBoundingClientRect();

  const handleDrag = (dragEvent) => {
    if (!isDraggingThumb.value || !thumbCanvas.value) return;

    const canvasRect = thumbCanvas.value.getBoundingClientRect();
    const y = Math.max(
      0,
      Math.min(dragEvent.clientY - canvasRect.top, canvasRect.height)
    );

    const targetLineIndex = Math.floor(
      (y / canvasRect.height) * realDiffData.value.l.length
    );

    scrollToLine(targetLineIndex);
  };

  const handleEnd = () => {
    isDraggingThumb.value = false;
    document.removeEventListener("mousemove", handleDrag);
    document.removeEventListener("mouseup", handleEnd);
    document.removeEventListener("mouseleave", handleEnd);
  };

  document.addEventListener("mousemove", handleDrag);
  document.addEventListener("mouseup", handleEnd);
  document.addEventListener("mouseleave", handleEnd);

  e.preventDefault();
};

// ========== 差异区块导航 ==========
const refreshDiffBlocks = () => {
  if (!isValidDiffResult.value) {
    diffBlocks.value = [];
    return;
  }

  const blocks = [];
  let currentBlock = null;

  for (let lineIdx = 0; lineIdx < realDiffData.value.l.length; lineIdx++) {
    const leftSegs = realDiffData.value.l[lineIdx] || [];
    const rightSegs = realDiffData.value.r[lineIdx] || [];
    const hasDiff =
      hasDiffSegment(leftSegs, [1, 3]) || hasDiffSegment(rightSegs, [2, 3]);

    if (hasDiff) {
      if (!currentBlock) {
        currentBlock = { start: lineIdx, end: lineIdx };
        blocks.push(currentBlock);
      } else {
        currentBlock.end = lineIdx;
      }
    } else {
      currentBlock = null;
    }
  }
  console.log(blocks);
  diffBlocks.value = blocks;
  currentBlockIndex.value = 0;
};

const syncBlock = (direction) => {
  if (diffBlocks.value.length === 0) {
    ElMessage.info("未检测到差异区块");
    return;
  }

  if (direction === "prev") {
    currentBlockIndex.value =
      (currentBlockIndex.value - 1 + diffBlocks.value.length) %
      diffBlocks.value.length;
  } else {
    currentBlockIndex.value =
      (currentBlockIndex.value + 1) % diffBlocks.value.length;
  }

  const targetBlock = diffBlocks.value[currentBlockIndex.value];
  scrollToLine(targetBlock.start);

  ElMessage.success(
    `已定位到差异区块 ${currentBlockIndex.value + 1}/${diffBlocks.value.length}`
  );
};

// ========== 行级同步核心功能 ==========
// 保存当前状态到历史栈
const saveToHistory = (actionType, lineIdx) => {
  if (isHistoryChanging.value) return;

  // 截断当前位置之后的历史（新操作会清除重做记录）
  if (historyIndex.value < historyStack.value.length - 1) {
    historyStack.value = historyStack.value.slice(0, historyIndex.value + 1);
  }

  // 保存当前状态（深拷贝，确保不影响后续修改）
  const historyRecord = {
    lineIdx,
    l: JSON.parse(JSON.stringify(realDiffData.value.l[lineIdx])),
    r: JSON.parse(JSON.stringify(realDiffData.value.r[lineIdx])),
    timestamp: Date.now(),
  };

  historyStack.value.push(historyRecord);
  historyIndex.value = historyStack.value.length - 1;
};

// 同步指定行内容（修复：只修改目标行）
const syncLine = async (lineIdx, direction) => {
  try {
    // 保存同步前的状态到历史
    saveToHistory(direction, lineIdx);

    // 获取当前行的内容
    const leftSegs = realDiffData.value.l[lineIdx] || [];
    const rightSegs = realDiffData.value.r[lineIdx] || [];

    // 拼接成行文本
    const leftLineText = leftSegs.map((seg) => seg.v || "").join("");
    const rightLineText = rightSegs.map((seg) => seg.v || "").join("");

    // 执行同步（只修改目标行，不影响其他行）
    if (direction === "left-to-right") {
      // 左→右：更新右侧对应行
      if (lineIdx < rightLines.value.length) {
        realDiffData.value.l[lineIdx] = [
          { t: CHAR_SEGMENT_TYPE.EQUAL, v: leftLineText },
        ];
        realDiffData.value.r[lineIdx] = [{ t: CHAR_SEGMENT_TYPE.EQUAL, v: "" }];
        // 直接修改目标行，保持其他行不变
        rightLines.value[lineIdx] = leftLineText;
      } else {
        // 行号超出时补空行
        while (rightLines.value.length <= lineIdx) {
          rightLines.value.push("");
        }
        rightLines.value[lineIdx] = leftLineText;
      }
    } else if (direction === "right-to-left") {
      // 右→左：更新左侧对应行
      if (lineIdx < leftLines.value.length) {
        // 直接修改目标行，保持其他行不变
        leftLines.value[lineIdx] = rightLineText;
        realDiffData.value.l[lineIdx] = [
          { t: CHAR_SEGMENT_TYPE.EQUAL, v: rightLineText },
        ];
        realDiffData.value.r[lineIdx] = [{ t: CHAR_SEGMENT_TYPE.EQUAL, v: "" }];
      } else {
        while (leftLines.value.length <= lineIdx) {
          leftLines.value.push("");
        }
        leftLines.value[lineIdx] = rightLineText;
      }
    }

    // 保持滚动位置
    scrollToLine(lineIdx);
  } catch (error) {
    ElMessage.error(`同步行内容失败：${error.message}`);
    console.error("同步行失败:", error);
  }
};

// ========== 撤销/重做功能（修复：边界情况无操作无提示） ==========
// 撤销
const undo = () => {
  // 边界情况：无操作可撤销，直接返回
  if (!canUndo.value) {
    return;
  }

  isHistoryChanging.value = true;

  try {
    // 获取当前历史记录
    const record = historyStack.value[historyIndex.value];

    // 恢复状态
    realDiffData.value.l[record.lineIdx] = JSON.parse(JSON.stringify(record.l));
    realDiffData.value.r[record.lineIdx] = JSON.parse(JSON.stringify(record.r));

    // 历史索引减1
    historyIndex.value--;
  } catch (error) {
    ElMessage.error(`撤销操作失败：${error.message}`);
    console.error("撤销失败:", error);
  } finally {
    isHistoryChanging.value = false;
  }
};

// 重做
const redo = () => {
  // 边界情况：无操作可重做，直接返回
  if (!canRedo.value) {
    return;
  }

  isHistoryChanging.value = true;

  try {
    // 历史索引加1
    historyIndex.value++;

    // 获取下一个历史记录
    const record = historyStack.value[historyIndex.value];

    // 恢复状态
    realDiffData.value.l[record.lineIdx] = JSON.parse(JSON.stringify(record.l));
    realDiffData.value.r[record.lineIdx] = JSON.parse(JSON.stringify(record.r));
  } catch (error) {
    ElMessage.error(`重做操作失败：${error.message}`);
    console.error("重做失败:", error);
  } finally {
    isHistoryChanging.value = false;
  }
};

// 键盘快捷键监听
const handleKeyDown = (e) => {
  // 判断是否是 Mac 系统
  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  // Ctrl+Z / Command+Z：撤销
  if ((e.ctrlKey || (isMac && e.metaKey)) && e.key === "z" && !e.shiftKey) {
    e.preventDefault();
    undo();
  }

  // Ctrl+Y / Command+Y：重做 (Windows)
  // Ctrl+Shift+Z / Command+Shift+Z：重做 (Mac)
  if (
    ((e.ctrlKey || (isMac && e.metaKey)) && e.key === "y") ||
    ((e.ctrlKey || (isMac && e.metaKey)) && e.shiftKey && e.key === "z")
  ) {
    e.preventDefault();
    redo();
  }
};

// ========== 文件操作 ==========
const selectFile = async (side) => {
  try {
    const result = await window.channel.selectFile(side);
    if (result?.path) {
      // 立即更新文件路径+清空原有内容
      if (side === "left") {
        leftFilePath.value = result.path;
        leftLines.value = [];
        originalLeftLines.value = [];
      } else {
        rightFilePath.value = result.path;
        rightLines.value = [];
        originalRightLines.value = [];
      }

      // 重置历史记录
      historyStack.value = [];
      historyIndex.value = -1;

      await loadFileContent(result.path, side);
    }
  } catch (error) {
    ElMessage.error(`选择文件异常：${error.message}`);
    console.error("选择文件异常:", error);
  }
};

const calculateDiff = async () => {
  if (isCalculatingDiff.value || !isDiffMode.value) return;

  isCalculatingDiff.value = true;

  try {
    const diffResult_ = await window.channel.diffFileContent(
      [...leftLines.value],
      [...rightLines.value]
    );

    if (diffResult_.success) {
      const realDiff =
        diffResult_.diffResult?.diffResult || diffResult_.diffResult;
      diffResult.value = realDiff;
      console.log("++++++++++ 计算差异结果 ++++++++++");
      console.log(JSON.stringify(realDiff, null, 2));
      refreshDiffBlocks();

      nextTick(() => {
        initThumbnail();
      });
    } else {
      ElMessage.error(`计算差异失败：${diffResult_.error}`);
    }
  } catch (error) {
    ElMessage.error(`计算差异异常：${error.message}`);
  } finally {
    isCalculatingDiff.value = false;
  }
};

const loadFileContent = async (filePath, side) => {
  const contentResult = await window.channel.readFileContent(filePath);
  if (contentResult.success) {
    if (side === "left") {
      originalLeftLines.value = [...contentResult.lines];
      leftLines.value = [...contentResult.lines];
    } else {
      originalRightLines.value = [...contentResult.lines];
      rightLines.value = [...contentResult.lines];
    }

    scrollTopValue.value = 0;

    nextTick(() => {
      initView();

      if (isDiffMode.value) {
        calculateDiff();
      }
    });
  } else {
    if (side === "left") {
      leftFilePath.value = "";
    } else {
      rightFilePath.value = "";
    }
    ElMessage.error(`读取文件失败：${contentResult.error}`);
  }
};

// ========== 初始化和监听 ==========
const initView = () => {
  nextTick(() => {
    const pathBarHeight = pathBarRef.value
      ? pathBarRef.value.getBoundingClientRect().height
      : 40;
    const windowHeight = window.innerHeight;

    if (mainContainerRef.value) {
      mainContainerRef.value.style.height = `${windowHeight - pathBarHeight - 20}px`;
      const containerRect = mainContainerRef.value.getBoundingClientRect();
      viewportHeight.value = containerRect.height;

      if (thumbCanvas.value) {
        const thumbContainer = thumbCanvas.value.parentElement;
        if (thumbContainer) {
          thumbContainer.style.height = `${containerRect.height - 120}px`; // 调整高度，为顶部按钮留出空间
        }
      }

      initThumbnail();
    }
  });
};

const handleResize = () => {
  clearTimeout(thumbnailDebounceTimer.value);
  thumbnailDebounceTimer.value = setTimeout(() => {
    initView();
  }, 100);
};

watch(
  [leftLines, rightLines],
  () => {
    if (!isHistoryChanging.value) {
      nextTick(() => {
        initView();
        if (isDiffMode.value) {
          // calculateDiff();
        }
      });
    }
  },
  { deep: true }
);

watch(
  () => diffResult.value,
  () => {
    if (isValidDiffResult.value) {
      refreshDiffBlocks();
      initView();
    }
  },
  { deep: true }
);

onMounted(() => {
  setTimeout(() => {
    initView();
  }, 100);

  if (leftFilePath.value != "") {
    loadFileContent(leftFilePath.value, "left");
  }
  if (rightFilePath.value != "") {
    loadFileContent(rightFilePath.value, "right");
  }

  window.addEventListener("resize", handleResize);
  // 监听键盘快捷键
  document.addEventListener("keydown", handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
  document.removeEventListener("keydown", handleKeyDown);
  if (thumbnailDebounceTimer.value) {
    clearTimeout(thumbnailDebounceTimer.value);
  }
});
</script>

<style scoped>
/* ========== 核心布局 ========== */
.bc-diff-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #f5f5f5;
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  overflow: hidden;
  position: relative;
  z-index: 1;
}

/* 文件路径栏 */
.bc-path-bar {
  padding: 8px 12px;
  background-color: #e9e9e9;
  border-bottom: 1px solid #d0d0d0;
  display: flex;
  gap: 16px;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
  min-height: 40px;
}

.bc-path-item {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.bc-path-label {
  font-size: 12px;
  color: #666;
  white-space: nowrap;
  flex-shrink: 0;
}

.bc-path-input {
  flex: 1;
  font-size: 12px;
  min-width: 100px;
}

/* 主容器 */
.bc-main-container {
  flex: 1;
  display: flex;
  position: relative;
  overflow: hidden;
  min-height: calc(100vh - 60px);
}

/* 面板样式 */
.bc-panel {
  flex: 1;
  display: flex;
  background-color: #ffffff;
  border: 1px solid #d0d0d0;
  overflow: hidden;
}

.bc-panel-left {
  border-right: none;
}

.bc-panel-right {
  border-left: none;
}

/* 行号栏 */
.bc-line-number-gutter {
  width: 60px;
  background-color: #f0f0f0;
  border-right: 1px solid #d0d0d0;
  flex-shrink: 0;
  overflow: hidden;
  padding-top: 0;
}

.bc-line-number {
  height: 20px;
  line-height: 20px;
  text-align: right;
  padding-right: 8px;
  font-size: 12px;
  color: #888;
  user-select: none;
  box-sizing: border-box;
}

/* 内容区域 */
.bc-content-area {
  flex: 1;
  overflow: auto;
  position: relative;
}

/* 高度占位符 */
.bc-content-placeholder {
  width: 1px;
  position: absolute;
  top: 0;
  left: 0;
}

/* 可视区域内容 */
.bc-viewport-content {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  pointer-events: none;
}

/* 原始内容容器 */
.bc-raw-content {
  width: 100%;
}

/* 行样式 */
.bc-content-line {
  height: 20px;
  line-height: 20px;
  font-size: 12px;
  white-space: pre;
  box-sizing: border-box;
  padding-left: 8px;
  pointer-events: auto;
  position: relative;
  display: flex;
  align-items: center;
}

/* 行内同步按钮：黑色箭头，无hover高亮 */
.bc-line-sync-btn {
  position: absolute;
  right: 8px;
  top: 0;
  z-index: 5;
  pointer-events: auto;
}

/* 自定义箭头按钮样式：黑色，无hover高亮 */
.custom-arrow-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #000000; /* 黑色箭头 */
}

/* 行背景色 */
.bc-line-delete {
  background-color: #ffe8e8;
}

.bc-line-insert {
  background-color: #e8f8e8;
}

.bc-line-equal {
  background-color: #ffffff;
}

.bc-line-empty {
  background-color: #f8f8f8;
  color: #ccc;
}

/* 字符样式 */
.bc-line-content {
  display: inline-block;
  width: 100%;
  padding-right: 30px; /* 为同步按钮留出空间 */
}

.bc-char-delete {
  background-color: #ffcccc;
  color: #cc0000;
  text-decoration: line-through;
}

.bc-char-insert {
  background-color: #ccffcc;
  color: #008000;
  text-decoration: underline;
}

.bc-char-replace {
  background-color: #ffffcc;
  color: #cc8800;
  font-weight: bold;
}

.bc-char-equal {
  color: #000000;
}

/* 分隔栏：确保按钮在最顶部 */
.bc-divider {
  width: 40px;
  background-color: #e9e9e9;
  border: 1px solid #d0d0d0;
  border-left: none;
  border-right: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

/* 控制按钮：在最顶部，不收缩 */
.bc-control-buttons {
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0; /* 不收缩，确保在顶部 */
  border-bottom: 1px solid #d0d0d0;
  width: 100%;
  align-items: center;
  margin-top: 0; /* 确保在最顶部 */
}

/* 缩略图容器：在按钮下方 */
.bc-thumbnail-container {
  flex: 1;
  width: 100%;
  position: relative;
  padding: 4px;
  min-height: 100px;
}

.bc-thumbnail {
  width: 100%;
  height: 100%;
  cursor: grab;
  border-radius: 2px;
  background-color: #f8f8f8;
}

.bc-thumbnail:active {
  cursor: grabbing;
}

/* 视口指示器 */
.bc-viewport-indicator {
  position: absolute;
  left: 4px;
  right: 4px;
  border: 1px solid #000;
  background-color: rgba(255, 255, 255, 0.3);
  pointer-events: none;
}

/* 空状态 */
.bc-empty-state {
  position: absolute;
  top: 40px;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #ffffff;
  z-index: 5;
}

.bc-empty-content {
  text-align: center;
  color: #999;
  padding: 20px;
}

.bc-empty-text {
  margin-top: 16px;
  font-size: 14px;
}

/* ========== 滚动条样式 ========== */
:deep(.bc-content-area::-webkit-scrollbar) {
  width: 10px;
  height: 10px;
}

:deep(.bc-content-area::-webkit-scrollbar-track) {
  background: #f0f0f0;
}

:deep(.bc-content-area::-webkit-scrollbar-thumb) {
  background: #b0b0b0;
  border-radius: 5px;
}

:deep(.bc-content-area::-webkit-scrollbar-thumb:hover) {
  background: #888;
}

/* Firefox 滚动条 */
:deep(.bc-content-area) {
  scrollbar-width: thin;
  scrollbar-color: #b0b0b0 #f0f0f0;
}

/* Element Plus 组件样式 */
:deep(.el-input) {
  width: 100%;
}

:deep(.el-input__inner) {
  font-size: 12px;
  padding: 0 8px;
}

:deep(.el-button) {
  white-space: nowrap;
}

/* 迷你按钮样式 */
:deep(.el-button--mini) {
  width: 20px;
  height: 20px;
  padding: 0;
}

:deep(.el-button.is-disabled) {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
