<template>
  <canvas ref="screenshotCanvas" class="capture-canvas"></canvas>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";

const screenshotCanvas = ref(null);
const ctx = ref(null);
const isDrawing = ref(false); // 是否正在绘制
const startPos = ref({ x: 0, y: 0 }); // 拖拽起点

function init() {
  ctx.value = screenshotCanvas.value.getContext("2d");
  const { width, height } = window.screen;
  screenshotCanvas.value.width = width;
  screenshotCanvas.value.height = height;
}

function onBindMouseEvents() {
  const canvas = screenshotCanvas.value;

  // 鼠标按下：记录起点，开始绘制
  canvas.addEventListener("mousedown", (e) => {
    isDrawing.value = true;
    // 获取鼠标相对于屏幕的坐标（clientX/Y 是相对于 Canvas 的，和屏幕一致）
    startPos.value.x = e.clientX;
    startPos.value.y = e.clientY;
  });

  // 鼠标移动：实时绘制选取矩形
  canvas.addEventListener("mousemove", (e) => {
    if (!isDrawing.value) return;

    // 计算当前拖拽区域的宽高和左上角坐标
    const currentX = e.clientX;
    const currentY = e.clientY;
    const rectX = Math.min(startPos.value.x, currentX);
    const rectY = Math.min(startPos.value.y, currentY);
    const rectWidth = Math.abs(currentX - startPos.value.x);
    const rectHeight = Math.abs(currentY - startPos.value.y);

    // 每次移动前清空 Canvas，避免残留上一次的绘制痕迹
    ctx.value.clearRect(0, 0, canvas.width, canvas.height);
    // 绘制半透明的选取背景 + 白色虚线边框
    ctx.value.fillStyle = "rgba(0, 0, 0, 0.2)";
    ctx.value.fillRect(rectX, rectY, rectWidth, rectHeight);
    ctx.value.strokeStyle = "#ffffff";
    ctx.value.setLineDash([5, 5]); // 虚线样式
    ctx.value.lineWidth = 1;
    ctx.value.strokeRect(rectX, rectY, rectWidth, rectHeight);
  });

  // 鼠标抬起：结束绘制，确定截取区域
  canvas.addEventListener("mouseup", (e) => {
    if (!isDrawing.value) return;
    isDrawing.value = false;

    // 最终确定的截取区域坐标
    const captureRect = {
      x: Math.min(startPos.value.x, e.clientX),
      y: Math.min(startPos.value.y, e.clientY),
      width: Math.abs(e.clientX - startPos.value.x),
      height: Math.abs(e.clientY - startPos.value.y),
    };

    // 根据 captureRect 截取对应区域的屏幕内容
    captureScreenArea(captureRect);
  });
}

// 根据选取区域截取屏幕
async function captureScreenArea(rect) {
  const screenImage = await window.ipcRenderer.invoke("capture-area", rect);
}

onMounted(() => {
  init();
  onBindMouseEvents();
});
</script>
<style type="scss">
.capture-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  cursor: crosshair; /* 鼠标变成十字准星，提示可绘制 */
  z-index: 9999; /* 确保在最顶层 */
}
</style>
