<template>
  <div class="screenshot-container">
    <!-- 桌面背景 -->
    <canvas ref="layerDesktop" class="layer-desktop"></canvas>
    <!-- 中间遮罩层 -->
    <div
      ref="layerMask"
      class="layer-mask"
      :class="{ 'mask-animate': captureFinished }"
    ></div>
    <!-- 用户截图层 -->
    <canvas
      ref="layerCapture"
      class="layer-capture"
      v-show="showCapture"
      :class="{ 'capture-animate': captureFinished }"
      :style="{
        '--translate-x': translateX + 'px',
        '--translate-y': translateY + 'px',
      }"
    >
    </canvas>
    <!-- 用户编辑操作层-->
    <canvas ref="layerOperation" class="layer-operation"></canvas>

    <!-- 放大窗（仅截图截断显示） -->
    <div
      v-show="showMagnifier"
      class="magnifier-box"
      :style="{ left: `${magnifierPos.x}px`, top: `${magnifierPos.y}px` }"
    >
      <canvas ref="layerMagnifierBox" :width="200" :height="200"></canvas>
    </div>
    <!-- 标注工具栏（添加动画类控制）-->
    <MarkToolbar
      ref="toolbarRef"
      :position="toolbarPos"
      :class="{ 'toolbar-animate': captureFinished }"
      :markToolManager="markToolManager"
      @markToolChange="onMarkToolChange"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from "vue";
import Screenshot from "./Screenshot.js";
import MarkToolbar from "./MarkToolbar.vue";

const layerDesktop = ref(null);
const layerCapture = ref(null);
const layerOperation = ref(null);
const layerMagnifierBox = ref(null);
const showCapture = ref(true);
const showOperation = ref(true);
const showMagnifier = ref(true);
const showToolbar = ref(false);
const magnifierPos = ref({ x: -1000, y: -1000 });
const toolbarPos = ref({
  x: Math.floor((window.screen.width - 500) / 2),
  y: window.screen.height + 200,
});
const markToolManager = ref(null); // 标注管理器实例
// 标记截图完成状态，控制动画触发
const captureFinished = ref(false);
// 存储需要移动的位移值
const translateX = ref(0);
const translateY = ref(0);

// 截图类实例
let screenshot = null;

// ========== 生命周期 ==========
onMounted(async () => {
  // 初始化截图类实例
  let captureMode = await window.channel.getWindowOptions("CaptureWnd");
  screenshot = new Screenshot(
    layerDesktop.value,
    layerCapture.value,
    layerOperation.value,
    layerMagnifierBox.value,
    captureMode
  );

  if (captureMode == "window") {
    let windows = await window.channel.enumWindowList();
    screenshot.setWindowList(windows);
  }

  // 初始化截图
  const pngBuffer = await window.channel.getDesktopScreenshot("buffer");
  screenshot.init(pngBuffer);

  if (captureMode == "rect") {
    showMagnifier.value = true;
  }

  // 注册事件监听（接收类内部的状态通知）
  screenshot.on("showMagnifier", (show) => {
    showMagnifier.value = show;
  });
  screenshot.on("magnifierNewPos", (pos) => {
    magnifierPos.value = pos;
  });

  screenshot.on("CaptureFinish", async () => {
    showOperation.value = false;
    showCapture.value = true;
    showToolbar.value = true;
    setTimeout(async () => {
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
        x: Math.floor((window.screen.width - 500) / 2), // x保持居中不变
        y: window.screen.height - 40,
      };
      // 2. 等待DOM更新后触发动画
      await nextTick();
      captureFinished.value = true;
      setTimeout(() => {
        // 动画结束，需要将 layerCapture 和 layerOperation 都搞成全屏的canvas才行，
        // 否则缩放和移动的操作同步会很麻烦
        // 1. 将用户选区移动到屏幕中央
        translateX.value = 0;
        translateY.value = 0;
        const newX = window.innerWidth / 2 - captureRect.width / 2;
        const newY = window.innerHeight / 2 - captureRect.height / 2;
        window.channel.debug("newX,newY = ", newX, newY);
        try {
          screenshot.resetCaptureArea(newX, newY);
        } catch (e) {
          console.log(e);
        }
        // 2. 将layerCapture 调整为全屏并重新渲染图像，保持图像在中央不变
        showOperation.value = false;
      }, 1000);
    }, 120);
  });

  // 绑定鼠标事件,以下代码在全透明的canvas中移动鼠标过程中，会出现频繁触发 mouseleave 事件的问题
  // const canvas = layerOperation.value;
  // canvas.addEventListener("mousedown", screenshot.onMouseDown);
  // canvas.addEventListener("mousemove", screenshot.onMouseMove);
  // canvas.addEventListener("mouseup", screenshot.onMouseUp);
  // canvas.addEventListener("mouseleave", screenshot.onMouseLeave);
  // canvas.addEventListener("keydown", screenshot.onKeyDown);

  window.addEventListener("mousedown", screenshot.onMouseDown);
  window.addEventListener("mousemove", screenshot.onMouseMove);
  window.addEventListener("mouseup", screenshot.onMouseUp);
  window.addEventListener("mouseleave", screenshot.onMouseLeave);
  window.addEventListener("keydown", screenshot.onKeyDown);

  markToolManager.value = screenshot.getMarkManager();
  window.channel.showWindow("CaptureWnd");
});

