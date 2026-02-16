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
      <!-- 左侧虚拟列表 Diff 面板 -->
      <div class="diff-panel left-panel" ref="leftPanelRef">
        <el-scrollbar
          ref="leftScrollbar"
          @scroll="handleScroll('left')"
          class="diff-scrollbar"
        >
          <!-- 占位容器（用于撑起滚动条高度） -->
          <div
            class="virtual-list-placeholder"
            :style="{ height: `${totalHeight}px` }"
            v-if="diffResult"
          />
          <!-- 可视区域内容 -->
          <div
            class="virtual-list-viewport"
            :style="{ transform: `translateY(${viewportTop}px)` }"
            v-if="diffResult"
          >
            <div
              v-for="item in visibleItems"
              :key="`left-${item.leftLine || item.rightLine}-${item.type}-${item.key}`"
              class="diff-line"
              :class="{
                'line-delete':
                  item.type === 'delete' || item.type === 'replace',
                'line-equal': item.type === 'equal',
                'line-empty': item.leftLine === -1,
              }"
            >
              <span class="line-number">{{ item.leftLine + 1 || "" }}</span>
              <span class="line-content">{{
                item.leftContent || item.content || ""
              }}</span>
            </div>
          </div>
        </el-scrollbar>
        <div v-if="!diffResult" class="empty-tip">请选择文件进行对比</div>
      </div>

      <!-- 中间缩略图与控制区 -->
      <div class="diff-thumb-section">
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

      <!-- 右侧虚拟列表 Diff 面板 -->
      <div class="diff-panel right-panel" ref="rightPanelRef">
        <el-scrollbar
          ref="rightScrollbar"
          @scroll="handleScroll('right')"
          class="diff-scrollbar"
        >
          <!-- 占位容器 -->
          <div
            class="virtual-list-placeholder"
            :style="{ height: `${totalHeight}px` }"
            v-if="diffResult"
          />
          <!-- 可视区域内容 -->
          <div
            class="virtual-list-viewport"
            :style="{ transform: `translateY(${viewportTop}px)` }"
            v-if="diffResult"
          >
            <div
              v-for="item in visibleItems"
              :key="`right-${item.leftLine || item.rightLine}-${item.type}-${item.key}`"
              class="diff-line"
              :class="{
                'line-insert':
                  item.type === 'insert' || item.type === 'replace',
                'line-equal': item.type === 'equal',
                'line-empty': item.rightLine === -1,
              }"
            >
              <span class="line-number">{{ item.rightLine + 1 || "" }}</span>
              <span class="line-content">{{
                item.rightContent || item.content || ""
              }}</span>
            </div>
          </div>
        </el-scrollbar>
        <div v-if="!diffResult" class="empty-tip">请选择文件进行对比</div>
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

// 基础状态
const leftFilePath = ref("");
const rightFilePath = ref("");
const leftLines = ref([]);
const rightLines = ref([]);
const diffResult = ref(null);
const thumbCanvas = ref(null);
const isDragging = ref(false);
const currentBlockIndex = ref(0);

// DOM 引用
const contentSectionRef = ref(null);
const leftPanelRef = ref(null);
const rightPanelRef = ref(null);

// 滚动条引用
const leftScrollbar = ref(null);
const rightScrollbar = ref(null);

// 虚拟列表核心配置
const LINE_HEIGHT = 20; // 每行固定高度
const VIEWPORT_EXTRA = 10; // 可视区域外额外渲染的行数（防止滚动空白）
const viewportHeight = ref(0); // 可视区域高度（初始化为0，避免NaN）
const viewportTop = ref(0); // 可视区域偏移量
const scrollTop = ref(0); // 滚动条位置
const isCalculatingDiff = ref(false); // 防止重复计算差异

// 计算总高度和可视区域内的项
const totalHeight = computed(() => {
  return diffResult.value
    ? (diffResult.value.diffs?.length || 0) * LINE_HEIGHT
    : 0;
});

const visibleItems = computed(() => {
  if (!diffResult.value || !diffResult.value.diffs) return [];

  // 计算可视区域起始/结束行（加边界保护）
  const startIndex = Math.max(
    0,
    Math.floor(scrollTop.value / LINE_HEIGHT) - VIEWPORT_EXTRA
  );
  const endIndex = Math.min(
    (diffResult.value.diffs.length || 0) - 1,
    Math.floor((scrollTop.value + viewportHeight.value) / LINE_HEIGHT) +
      VIEWPORT_EXTRA
  );

  // 给每项添加唯一key，避免v-for key重复
  return diffResult.value.diffs
    .slice(startIndex, endIndex + 1)
    .map((item, idx) => ({
      ...item,
      key: `${startIndex + idx}`,
    }));
});

// 安全操作滚动条的工具方法
const safeSetScrollTop = (scrollbarRef, value) => {
  nextTick(() => {
    try {
      if (
        scrollbarRef.value &&
        typeof scrollbarRef.value.setScrollTop === "function"
      ) {
        scrollbarRef.value.setScrollTop(Math.max(0, value));
      }
    } catch (e) {
      console.warn("设置滚动条位置失败：", e);
    }
  });
};

