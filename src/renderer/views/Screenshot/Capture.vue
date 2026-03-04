<template>
  <div class="screenshot-container">
    <!-- 桌面背景 -->
    <canvas ref="canvasScreen" class="screen-canvas"></canvas>
    <!-- 中间遮罩层（添加动画类控制）-->
    <div
      ref="canvasMask"
      class="mask-area"
      :class="{ 'mask-animate': isCaptured }"
    ></div>
    <!-- 用户的截图区域（添加动画类控制）-->
    <canvas
      ref="canvasCapture"
      class="capture-canvas"
      :class="{ 'capture-animate': isCaptured }"
      :style="{
        '--translate-x': translateX + 'px',
        '--translate-y': translateY + 'px',
      }"
    ></canvas>

    <!-- 放大窗（仅截图截断显示） -->
    <div
      v-show="showMagnifier"
      class="magnifier-box"
      :style="{ left: `${magnifierPos.x}px`, top: `${magnifierPos.y}px` }"
    >
      <canvas ref="canvasMagnifier" :width="200" :height="200"></canvas>
    </div>
    <!-- 标注工具栏（添加动画类控制）-->
    <MarkToolbar
      ref="toolbarRef"
      :position="toolbarPos"
      :class="{ 'toolbar-animate': isCaptured }"
      :markManager="markManager"
      @markToolChange="onMarkToolChange"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from "vue";
import { useRoute } from "vue-router";
import Screenshot from "./Screenshot.js";
import MarkToolbar from "./MarkToolbar.vue";

// ========== 仅渲染相关的响应式变量 ==========
const route = useRoute();
const canvasScreen = ref(null);
const canvasCapture = ref(null);
const canvasMagnifier = ref(null);
const showMagnifier = ref(true);
const showToolbar = ref(false);
const magnifierPos = ref({ x: -1000, y: -1000 });
let toolbarX = Math.floor((window.screen.width - 500) / 2);
// 工具栏初始y坐标：屏幕高度+200（屏幕外）
let toolbarY = window.screen.height + 200;

const toolbarPos = ref({ x: toolbarX, y: toolbarY });
const markManager = ref(null); // 标注管理器实例
// 新增：标记截图完成状态，控制动画触发
const isCaptured = ref(false);
// 核心：存储需要移动的位移值（初始为0，无位移）
const translateX = ref(0);
const translateY = ref(0);

// 截图类实例
let screenshot = null;

// ========== 生命周期 ==========
onMounted(async () => {
  // 初始化截图类实例
  let captureMode = await window.channel.getWindowOptions("ScreenshotToolWnd");
  screenshot = new Screenshot(
    canvasScreen.value,
    canvasCapture.value,
    canvasMagnifier.value,
    captureMode
  );

  if (captureMode == "window") {
    let windows = await window.channel.enumWindowList();
    screenshot.setWindowList(windows);
  }

  // 初始化截图
  const pngBuffer = await window.channel.getDesktopScreenshot("buffer");
  screenshot.init(pngBuffer);

  // 注册事件监听（接收类内部的状态通知）
  screenshot.on("showMagnifier", (show) => {
    showMagnifier.value = show;
  });
  screenshot.on("magnifierNewPos", (pos) => {
    magnifierPos.value = pos;
  });

  screenshot.on("CaptureFinish", async () => {
    showToolbar.value = false;

    const captureRect = screenshot.getCaptureRect(); // 假设返回 {x, y, width, height}
    if (captureRect) {
      // 平移X = 屏幕中心X - 选中区域中心X
      translateX.value =
        window.innerWidth / 2 - (captureRect.x + captureRect.width / 2);
      // 平移Y = 屏幕中心Y - 选中区域中心Y
      translateY.value =
        window.innerHeight / 2 - (captureRect.y + captureRect.height / 2);
    }

    toolbarPos.value = {
      x: toolbarX, // x保持居中不变
      y: window.screen.height - 40,
    };
    // 2. 等待DOM更新后触发动画
    await nextTick();
    isCaptured.value = true;
  });

  // 绑定鼠标事件（仅转发，无逻辑）
  document.addEventListener("mousedown", screenshot.onMouseDown);
  document.addEventListener("mousemove", screenshot.onMouseMove);
  document.addEventListener("mouseup", screenshot.onMouseUp);
  window.addEventListener("mouseleave", screenshot.onMouseLeave);
  window.addEventListener("keydown", screenshot.onKeyDown);

  markManager.value = screenshot.getMarkManager();
  window.channel.showWindow("CaptureWnd");
});

