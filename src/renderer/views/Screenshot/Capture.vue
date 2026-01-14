<template>
  <canvas
    ref="screenshotCanvas"
    class="capture-canvas"
    tabindex="0"
    style="outline: none"
  ></canvas>
  <!-- 放大预览窗 -->
  <div v-if="isMagnifierShow" :style="magnifierStyle" class="magnifier-card">
    <canvas
      ref="magnifierCanvas"
      :width="magnifierSize"
      :height="magnifierSize"
      class="magnifier-canvas"
    ></canvas>
    <!-- 十字线 -->
    <div class="magnifier-cross"></div>
  </div>

  <!-- 标记工具栏 -->
  <MarkToolbar
    ref="toolbarRef"
    :visible="showToolbar"
    :position="toolbarPos"
    :captureRect="currentSelection"
    :markManager="markManager"
    @toolChange="handleToolChange"
    @cancel="handleToolbarCancel"
    @finish="handleToolbarFinish"
  />
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import MarkToolbar from "./MarkToolbar.vue";
import MarkManager from "./MarkManager.js";

// ========== 基础变量定义 ==========
const screenshotCanvas = ref(null);
const ctx = ref(null);
const isDrawing = ref(false); // 是否正在绘制选区
const startPos = ref({ x: 0, y: 0 });
const fullScreenImage = ref(null);
const screenSize = ref({ width: 0, height: 0 });

// 选区相关
const currentSelection = ref({ x: 0, y: 0, width: 0, height: 0 });
const lastSelection = ref({ x: 0, y: 0, width: 0, height: 0 });
const lastTextRect = ref({ x: 0, y: 0, width: 0, height: 0 });
const captureStarted = ref(false); // 是否开始截图流程

// 离屏Canvas（缓存全屏截图）
const offscreenCanvas = ref(null);
const offscreenCtx = ref(null);

// 放大预览相关
const magnifierCanvas = ref(null);
const magnifierCtx = ref(null);
const isMagnifierShow = ref(false);
const magnifierSize = ref(200);
const magnifierScale = ref(3);
const magnifierRadius = ref(20);
const magnifierPos = ref({ x: 0, y: 0 });

// 工具栏相关
const toolbarRef = ref(null);
const showToolbar = ref(false);
const toolbarPos = ref({ x: 0, y: 0 });
const toolbarSize = ref({ width: 280, height: 60 });

// 标注相关
const markManager = ref(null); // 标注管理器实例
const currentMarkTool = ref("select"); // 当前选中的标注工具

// ========== 计算属性 ==========
// 放大窗样式
const magnifierStyle = computed(() => ({
  position: "fixed",
  zIndex: 10000,
  width: `${magnifierSize.value}px`,
  height: `${magnifierSize.value}px`,
  padding: 0,
  margin: 0,
  left: `${magnifierPos.value.x}px`,
  top: `${magnifierPos.value.y}px`,
  boxShadow: "0 0 10px rgba(0,0,0,0.5)",
  borderRadius: "4px",
  overflow: "hidden",
  background: "#fff",
}));

// ========== 初始化逻辑 ==========
async function init() {
  await nextTick();
  if (!screenshotCanvas.value) return;

  // 获取屏幕真实尺寸
  const { width, height } = window.screen;
  screenSize.value.width = width;
  screenSize.value.height = height;

  // 初始化Canvas
  try {
    // 离屏Canvas（缓存全屏截图）
    offscreenCanvas.value = document.createElement("canvas");
    offscreenCanvas.value.width = width;
    offscreenCanvas.value.height = height;
    offscreenCtx.value = offscreenCanvas.value.getContext("2d");

    // 主Canvas
    ctx.value = screenshotCanvas.value.getContext("2d");
    screenshotCanvas.value.width = width;
    screenshotCanvas.value.height = height;

    // 放大预览Canvas
    if (magnifierCanvas.value) {
      magnifierCtx.value = magnifierCanvas.value.getContext("2d");
    }

    // 初始化标注管理器
    markManager.value = new MarkManager(
      screenshotCanvas.value,
      offscreenCanvas.value,
      screenSize.value
    );
  } catch (err) {
    console.error("Canvas初始化失败：", err);
    return;
  }

  // 获取全屏截图
  try {
    const dataUrl = await window.channel.getDesktopScreenshot();
    if (!dataUrl) throw new Error("主进程返回截图数据为空");

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        // 绘制到离屏Canvas缓存
        offscreenCtx.value.drawImage(img, 0, 0, width, height);
        // 绘制到主Canvas
        ctx.value.drawImage(offscreenCanvas.value, 0, 0);
        fullScreenImage.value = img;
        // 绑定鼠标事件
        bindMouseEvents();
      } catch (err) {
        console.error("绘制截图到Canvas失败：", err);
      }
    };
    img.onerror = (err) => {
      console.error("图片加载失败：", err);
    };
    img.src = dataUrl;
  } catch (error) {
    console.error("获取/渲染截图失败：", error);
  }
}

