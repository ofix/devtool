<template>
  <div
    class="color-picker-container"
    @mousemove="handleMouseMove"
    @click="handleColorPick"
    @contextmenu.prevent="handleCancel"
  >
    <!-- 底层canvas：绘制全屏截图 -->
    <canvas ref="bgCanvas" class="bg-canvas"></canvas>
    <!-- 上层canvas：绘制放大区域 -->
    <canvas
      ref="zoomCanvas"
      class="zoom-canvas"
      :style="{ cursor: `url(@/assets/sucker.cur), auto` }"
    ></canvas>
    <!-- 颜色信息展示面板 -->
    <div
      ref="colorInfoPanel"
      class="color-info-panel"
      :style="{ left: panelX + 'px', top: panelY + 'px' }"
    >
      <!-- 颜色方块 -->
      <div class="color-block" :style="{ backgroundColor: currentColor }"></div>
      <!-- 颜色值信息 -->
      <div class="color-values">
        <p>RGB: {{ r }}, {{ g }}, {{ b }}</p>
        <p>HEX: {{ currentColor }}</p>
      </div>
      <!-- 复制按钮 -->
      <el-button size="small" @click.stop="copyColor">复制</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";

// DOM 引用
const bgCanvas = ref(null);
const zoomCanvas = ref(null);
const colorInfoPanel = ref(null);

// 状态变量
const screenImage = ref(null); // 全屏截图
const mouseX = ref(0); // 鼠标X坐标
const mouseY = ref(0); // 鼠标Y坐标
const panelX = ref(0); // 颜色面板X坐标
const panelY = ref(0); // 颜色面板Y坐标
const r = ref(0); // 红色值
const g = ref(0); // 绿色值
const b = ref(0); // 蓝色值
const currentColor = ref("#000000"); // 当前颜色值

// 放大区域配置
const ZOOM_AREA_SIZE = 20; // 采样区域大小（像素）
const ZOOM_CANVAS_SIZE = 100; // 放大画布大小（像素）
const ZOOM_SCALE = ZOOM_CANVAS_SIZE / ZOOM_AREA_SIZE; // 放大倍数（5倍）
const screenshotId = ref(null); // 仅保留ID用于清理

// 初始化：加载全屏截图并绘制到底层canvas
onMounted(async () => {
  try {
    // 监听ESC按键取消拾色器
    window.addEventListener("keydown", handleEscKey);
    // 获取主进程共享的屏幕截图
    const captureResult = await window.channel.getDesktopScreenshot();
    if (!captureResult.success) {
      throw new Error(captureResult.error || "截图生成失败");
    }
    // 2. 仅存储ID（用于后续清理）
    screenshotId.value = captureResult.screenshotId;
    const { pngPath } = captureResult;
    // 3. 校验Buffer有效性
    if (!pngPath) {
      throw new Error("PNG path为空");
    }
    // 设置底层canvas尺寸为屏幕尺寸
    const bgCtx = bgCanvas.value.getContext("2d");
    bgCanvas.value.width = window.screen.width;
    bgCanvas.value.height = window.screen.height;
    await drawScreenshot(
      bgCtx,
      pngPath,
      window.screen.width,
      window.screen.height
    );
    // 设置上层canvas尺寸
    zoomCanvas.value.width = ZOOM_CANVAS_SIZE;
    zoomCanvas.value.height = ZOOM_CANVAS_SIZE;
  } catch (error) {
    console.error("初始化拾色器失败:", error);
    console.error("拾色器初始化失败，请重试");
  }
});

/**
 * 将PNG Buffer绘制到Canvas（核心函数）
 * @param {HTMLContext2DElement}  Context2D
 * @param {String} pngPath 内存文件路径
 * @param {Integer} width,
 * @param {Integer} height
 */
async function drawScreenshot(
  ctx,
  pngPath,
  width,
  height
) {
  const img = new Image();
  console.log("绘制图片 ",pngPath);
  await new Promise((resolve, reject) => {
    img.onload = () => {
        console.log("加载图片成功");
      // 3. 绘制到Canvas
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // 4. 存储Image对象供后续放大使用
      screenImage.value = img;

      // 5. 释放Blob URL
      console.log("绘制截图成功");
      resolve();
    };

    img.onerror = (err) => {
      console.log("加载图片失败 ",err.message);
      reject(new Error(`PNG解码失败：${err.message}`));
    };

    img.src = `file://${pngPath}`;
  });
}

// 监听ESC按键
const handleEscKey = (e) => {
  if (e.key === "Escape" || e.keyCode === 27) {
    // 兼容不同浏览器的key值
    console.log("按下Esc鼠标键了");
    handleCancel();
  }
};

// 取消拾色器（右键/ESC触发）
const handleCancel = () => {
  try {
    // 调用主进程取消接口
    window.channel.cancelColorPicker();
    console.log("取消颜色拾色器");
  } catch (error) {
    console.error("取消拾色器失败:", error);
  }
};

// 鼠标移动事件处理
const handleMouseMove = (e) => {
    console.log("on mouse move");
  // 更新鼠标坐标（相对于屏幕）
  mouseX.value = e.screenX;
  mouseY.value = e.screenY;

  // 绘制放大区域
  drawZoomArea();

  // 获取当前鼠标位置的颜色值
  getColorAtPosition();

  // 调整颜色面板位置（避免超出屏幕）
  adjustPanelPosition();
};