onUnmounted(() => {
  if (screenshot) {
    screenshot.destroy();
  }
  const canvas = canvasCapture.value; // 修复原代码变量名错误：screenshotCanvas -> canvasCapture
  if (canvas) {
    document.removeEventListener("mousedown", screenshot?.onMouseDown);
    document.removeEventListener("mousemove", screenshot?.onMouseMove);
    document.removeEventListener("mouseup", screenshot?.onMouseUp);
    window.removeEventListener("mouseleave", screenshot?.onMouseLeave);
    window.removeEventListener("keydown", screenshot?.onKeyDown);
  }
});

const onMarkToolChange = (tool) => {
  // 通知截图类切换标注工具
  screenshot?.setMarkTool(tool);
};
</script>

<style>
canvas {
  transform: translateZ(0); /* 触发 GPU 加速 */
  will-change: transform; /* 告诉浏览器提前优化 */
  backface-visibility: hidden; /* 防止闪烁 */
}
.screen-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  cursor: crosshair;
}
/* 遮罩层基础样式 + 优化动画 */
.mask-area {
  position: fixed; /* 补充定位，确保全屏覆盖 */
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  opacity: 0; /* 初始全透明 */
  /* 象棋棋盘底纹 + 半透明遮罩叠加 */
  background:
    linear-gradient(
      45deg,
      #333 25%,
      transparent 25%,
      transparent 75%,
      #333 75%
    ),
    linear-gradient(45deg, #333 25%, #666 25%, #666 75%, #333 75%),
    rgba(0, 0, 0, 0.5); /* 半透明黑色遮罩（保证选区外内容变暗，底纹可见） */
  /* 调整棋盘格子大小 */
  background-size: 40px 40px;
  /* 底纹偏移，让格子对齐更自然 */
  background-position:
    0 0,
    20px 20px;
  /* 优化动画曲线：先慢后快再慢，时长0.6s更舒适 */
  transition:
    opacity 1s cubic-bezier(0.25, 0.1, 0.25, 1),
    background-color 1s cubic-bezier(0.25, 0.1, 0.25, 1);
  will-change: opacity;
}
/* 遮罩层动画类：透明度变为不透明 */
.mask-animate {
  opacity: 0.95; /* 更细腻的透明度值 */
}

/* 截图区域 */
.capture-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  transform: translate(0, 0);
  transition: transform 1s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  will-change: transform;
}
/* 截图区域动画类：移动到屏幕居中*/
.capture-animate {
  transform: translate(var(--translate-x), var(--translate-y)) !important;
}

.magnifier-box {
  position: fixed;
  width: 151px;
  height: 151px;
  border: 1px solid #ccc;
  z-index: 10002;
  box-shadow: 0 0 15px rgba(0, 0, 0, 0.3);
  transform: translateZ(0);
}

/* 工具栏 */
.mark-toolbar {
  position: fixed;
  z-index: 10003;
  left: 50%;
  top: calc(100vh + 40px);
  transform: translateX(-50%) scale(0.95); /* 初始稍微缩小 */
  opacity: 0; /* 初始透明度0 */
  transition:
    top 1s cubic-bezier(0.19, 1, 0.22, 1),
    opacity 1s cubic-bezier(0.19, 1, 0.22, 1),
    transform 1s cubic-bezier(0.19, 1, 0.22, 1);
  will-change: top, opacity, transform;
  backface-visibility: hidden;
}
/* 工具栏动画类 */
.toolbar-animate {
  top: calc(100vh - 40px);
  opacity: 1;
  transform: translateX(-50%) scale(1); /* 缩放恢复，增加弹性 */
}

#log-viewer {
  position: fixed;
  z-index: 10003;
  top: 20px;
  right: 20px;
}
</style>
