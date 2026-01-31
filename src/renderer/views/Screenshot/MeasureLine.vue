<template>
  <canvas
    ref="measureCanvas"
    class="measure-line-canvas"
    :width="canvasSize.width"
    :height="canvasSize.height"
  ></canvas>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from "vue";

const windowOptions = ref(null);
const measureCanvas = ref(null);
const canvasSize = ref({ width: 10, height: 30 });
const dpr = window.devicePixelRatio || 1; // 设备像素比

/**
 * 获取主进程窗口配置
 */
const getWindowOptions = async () => {
  try {
    const options = await window.channel?.getWindowOptions("MeasureLineWnd");
    windowOptions.value = options;
    updateCanvasSize(options?.direction || "top");
    drawMeasureLine(options?.direction || "top");
    return options;
  } catch (error) {
    console.error("获取窗口选项失败:", error);
    return {};
  }
};

/**
 * 监听窗口配置更新
 */
const setupOptionsListener = () => {
  window.channel.on("window-options", (event, newOptions) => {
    windowOptions.value = newOptions;
    updateCanvasSize(newOptions?.direction || "top");
    drawMeasureLine(newOptions?.direction || "top");
  });
};

/**
 * 动态更新 Canvas 尺寸（匹配 SVG 尺寸：横向10×30，纵向30×10）
 */
const updateCanvasSize = (direction) => {
  // 横向（top/bottom）：10×30（和SVG viewBox一致）
  // 纵向（left/right）：30×10（宽高互换）
  if (direction === "top" || direction === "bottom") {
    canvasSize.value = { width: 10, height: 30 };
  } else {
    canvasSize.value = { width: 30, height: 10 };
  }

  if (measureCanvas.value) {
    const canvas = measureCanvas.value;
    // 视觉尺寸（和SVG的width/height一致）
    canvas.style.width = `${canvasSize.value.width}px`;
    canvas.style.height = `${canvasSize.value.height}px`;
    // 物理像素尺寸（适配DPR，保证1px精度）
    canvas.width = canvasSize.value.width;
    canvas.height = canvasSize.value.height;
  }
};

/**
 * 核心绘制：1:1复刻SVG形状 + 物理1px精度
 * @param {string} direction 方向：top/bottom/left/right
 */
const drawMeasureLine = (direction) => {
  if (!measureCanvas.value) return;

  const canvas = measureCanvas.value;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // 重置上下文（避免多次translate叠加）
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // ========== 物理1px适配核心 ==========
  ctx.translate(0.5, 0.5); // 对齐物理像素中心

  // 统一样式（匹配SVG的currentColor，这里用红色示例，可自定义）
  const lineColor = "#ff0000";
  ctx.strokeStyle = lineColor;
  ctx.fillStyle = lineColor;
  ctx.lineWidth = 1; // 匹配SVG的stroke-width="1"
  ctx.lineCap = "butt"; // 无端点延伸，保证1px精准
  ctx.lineJoin = "miter"; // 线条衔接方式匹配SVG

  // ========== 按方向复刻形状 ==========
  switch (direction) {
    case "top":
      // 完全复刻SVG：竖线M5 0→L5 25 + 三角形M5 25→L0 30→L10 30
      drawVerticalLine(ctx, 5, 0, 25); // 竖线
      drawTriangleTop(ctx); // top方向三角形（和SVG一致）
      break;
    case "bottom":
      // bottom方向：竖线M5 5→L5 30 + 三角形M5 5→L0 0→L10 0
      drawVerticalLine(ctx, 5, 5, 30); // 竖线
      drawTriangleBottom(ctx); // 反转的三角形
      break;
    case "left":
      // left方向：横线M0 5→L25 5 + 三角形M25 5→L30 0→L30 10
      drawHorizontalLine(ctx, 0, 5, 25); // 横线
      drawTriangleLeft(ctx); // 左侧方向三角形
      break;
    case "right":
      // right方向：横线M5 5→L30 5 + 三角形M5 5→L0 0→L0 10
      drawHorizontalLine(ctx, 5, 5, 30); // 横线
      drawTriangleRight(ctx); // 右侧方向三角形
      break;
  }

  // 恢复上下文初始状态
  ctx.restore();
};