// 绘制鼠标中心区域的放大效果
const drawZoomArea = () => {
  if (!screenImage.value) return;

  const zoomCtx = zoomCanvas.value.getContext("2d");
  // 清空上层canvas
  zoomCtx.clearRect(0, 0, ZOOM_CANVAS_SIZE, ZOOM_CANVAS_SIZE);

  // 计算采样区域的起始坐标（鼠标中心向四周扩展10像素）
  const startX = mouseX.value - ZOOM_AREA_SIZE / 2;
  const startY = mouseY.value - ZOOM_AREA_SIZE / 2;

  // 绘制放大的像素区域（5倍放大）
  zoomCtx.drawImage(
    screenImage.value,
    startX,
    startY,
    ZOOM_AREA_SIZE,
    ZOOM_AREA_SIZE, // 源区域
    0,
    0,
    ZOOM_CANVAS_SIZE,
    ZOOM_CANVAS_SIZE // 目标区域（放大）
  );

  // 绘制中心十字线，方便定位
  zoomCtx.strokeStyle = "#ffffff";
  zoomCtx.lineWidth = 1;
  // 水平线
  zoomCtx.beginPath();
  zoomCtx.moveTo(0, ZOOM_CANVAS_SIZE / 2);
  zoomCtx.lineTo(ZOOM_CANVAS_SIZE, ZOOM_CANVAS_SIZE / 2);
  zoomCtx.stroke();
  // 垂直线
  zoomCtx.beginPath();
  zoomCtx.moveTo(ZOOM_CANVAS_SIZE / 2, 0);
  zoomCtx.lineTo(ZOOM_CANVAS_SIZE / 2, ZOOM_CANVAS_SIZE);
  zoomCtx.stroke();

  // 设置上层canvas位置（鼠标右下角，边界时调整）
  let zoomX = mouseX.value + 10;
  let zoomY = mouseY.value + 10;

  // 右边界检测：超出屏幕则向左显示
  if (zoomX + ZOOM_CANVAS_SIZE > window.screen.width) {
    zoomX = mouseX.value - ZOOM_CANVAS_SIZE - 10;
  }
  // 下边界检测：超出屏幕则向上显示
  if (zoomY + ZOOM_CANVAS_SIZE > window.screen.height) {
    zoomY = mouseY.value - ZOOM_CANVAS_SIZE - 10;
  }

  // 应用位置样式
  zoomCanvas.value.style.left = `${zoomX}px`;
  zoomCanvas.value.style.top = `${zoomY}px`;
};

// 获取鼠标位置的颜色值
const getColorAtPosition = () => {
  if (!bgCanvas.value) return;

  const bgCtx = bgCanvas.value.getContext("2d");
  // 获取单个像素的颜色数据
  const pixelData = bgCtx.getImageData(mouseX.value, mouseY.value, 1, 1).data;

  // 更新RGB值
  r.value = pixelData[0];
  g.value = pixelData[1];
  b.value = pixelData[2];

  // 转换为16进制颜色值
  currentColor.value = `#${(
    (1 << 24) +
    (r.value << 16) +
    (g.value << 8) +
    b.value
  )
    .toString(16)
    .slice(1)
    .toUpperCase()}`;
};

// 调整颜色面板位置
const adjustPanelPosition = () => {
  // 面板默认显示在放大区域下方
  const zoomEl = zoomCanvas.value;
  panelX.value = parseInt(zoomEl.style.left);
  panelY.value = parseInt(zoomEl.style.top) + ZOOM_CANVAS_SIZE + 5;

  // 边界检测：确保面板不超出屏幕
  if (panelX.value + colorInfoPanel.value.offsetWidth > window.screen.width) {
    panelX.value = window.screen.width - colorInfoPanel.value.offsetWidth - 10;
  }
  if (panelY.value + colorInfoPanel.value.offsetHeight > window.screen.height) {
    panelY.value =
      parseInt(zoomEl.style.top) - colorInfoPanel.value.offsetHeight - 5;
  }
};

// 复制颜色值到剪贴板
const copyColor = async () => {
  try {
    await navigator.clipboard.writeText(currentColor.value);
  } catch (error) {
    console.error("复制颜色失败:", error);
  }
};

// 点击取色：复制颜色并关闭拾色器窗口
const handleColorPick = async () => {
  // 先复制颜色
  await copyColor();
  // 调用主进程关闭拾色器并打开调色板
  window.channel.closeColorPicker();
};

// 清理资源
onUnmounted(() => {
  screenImage.value = null;
  // 移除ESC按键监听，防止内存泄漏
  window.removeEventListener("keydown", handleEscKey);
});
</script>

<style scoped>
.color-picker-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: auto;
  border: 2px solid #ff0000;
}

.bg-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* 让鼠标事件穿透底层canvas */
}

.zoom-canvas {
  position: absolute;
  border: 1px solid #ffffff;
  background: rgba(0, 0, 0, 0.1);
  pointer-events: none;
  z-index: 10;
}

.color-info-panel {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 4px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  z-index: 20;
}

.color-block {
  width: 24px;
  height: 24px;
  border-radius: 2px;
  border: 1px solid #e5e7eb;
}

.color-values {
  font-size: 12px;
  color: #333;
  line-height: 1.2;
}
</style>