// 监听滚动事件（修复同步逻辑）
const handleScroll = (side) => {
  try {
    if (side === "left" && leftScrollbar.value) {
      const newScrollTop = leftScrollbar.value.wrapRef?.scrollTop || 0;
      if (newScrollTop !== scrollTop.value) {
        scrollTop.value = newScrollTop;
        viewportTop.value = scrollTop.value - (scrollTop.value % LINE_HEIGHT);

        // 同步右侧滚动（异步执行，避免更新阶段循环）
        safeSetScrollTop(rightScrollbar, scrollTop.value);
      }
    } else if (side === "right" && rightScrollbar.value) {
      // 右侧滚动时同步左侧（可选）
      const newScrollTop = rightScrollbar.value.wrapRef?.scrollTop || 0;
      if (newScrollTop !== scrollTop.value) {
        scrollTop.value = newScrollTop;
        viewportTop.value = scrollTop.value - (scrollTop.value % LINE_HEIGHT);
        safeSetScrollTop(leftScrollbar, scrollTop.value);
      }
    }
  } catch (e) {
    console.warn("处理滚动事件失败：", e);
  }
};

// 选择文件（添加防抖）
const selectFile = async (side) => {
  try {
    const result = await window.channel.selectFile(side);
    if (result && result.path) {
      const contentResult = await window.channel.readFileContent(result.path);
      if (contentResult.success) {
        if (side === "left") {
          leftFilePath.value = result.path;
          leftLines.value = [...contentResult.lines]; // 浅拷贝避免引用问题
        } else {
          rightFilePath.value = result.path;
          rightLines.value = [...contentResult.lines];
        }
      } else {
        ElMessage.error(
          `读取${side === "left" ? "左侧" : "右侧"}文件失败：${contentResult.error}`
        );
      }
    }
  } catch (error) {
    ElMessage.error(`选择文件异常：${error.message}`);
  }
};

