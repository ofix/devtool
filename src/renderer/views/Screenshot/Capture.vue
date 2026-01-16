<template>
  <div class="screenshot-container">
    <!-- 截图 Canvas -->
    <canvas
      ref="screenshotCanvas"
      class="screenshot-canvas"
      tabindex="0"
    ></canvas>

    <!-- 放大窗（仅渲染） -->
    <div
      v-if="isMagnifierShow"
      class="magnifier-card"
      :style="{ left: `${magnifierPos.x}px`, top: `${magnifierPos.y}px` }"
    >
      <canvas ref="magnifierCanvas" :width="200" :height="200"></canvas>
    </div>

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

// ========== 仅渲染相关的响应式变量 ==========
const screenshotCanvas = ref(null);
const magnifierCanvas = ref(null);
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
  if (!screenshotCanvas.value) return;

  // 初始化截图类实例
  screenshot = new Screenshot(screenshotCanvas.value, magnifierCanvas.value);

  // 注册事件监听（接收类内部的状态通知）
  screenshot.on("magnifierShow", (show) => {
    isMagnifierShow.value = show;
  });
  screenshot.on("magnifierPosChange", (pos) => {
    magnifierPos.value = pos;
  });
  screenshot.on("toolbarShow", (show) => {
    showToolbar.value = show;
    console.log("showToolbar: ", show);
  });
  screenshot.on("toolbarPosChange", (pos) => {
    toolbarPos.value = pos;
  });

  // 绑定鼠标事件（仅转发，无逻辑）
  const canvas = screenshotCanvas.value;
  canvas.addEventListener("mousedown", screenshot.handleMousedown);
  canvas.addEventListener("mousemove", screenshot.handleMousemove);
  canvas.addEventListener("mouseup", screenshot.handleMouseup);
  canvas.addEventListener("mouseleave", screenshot.handleMouseleave);
  canvas.addEventListener("keydown", screenshot.handleKeydown);

  // 初始化截图（传入全屏截图图片，按需实现）
  const fullScreenImage = await window.channel.getDesktopScreenshot(); // 自行实现截图逻辑
  screenshot.init(fullScreenImage);

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

<style scoped>
.screenshot-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 9999;
}

.screenshot-canvas {
  width: 100%;
  height: 100%;
  cursor: crosshair;
}

.magnifier-card {
  position: fixed;
  width: 200px;
  height: 200px;
  border: 1px solid #ccc;
  background: white;
  z-index: 10000;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.2);
}
</style>