// ========== 选区绘制相关 ==========
// 精准清除上一次的选区（包括矩形和文字）
function clearLastSelection() {
  // 清除选区矩形
  const { x, y, width, height } = lastSelection.value;
  if (width > 2 && height > 2) {
    ctx.value.drawImage(
      offscreenCanvas.value,
      x - 2,
      y - 2,
      width + 4,
      height + 4,
      x - 2,
      y - 2,
      width + 4,
      height + 4
    );
  }

  // 清除文字区域
  const { x: tx, y: ty, width: tw, height: th } = lastTextRect.value;
  if (tw > 0 && th > 0) {
    ctx.value.drawImage(offscreenCanvas.value, tx, ty, tw, th, tx, ty, tw, th);
  }
}

// 绘制当前选区（包括宽高文字）
function drawCurrentSelection() {
  const { x, y, width, height } = currentSelection.value;
  if (width < 2 || height < 2) return;

  // 绘制选区遮罩
  ctx.value.fillStyle = "rgba(0, 0, 0, 0.2)";
  ctx.value.fillRect(x, y, width, height);

  // 绘制选区边框
  ctx.value.strokeStyle = "#ffffff";
  ctx.value.setLineDash([5, 5]);
  ctx.value.lineWidth = 1;
  ctx.value.strokeRect(x, y, width, height);
  ctx.value.setLineDash([]);

  // 绘制宽高文字（带背景）
  const text = `${Math.round(width)} × ${Math.round(height)}`;
  ctx.value.font = "12px Microsoft YaHei";
  const textWidth = ctx.value.measureText(text).width + 10;
  const textHeight = 20;
  const textX = x + 5;
  const textY = Math.max(y - 10, textHeight + 5);

  // 记录文字区域
  lastTextRect.value = {
    x: textX - 5,
    y: textY - textHeight,
    width: textWidth,
    height: textHeight,
  };

  // 绘制文字背景
  ctx.value.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.value.fillRect(textX - 5, textY - textHeight, textWidth, textHeight);

  // 绘制文字
  ctx.value.fillStyle = "#ffffff";
  ctx.value.textAlign = "left";
  ctx.value.textBaseline = "bottom";
  ctx.value.fillText(text, textX, textY);

  // 绘制控制点
  drawControlPoints(ctx.value, x, y, width, height);
}

