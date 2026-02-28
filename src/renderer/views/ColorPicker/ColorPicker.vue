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
      <div style="text-align: center">单击完成颜色获取</div>
      <div class="color-info">
        <!-- 颜色方块 -->
        <div
          class="color-block"
          :style="{ backgroundColor: currentColor }"
        ></div>
        <!-- 颜色值信息 -->
        <div class="color-values">
          <p>RGB: {{ r }}, {{ g }}, {{ b }}</p>
          <p>HEX: {{ currentColor }}</p>
        </div>
      </div>
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
const panelX = ref(-10000); // 颜色面板X坐标
const panelY = ref(-10000); // 颜色面板Y坐标
const r = ref(0); // 红色值
const g = ref(0); // 绿色值
const b = ref(0); // 蓝色值
const currentColor = ref("#000000"); // 当前颜色值

// 放大区域配置
const ZOOM_AREA_SIZE = 11; // 采样区域大小（像素）
const ZOOM_CANVAS_SIZE = 11 * 12; // 放大画布大小（像素）
const ZOOM_SCALE = ZOOM_CANVAS_SIZE / ZOOM_AREA_SIZE; // 放大倍数（5倍）
const screenshotId = ref(null); // 仅保留ID用于清理

// 初始化：加载全屏截图并绘制到底层canvas
onMounted(async () => {
  try {
    // 监听ESC按键取消拾色器
    window.addEventListener("keydown", handle);
    const bgCtx = bgCanvas.value.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const screenWidth = window.screen.width * dpr;
    const screenHeight = window.screen.height * dpr;
    bgCanvas.value.width = screenWidth;
    bgCanvas.value.height = screenHeight;
    const startTime = performance.now();
    if (1) {
      const pngBuffer = await window.channel.getDesktopScreenshot("buffer");
      drawPngBuffer(bgCtx, pngBuffer);
    } else {
      const base64 = await window.channel.getDesktopScreenshot("base64");
      await drawScreenshot(
        bgCtx,
        base64,
        window.screen.width,
        window.screen.height
      );
    }
    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(1);
    window.channel.debug(`绘制背景图耗时: ${duration} 毫秒`);
    // 设置上层canvas尺寸
    zoomCanvas.value.width = ZOOM_CANVAS_SIZE;
    zoomCanvas.value.height = ZOOM_CANVAS_SIZE;
  } catch (error) {
    window.channel.debug("绘制失败! ", error);
    console.error("初始化拾色器失败:", error);
    console.error("拾色器初始化失败，请重试");
  }
});

async function drawPngBuffer(ctx, buffer, width, height) {
  const dpr = window.devicePixelRatio || 1;
  //   ctx.scale(dpr, dpr);
  // 4. 强制关闭半像素渲染（解决边缘模糊）
  ctx.translate(0.5, 0.5);
  // 5. 提升图像绘制质量
  //   ctx.imageSmoothingEnabled = true;
  //   ctx.imageSmoothingQuality = "high";
  ctx.imageSmoothingEnabled = false;
  ctx.webkitImageSmoothingEnabled = false; // 兼容webkit内核浏览器
  ctx.mozImageSmoothingEnabled = false; // 兼容Firefox
  ctx.msImageSmoothingEnabled = false; // 兼容IE/Edge
  const imageBitmap = await createImageBitmap(new Blob([buffer]));
  ctx.drawImage(imageBitmap, 0, 0);
  screenImage.value = imageBitmap;
  // imageBitmap.close(); // 释放内存
}

async function _base64ToImage(base64Str) {
  return new Promise((resolve, reject) => {
    if (!base64Str || !base64Str.startsWith("data:image/")) {
      reject(new Error("无效的 Base64 图片字符串"));
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error(`图片加载失败：${err.message}`));
    img.src = base64Str;
  });
}

/**
 * 将PNG Buffer绘制到Canvas（核心函数）
 * @param {HTMLContext2DElement}  Context2D
 * @param {String} base64 base64 格式图片
 * @param {Integer} width,
 * @param {Integer} height
 */
async function drawScreenshot(ctx, base64, width, height) {
  let img = await _base64ToImage(base64);
  ctx.drawImage(img, 0, 0, width, height);
  screenImage.value = img;
}