// 计算差异（添加锁防止重复执行）
const calculateDiff = async () => {
  // 防止并发执行和空数据执行
  if (
    isCalculatingDiff.value ||
    !leftLines.value.length ||
    !rightLines.value.length
  )
    return;

  isCalculatingDiff.value = true;
  try {
    const diffResult_ = await window.channel.diffFileContent(
      leftLines.value,
      rightLines.value
    );
    if (diffResult_.success) {
      diffResult.value = diffResult_.diffResult;
      // 异步绘制缩略图，避免更新阶段阻塞
      nextTick(() => {
        drawDiffThumb();
        // 重置滚动位置
        safeSetScrollTop(leftScrollbar, 0);
        safeSetScrollTop(rightScrollbar, 0);
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

// 绘制差异缩略图（修复画布尺寸和绘制逻辑）
const drawDiffThumb = () => {
  if (!thumbCanvas.value || !diffResult.value || !diffResult.value.diffs)
    return;

  const canvas = thumbCanvas.value;
  const ctx = canvas.getContext("2d");

  // 适配容器尺寸，避免画布拉伸
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const totalLines = Math.max(
    diffResult.value.leftTotalLines || 0,
    diffResult.value.rightTotalLines || 0
  );
  if (totalLines === 0) return;

  const lineHeight = canvas.height / totalLines;
  const halfWidth = canvas.width / 2;

  diffResult.value.diffs.forEach((diff) => {
    if (!diff) return;
    const y = (diff.index || 0) * lineHeight;
    if (diff.type === "delete" || diff.type === "replace") {
      ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
      ctx.fillRect(0, y, halfWidth, lineHeight);
    }
    if (diff.type === "insert" || diff.type === "replace") {
      ctx.fillStyle = "rgba(0, 255, 0, 0.5)";
      ctx.fillRect(halfWidth, y, halfWidth, lineHeight);
    }
  });
};

// 缩略图拖拽（添加边界保护）
const startDragThumb = (e) => {
  isDragging.value = true;
  // 绑定事件时使用passive: false，避免滚动冲突
  document.addEventListener("mousemove", dragThumb, { passive: false });
  document.addEventListener("mouseup", stopDragThumb);
  e.preventDefault(); // 阻止默认行为
};

const dragThumb = (e) => {
  if (!isDragging.value || !thumbCanvas.value || !diffResult.value) return;

  try {
    const canvas = thumbCanvas.value;
    const rect = canvas.getBoundingClientRect();
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    const scrollRatio = y / rect.height;
    const targetScrollTop = scrollRatio * totalHeight.value;

    safeSetScrollTop(leftScrollbar, targetScrollTop);
  } catch (e) {
    console.warn("拖拽缩略图失败：", e);
  }
};

const stopDragThumb = () => {
  isDragging.value = false;
  document.removeEventListener("mousemove", dragThumb);
  document.removeEventListener("mouseup", stopDragThumb);
};

// 区块同步（添加边界检查）
const syncBlock = (direction) => {
  try {
    if (!diffResult.value || !Array.isArray(diffResult.value.blocks)) return;

    const diffBlocks = diffResult.value.blocks.filter(
      (block) => block?.type === "diff"
    );
    if (diffBlocks.length === 0) {
      ElMessage.info("暂无差异区块");
      return;
    }

    if (direction === "left") {
      currentBlockIndex.value =
        (currentBlockIndex.value - 1 + diffBlocks.length) % diffBlocks.length;
    } else {
      currentBlockIndex.value =
        (currentBlockIndex.value + 1) % diffBlocks.length;
    }

    const targetBlock = diffBlocks[currentBlockIndex.value];
    if (!targetBlock) return;

    const targetScrollTop = (targetBlock.start || 0) * LINE_HEIGHT;
    safeSetScrollTop(leftScrollbar, targetScrollTop);
    ElMessage.success(
      `跳转到差异区块 ${currentBlockIndex.value + 1}/${diffBlocks.length}`
    );
  } catch (e) {
    ElMessage.error(`区块跳转失败：${e.message}`);
  }
};

// 监听文件内容变化（添加防抖和条件判断）
watch(
  [leftLines, rightLines],
  async ([newLeft, newRight], [oldLeft, oldRight]) => {
    // 避免空数组触发
    if (newLeft.length === 0 && newRight.length === 0) return;
    // 避免无意义的重复触发
    if (
      JSON.stringify(newLeft) === JSON.stringify(oldLeft) &&
      JSON.stringify(newRight) === JSON.stringify(oldRight)
    )
      return;

    // 延迟执行，避免频繁触发
    await nextTick();
    calculateDiff();
  },
  { deep: false }
); // 关闭深度监听，改用浅比较+JSON.stringify

// 初始化和自适应
const initViewportSize = () => {
  nextTick(() => {
    // 适配Tab容器高度，移除100vh
    if (leftPanelRef.value) {
      const panelRect = leftPanelRef.value.getBoundingClientRect();
      viewportHeight.value = Math.max(100, panelRect.height - 20); // 最小高度保护
    }

    // 初始化画布尺寸
    if (thumbCanvas.value) {
      thumbCanvas.value.width = 60;
      thumbCanvas.value.height = viewportHeight.value;
    }

    // 重新绘制缩略图
    if (diffResult.value) {
      drawDiffThumb();
    }
  });
};

// 组件挂载时初始化
onMounted(() => {
  initViewportSize();
  // 监听窗口大小变化，自适应高度
  window.addEventListener("resize", initViewportSize);
});

// 组件更新后重新计算尺寸
onUpdated(() => {
  initViewportSize();
});

// 组件卸载时清理事件
onUnmounted(() => {
  window.removeEventListener("resize", initViewportSize);
  document.removeEventListener("mousemove", dragThumb);
  document.removeEventListener("mouseup", stopDragThumb);
});
</script>

<style scoped>
.file-diff-container {
  width: 100%;
  height: 100%; /* 改为100%适配Tab容器，移除100vh */
  display: flex;
  flex-direction: column;
  padding: 10px;
  box-sizing: border-box;
  overflow: hidden; /* 防止容器溢出 */
}

.file-path-section {
  display: flex;
  gap: 20px;
  margin-bottom: 10px;
  flex-shrink: 0; /* 防止被压缩 */
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
  height: 100%; /* 明确高度 */
}

.diff-scrollbar {
  width: 100%;
  height: 100%;
}

/* 虚拟列表核心样式（修复定位问题） */
.virtual-list-placeholder {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  pointer-events: none;
  z-index: 0;
}

.virtual-list-viewport {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  will-change: transform;
  z-index: 1;
}

.diff-thumb-section {
  width: 60px;
  border: 1px solid #e6e6e6;
  border-left: none;
  border-right: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #f5f5f5;
  flex-shrink: 0; /* 防止被压缩 */
}

.diff-thumb {
  width: 100%;
  flex: 1;
  cursor: grab;
  display: block; /* 移除canvas默认内边距 */
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

.diff-line {
  display: flex;
  height: 20px;
  line-height: 20px;
  font-family: monospace;
  font-size: 14px;
  width: 100%;
  box-sizing: border-box;
}

.line-number {
  width: 60px;
  text-align: right;
  padding-right: 10px;
  border-right: 1px solid #e6e6e6;
  color: #999;
  flex-shrink: 0; /* 防止数字列被压缩 */
}

.line-content {
  flex: 1;
  padding-left: 10px;
  white-space: pre;
  overflow: hidden;
  text-overflow: ellipsis;
}

.line-delete {
  background: rgba(255, 0, 0, 0.1);
  color: #f00;
}

.line-insert {
  background: rgba(0, 255, 0, 0.1);
  color: #080;
}

.line-equal {
  color: #333;
}

.line-empty {
  opacity: 0.5;
}

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