onUnmounted(() => {
  if (screenshot) {
    screenshot.destroy();
  }

  window.removeEventListener("mousedown", screenshot?.onMouseDown);
  window.removeEventListener("mousemove", screenshot?.onMouseMove);
  window.removeEventListener("mouseup", screenshot?.onMouseUp);
  window.removeEventListener("mouseleave", screenshot?.onMouseLeave);
  window.removeEventListener("keydown", screenshot?.onKeyDown);
});

const onMarkToolChange = (tool) => {
  // 通知截图类切换标注工具
  screenshot?.setMarkTool(tool);
};
</script>

<style scoped>
canvas {
  transform: translateZ(0); /* 触发 GPU 加速 */
  will-change: transform; /* 告诉浏览器提前优化 */
  backface-visibility: hidden; /* 防止闪烁 */
}
.layer-desktop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  cursor: crosshair;
}
/* 遮罩层基础样式 + 优化动画 */
.layer-mask {
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
  /* iOS 默认动画曲线：cubic-bezier(0.4, 0.0, 0.2, 1) */
  transition: none; /* 默认无动画 */
  will-change: opacity;
}

.layer-mask.mask-animate {
  transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 0.95;
}

/* 截图区域 */
.layer-capture,
.layer-operation {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  transform: translate(0, 0);
  transition: none; /* 默认无动画 */
  will-change: transform;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  -webkit-font-smoothing: subpixel-antialiased;
  pointer-events: none; /* 动画期间不响应事件 */
}

/* 只有添加动画类时才启用过渡 */
.layer-capture.capture-animate {
  transition: transform 0.7s cubic-bezier(0.175, 0.885, 0.32, 1); /* 延迟0.1s开始 */
  transform: translate(var(--translate-x), var(--translate-y)) !important;
}

.layer-capture {
  border: 1px solid #ff0000;
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
  transition: none; /* 默认无动画 */
  will-change: top, opacity, transform;
  backface-visibility: hidden;
}
/* 工具栏动画类 */
.mark-toolbar.toolbar-animate {
  top: calc(100vh - 50px);
  opacity: 1;
  transition:
    top 1s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 1s cubic-bezier(0.4, 0, 0.2, 1),
    transform 1s cubic-bezier(0.4, 0, 0.2, 1);
  transform: translateX(-50%) scale(1); /* 缩放恢复，增加弹性 */
}
</style>