// 监听ESC按键
const handleKeyDown = (e) => {
  // 1. 处理ESC键（原有逻辑）
  if (e.key === "Escape" || e.keyCode === 27) {
    console.log("按下Esc鼠标键了");
    handleCancel();
    return;
  }

  // 2. 处理方向键（移动选色区域，步长1像素）
  const step = 1; // 移动步长（1像素）
  let isMoved = false;

  switch (e.key) {
    // 上：Y坐标减1
    case "ArrowUp":
    case "Up": // 兼容IE/旧浏览器
      if (mouseY.value - step >= 0) {
        mouseY.value -= step;
        isMoved = true;
      }
      break;
    // 下：Y坐标加1
    case "ArrowDown":
    case "Down":
      if (mouseY.value + step <= maxY.value) {
        mouseY.value += step;
        isMoved = true;
      }
      break;
    // 左：X坐标减1
    case "ArrowLeft":
    case "Left":
      if (mouseX.value - step >= 0) {
        mouseX.value -= step;
        isMoved = true;
      }
      break;
    // 右：X坐标加1
    case "ArrowRight":
    case "Right":
      if (mouseX.value + step <= maxX.value) {
        handleKeyDown.value += step;
        isMoved = true;
      }
      break;
    // 可选：+/-键控制放大/缩小（步长1像素）
    case "+":
      pickerSize.value += step;
      isMoved = true;
      break;
    case "-":
      if (pickerSize.value - step >= minSize.value) {
        pickerSize.value -= step;
        isMoved = true;
      }
      break;
    default:
      return; // 其他按键不处理
  }

  // 3. 移动/放大后，更新拾色器选色结果
  if (isMoved) {
    e.preventDefault(); // 阻止方向键默认行为（如页面滚动）
    // 绘制放大区域
    drawZoomArea();
    // 获取当前鼠标位置的颜色值
    getColorAtPosition();
    // 调整颜色面板位置（避免超出屏幕）
    adjustPanelPosition();
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

// 绘制鼠标中心区域的放大效
const drawZoomArea = () => {
  if (!screenImage.value) return;

  const zoomCtx = zoomCanvas.value.getContext("2d");
  zoomCtx.clearRect(0, 0, ZOOM_CANVAS_SIZE, ZOOM_CANVAS_SIZE);

  // 关闭Canvas的平滑插值，启用像素化缩放
  zoomCtx.imageSmoothingEnabled = false;
  zoomCtx.webkitImageSmoothingEnabled = false; // 兼容webkit内核浏览器
  zoomCtx.mozImageSmoothingEnabled = false; // 兼容Firefox
  zoomCtx.msImageSmoothingEnabled = false; // 兼容IE/Edge

  // 计算采样区域的起始坐标（鼠标中心向四周扩展）
  const startX = Math.floor(mouseX.value - ZOOM_AREA_SIZE / 2); // 取整避免亚像素模糊
  const startY = Math.floor(mouseY.value - ZOOM_AREA_SIZE / 2);

  // 绘制放大的像素区域（5倍放大）
  zoomCtx.drawImage(
    screenImage.value,
    startX,
    startY,
    ZOOM_AREA_SIZE,
    ZOOM_AREA_SIZE, // 源区域（原像素）
    0,
    0,
    ZOOM_CANVAS_SIZE,
    ZOOM_CANVAS_SIZE // 目标区域（放大）
  );

  // 绘制中心十字线，方便定位
  zoomCtx.strokeStyle = "rgba(47, 47, 216,0.9)";
  zoomCtx.lineWidth = ZOOM_SCALE;
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

  // 绘制中心方块的颜色
  const bgCtx = bgCanvas.value.getContext("2d");
  // 获取单个像素的颜色数据
  const pixelData = bgCtx.getImageData(mouseX.value, mouseY.value, 1, 1).data;
  const rgbaColor = `rgba(${pixelData[0]}, ${pixelData[1]}, ${pixelData[2]}, ${pixelData[3] / 255})`;
  const blockX = Math.floor(ZOOM_CANVAS_SIZE / 2 - ZOOM_SCALE / 2);
  const blockY = Math.floor(ZOOM_CANVAS_SIZE / 2 - ZOOM_SCALE / 2);
  zoomCtx.fillStyle = rgbaColor; // 正确赋值
  zoomCtx.fillRect(blockX, blockY, ZOOM_SCALE, ZOOM_SCALE);

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
  window.channel.closeColorPicker({
    r: r.value,
    g: g.value,
    b: b.value,
    hex: currentColor.value,
  });
};

// 清理资源
onUnmounted(() => {
  screenImage.value = null;
  // 移除ESC按键监听，防止内存泄漏
  window.removeEventListener("keydown", handleKeyDown);
});
</script>

<style scoped>
.color-picker-container {
  position: fixed;
  top: 0;
  left: 0;
  border: none;
  width: 100vw;
  height: 100vh;
  padding: 0;
  margin: 0;
  pointer-events: auto;
}

.bg-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  border: none;
  pointer-events: none; /* 让鼠标事件穿透底层canvas */
}

.zoom-canvas {
  position: absolute;
  left: -10000;
  top: -10000;
  border: 1px solid rgba(47, 47, 216);
  pointer-events: none;
  z-index: 10;
}

.color-info-panel {
  position: absolute;
  padding: 4px 4px;
  background: rgba(255, 255, 255, 0.9);
  z-index: 20;
  font-size: 14px;
}

.color-info {
  display: flex;
  align-items: center;
  margin-top: 4px;
  gap: 10px;
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
