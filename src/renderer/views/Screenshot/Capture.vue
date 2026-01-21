<template>
  <div class="screenshot-container">
    <!-- 截图 Canvas -->
    <canvas ref="canvasScreen" class="screen-canvas" tabindex="0"></canvas>
    <canvas ref="canvasCapture" class="capture-canvas" tabindex="1"></canvas>

    <!-- 放大窗（仅渲染） -->
    <div
      v-show="isMagnifierShow"
      class="magnifier-card"
      :style="{ left: `${magnifierPos.x}px`, top: `${magnifierPos.y}px` }"
    >
      <canvas ref="canvasMagnifier" :width="200" :height="200"></canvas>
    </div>
    <LogViewer
      id="log-viewer"
      width="400px"
      height="240px"
      :auto-scroll="true"
    />
    <!-- 工具栏（仅渲染） -->
    <MarkToolbar
      ref="toolbarRef"
      :visible="showToolbar"
      :position="toolbarPos"
      :markManager="markManager"
      @toolChange="handleToolChange"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from "vue";
import Screenshot from "./Screenshot.js";
import MarkToolbar from "./MarkToolbar.vue";
import LogViewer from "@/components/LogViewer.vue";

// ========== 仅渲染相关的响应式变量 ==========
const canvasScreen = ref(null);
const canvasCapture = ref(null);
const canvasMagnifier = ref(null);
const isMagnifierShow = ref(false);
const showToolbar = ref(false);
const magnifierPos = ref({ x: 0, y: 0 });
const toolbarPos = ref({ x: 0, y: 0 });
const markManager = ref(null); // 标注管理器实例

// 截图类实例
let screenshot = null;

// ========== 生命周期 ==========
onMounted(async () => {
  await nextTick();
  if (!canvasScreen.value || !canvasCapture.value) return;
  // 初始化截图类实例
  screenshot = new Screenshot(
    canvasScreen.value,
    canvasCapture.value,
    canvasMagnifier.value,
  );

  // 注册事件监听（接收类内部的状态通知）
  screenshot.on("magnifierShow", (show) => {
    isMagnifierShow.value = show;
  });
  screenshot.on("magnifierPosChange", (pos) => {
    magnifierPos.value = pos;
  });
  screenshot.on("toolbarShow", (show) => {
    showToolbar.value = show;
  });
  screenshot.on("toolbarPosChange", (pos) => {
    toolbarPos.value = pos;
  });

  // 绑定鼠标事件（仅转发，无逻辑）
  const canvas = canvasCapture.value;
  canvas.addEventListener("mousedown", screenshot.handleMousedown);
  canvas.addEventListener("mousemove", screenshot.handleMousemove);
  canvas.addEventListener("mouseup", screenshot.handleMouseup);
  canvas.addEventListener("mouseleave", screenshot.handleMouseleave);
  canvas.addEventListener("keydown", screenshot.handleKeydown);

  // 初始化截图（传入全屏截图图片，按需实现）
  window.channel.getDesktopScreenshot().then((fullScreenImage) => {
    screenshot.init(fullScreenImage);
  }); // 自行实现截图逻辑

  markManager.value = screenshot.getMarkManager();
});

onUnmounted(() => {
  if (screenshot) {
    screenshot.destroy();
  }
  const canvas = screenshotCanvas.value;
  if (canvas) {
    canvas.removeEventListener("mousedown", screenshot?.handleMousedown);
    canvas.removeEventListener("mousemove", screenshot?.handleMousemove);
    canvas.removeEventListener("mouseup", screenshot?.handleMouseup);
    canvas.removeEventListener("mouseleave", screenshot?.handleMouseleave);
  }
});

const handleToolChange = (tool) => {
  // 通知截图类切换标注工具
  screenshot?.setMarkTool(tool);
};
</script>

<style>
html,
body {
  /* 背景透明，无默认白色 */
  /* 直接设置透明，覆盖原变量 */
  --dt-primary-bg-color: transparent !important;
  background-color: transparent !important;
  background: transparent !important;
}
canvas {
  transform: translateZ(0); /* 触发 GPU 加速 */
  will-change: transform; /* 告诉浏览器提前优化 */
}
.screenshot-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 9999;
}

.screen-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10000;
  background: transparent !important;
  cursor: crosshair;
}

.capture-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10001;
  background: transparent !important;
  cursor: crosshair;
}

.magnifier-card {
  position: fixed;
  width: 200px;
  height: 200px;
  border: 1px solid #ccc;
  background: white;
  z-index: 10002;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.2);
}
#log-viewer {
  position: fixed;
  z-index: 10003;
  top: 20px;
  right: 20px;
}
</style>