// 绘制选区控制点
function drawControlPoints(ctx, x, y, width, height) {
  const points = [
    { x, y }, // 左上
    { x: x + width / 2, y }, // 上中
    { x: x + width, y }, // 右上
    { x: x + width, y: y + height / 2 }, // 右中
    { x: x + width, y: y + height }, // 右下
    { x: x + width / 2, y: y + height }, // 下中
    { x, y: y + height }, // 左下
    { x, y: y + height / 2 }, // 左中
  ];

  ctx.fillStyle = "#1890ff";
  points.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ========== 放大预览相关 ==========
function updateMagnifier(e) {
  if (!offscreenCanvas.value || !magnifierCtx.value) return;

  // 计算鼠标真实坐标
  const rect = screenshotCanvas.value.getBoundingClientRect();
  const scaleX = screenSize.value.width / rect.width;
  const scaleY = screenSize.value.height / rect.height;
  const mouseX = e.clientX * scaleX;
  const mouseY = e.clientY * scaleY;

  // 计算放大窗位置（自适应边界）
  let magnifierX = e.clientX + 20;
  let magnifierY = e.clientY + 20;

  // 边界检测
  if (magnifierX + magnifierSize.value > window.innerWidth) {
    magnifierX = e.clientX - magnifierSize.value - 20;
  }
  if (magnifierY + magnifierSize.value > window.innerHeight) {
    magnifierY = e.clientY - magnifierSize.value - 20;
  }
  if (magnifierX < 0) magnifierX = 20;
  if (magnifierY < 0) magnifierY = 20;

  magnifierPos.value = { x: magnifierX, y: magnifierY };

  // 绘制放大预览
  const radius = magnifierRadius.value;
  magnifierCtx.value.clearRect(0, 0, magnifierSize.value, magnifierSize.value);
  magnifierCtx.value.drawImage(
    offscreenCanvas.value,
    mouseX - radius,
    mouseY - radius,
    radius * 2,
    radius * 2,
    0,
    0,
    magnifierSize.value,
    magnifierSize.value
  );
}

// ========== 工具栏位置计算 ==========
function calculateToolbarPos() {
  const { x, y, width, height } = currentSelection.value;
  const rect = screenshotCanvas.value.getBoundingClientRect();
  const scaleX = rect.width / screenSize.value.width;
  const scaleY = rect.height / screenSize.value.height;

  // 转换为视口坐标（水平居中）
  const viewportX = x * scaleX + (width * scaleX - toolbarSize.value.width) / 2;
  let viewportY = y * scaleY + height * scaleY + 10; // 选区下方

  // 边界适配
  if (viewportY + toolbarSize.value.height > window.innerHeight) {
    viewportY = y * scaleY - toolbarSize.value.height - 10; // 选区上方
  }
  if (viewportX < 0) viewportX = 20;
  if (viewportX + toolbarSize.value.width > window.innerWidth) {
    viewportX = window.innerWidth - toolbarSize.value.width - 20;
  }

  toolbarPos.value = { x: viewportX, y: viewportY };
}

// ========== 事件绑定 ==========
function bindMouseEvents() {
  const canvas = screenshotCanvas.value;
  if (!canvas) return;
  // 鼠标按下事件
  const handleMousedown = (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = screenSize.value.width / rect.width;
    const scaleY = screenSize.value.height / rect.height;
    const mouseX = e.clientX * scaleX;
    const mouseY = e.clientY * scaleY;

    // 如果显示工具栏（标注模式）
    if (showToolbar.value) {
      // 标注工具逻辑
      if (currentMarkTool.value !== "select" && markManager.value) {
        markManager.value.startDrawing(currentMarkTool.value, mouseX, mouseY);
      }
      return;
    }

    // 选区绘制逻辑
    if (!captureStarted.value) {
      captureStarted.value = true;
      isDrawing.value = true;
      startPos.value = { x: mouseX, y: mouseY };
      currentSelection.value = { x: mouseX, y: mouseY, width: 0, height: 0 };
      lastSelection.value = { x: 0, y: 0, width: 0, height: 0 };
      lastTextRect.value = { x: 0, y: 0, width: 0, height: 0 };

      // 显示放大预览
      isMagnifierShow.value = true;
      updateMagnifier(e);
    }
  };

  // 鼠标移动事件
  const handleMousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = screenSize.value.width / rect.width;
    const scaleY = screenSize.value.height / rect.height;
    const mouseX = e.clientX * scaleX;
    const mouseY = e.clientY * scaleY;

    // 标注模式
    if (
      showToolbar.value &&
      markManager.value &&
      markManager.value.isDrawingShape
    ) {
      markManager.value.updateDrawing(mouseX, mouseY);
      return;
    }

    // 选区绘制模式
    if (captureStarted.value && isDrawing.value) {
      // 更新放大预览
      isMagnifierShow.value = true;
      updateMagnifier(e);

      // 计算当前选区
      currentSelection.value = {
        x: Math.min(startPos.value.x, mouseX),
        y: Math.min(startPos.value.y, mouseY),
        width: Math.abs(mouseX - startPos.value.x),
        height: Math.abs(mouseY - startPos.value.y),
      };

      // 清除上一次选区，绘制新选区
      clearLastSelection();
      drawCurrentSelection();
      lastSelection.value = { ...currentSelection.value };
    }
  };

  // 鼠标抬起事件
  const handleMouseup = (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = screenSize.value.width / rect.width;
    const scaleY = screenSize.value.height / rect.height;
    const mouseX = e.clientX * scaleX;
    const mouseY = e.clientY * scaleY;

    // 标注模式
    if (showToolbar.value && markManager.value) {
      if (markManager.value.isDrawingShape) {
        markManager.value.finishDrawing();
      }
      return;
    }

    // 选区绘制完成
    if (isDrawing.value && captureStarted.value) {
      isDrawing.value = false;
      isMagnifierShow.value = false;

      // 跳过空选区
      if (
        currentSelection.value.width < 2 ||
        currentSelection.value.height < 2
      ) {
        captureStarted.value = false;
        return;
      }

      // 显示标注工具栏
      calculateToolbarPos();
      showToolbar.value = true;
    }
  };

  // 鼠标离开事件
  const handleMouseleave = () => {
    if (isDrawing.value) {
      isMagnifierShow.value = false;
    }
  };

  // ESC取消
  const handleKeydown = (e) => {
    if (e.key === "Escape") {
      resetCaptureState();
      window.channel.cancelScreenshot();
    }
  };

  canvas.focus();
  // 绑定事件
  canvas.addEventListener("mousedown", handleMousedown);
  canvas.addEventListener("mousemove", handleMousemove);
  canvas.addEventListener("mouseup", handleMouseup);
  canvas.addEventListener("mouseleave", handleMouseleave);
  canvas.addEventListener('keydown', handleKeydown);
  document.addEventListener("keydown", handleKeydown);

  // 解绑事件
  onUnmounted(() => {
    canvas.removeEventListener("mousedown", handleMousedown);
    canvas.removeEventListener("mousemove", handleMousemove);
    canvas.removeEventListener("mouseup", handleMouseup);
    canvas.removeEventListener("mouseleave", handleMouseleave);
    canvas.removeEventListener("keydown", handleKeydown);
    document.removeEventListener("keydown", handleKeydown);
  });
}