/**
 * 绘制垂直1px线条（匹配SVG的竖线M5 0 L5 25）
 * @param {CanvasRenderingContext2D} ctx 上下文
 * @param {number} x 竖线X坐标（固定5，和SVG一致）
 * @param {number} startY 起始Y
 * @param {number} endY 结束Y
 */
const drawVerticalLine = (ctx, x, startY, endY) => {
  ctx.beginPath();
  ctx.moveTo(x, startY); // 匹配SVG的M5 0
  ctx.lineTo(x, endY); // 匹配SVG的L5 25
  ctx.stroke(); // 描边（无填充，匹配SVG的fill="none"）
};

/**
 * 绘制水平1px线条（纵向方向用）
 * @param {CanvasRenderingContext2D} ctx 上下文
 * @param {number} startX 起始X
 * @param {number} y 横线Y坐标（固定5）
 * @param {number} endX 结束X
 */
const drawHorizontalLine = (ctx, startX, y, endX) => {
  ctx.beginPath();
  ctx.moveTo(startX, y);
  ctx.lineTo(endX, y);
  ctx.stroke();
};

/**
 * 绘制top方向三角形（完全复刻SVG：M5 25 L0 30 L10 30 Z）
 */
const drawTriangleTop = (ctx) => {
  ctx.beginPath();
  ctx.moveTo(5, 25); // 匹配SVG的M5 25
  ctx.lineTo(0, 30); // 匹配SVG的L0 30
  ctx.lineTo(10, 30); // 匹配SVG的L10 30
  ctx.closePath(); // 匹配SVG的Z
  ctx.fill(); // 仅填充，不描边（匹配SVG的stroke-width="0"）
};

/**
 * 绘制bottom方向三角形（反转top的三角形：M5 5 L0 0 L10 0 Z）
 */
const drawTriangleBottom = (ctx) => {
  ctx.beginPath();
  ctx.moveTo(5, 5);
  ctx.lineTo(0, 0);
  ctx.lineTo(10, 0);
  ctx.closePath();
  ctx.fill();
};

/**
 * 绘制left方向三角形（横向转纵向：M25 5 L30 0 L30 10 Z）
 */
const drawTriangleLeft = (ctx) => {
  ctx.beginPath();
  ctx.moveTo(25, 5);
  ctx.lineTo(30, 0);
  ctx.lineTo(30, 10);
  ctx.closePath();
  ctx.fill();
};

/**
 * 绘制right方向三角形（反转left的三角形：M5 5 L0 0 L0 10 Z）
 */
const drawTriangleRight = (ctx) => {
  ctx.beginPath();
  ctx.moveTo(5, 5);
  ctx.lineTo(0, 0);
  ctx.lineTo(0, 10);
  ctx.closePath();
  ctx.fill();
};

/**
 * 监听方向变化，重新绘制
 */
watch(
  windowOptions,
  (newVal) => {
    if (newVal?.direction) {
      updateCanvasSize(newVal.direction);
      nextTick(() => drawMeasureLine(newVal.direction));
    }
  },
  { deep: true },
);

onMounted(async () => {
  await getWindowOptions();
  setupOptionsListener();
  nextTick(() => drawMeasureLine(windowOptions.value?.direction || "top"));
});

onUnmounted(() => {
  if (window.channel) window.channel.off("window-options");
  measureCanvas.value = null;
});
</script>

<style type="scss" scoped>
.measure-line-canvas {
  display: block;
  border: none;
  outline: none;
  background: transparent;
  cursor: url("@/assets/empty.cur"), auto !important;
}
</style>