// ========== 工具栏交互 ==========
// 切换标注工具
function handleToolChange(tool) {
  currentMarkTool.value = tool;
  // 切换鼠标样式
  const canvas = screenshotCanvas.value;
  if (canvas) {
    canvas.style.cursor = tool === "select" ? "default" : "crosshair";
  }
}

// 工具栏取消按钮
function handleToolbarCancel() {
  resetCaptureState();
  if (window.channel) window.channel.cancelScreenshot();
}

// 工具栏完成按钮
async function handleToolbarFinish() {
  if (!markManager.value || currentSelection.value.width < 2) return;

  try {
    // 获取包含标注的最终截图
    const imageData = markManager.value.getFinalImageData(
      currentSelection.value
    );

    // 复制到剪贴板
    if (window.electronAPI) {
      await window.electronAPI.copyToClipboard(imageData);
      alert("截图（含标注）已复制到剪贴板！");
    }

    // 通知主进程完成截图
    if (window.channel) {
      await window.channel.finishScreenshot({
        dataUrl: imageData,
        rect: currentSelection.value,
      });
    }

    resetCaptureState();
  } catch (err) {
    console.error("完成截图失败：", err);
  }
}

// ========== 状态重置 ==========
function resetCaptureState() {
  // 重置基础状态
  captureStarted.value = false;
  isDrawing.value = false;
  isMagnifierShow.value = false;
  showToolbar.value = false;
  currentMarkTool.value = "select";

  // 重置选区
  currentSelection.value = { x: 0, y: 0, width: 0, height: 0 };
  lastSelection.value = { x: 0, y: 0, width: 0, height: 0 };
  lastTextRect.value = { x: 0, y: 0, width: 0, height: 0 };

  // 清空标注
  if (markManager.value) {
    markManager.value.clear();
  }

  // 恢复全屏截图
  if (ctx.value && offscreenCanvas.value) {
    ctx.value.drawImage(offscreenCanvas.value, 0, 0);
    screenshotCanvas.value.style.cursor = "crosshair";
  }
}

// ========== 生命周期 ==========
onMounted(async () => {
  await nextTick();
  await init();
});

onUnmounted(() => {
  resetCaptureState();
  // 清理资源
  offscreenCanvas.value = null;
  offscreenCtx.value = null;
  fullScreenImage.value = null;
  ctx.value = null;
  magnifierCtx.value = null;
});
</script>

<style scoped>
.capture-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  cursor: crosshair;
  z-index: 9999;
  background: transparent;
  border: none;
  outline: none;
}

/* 放大预览窗样式 */
.magnifier-card {
  border-radius: 4px;
  overflow: hidden;
}

.magnifier-canvas {
  width: 100%;
  height: 100%;
  image-rendering: pixelated; /* 保持像素感 */
}

/* 放大窗十字线 */
.magnifier-cross {
  position: absolute;
  top: 50%;
  left: 0;
  width: 100%;
  height: 1px;
  background: #ff0000;
  transform: translateY(-50%);
  z-index: 1;
}

.magnifier-cross::after {
  content: "";
  position: absolute;
  top: 0;
  left: 50%;
  width: 1px;
  height: 100%;
  background: #ff0000;
  transform: translateX(-50%);
}
</style>
