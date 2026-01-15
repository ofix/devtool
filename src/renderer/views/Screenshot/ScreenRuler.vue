<template>
  <div
    class="ruler-container"
    :class="`ruler-${type}`"
    @mousedown="handleMouseDown"
  >
    <!-- Canvas 标尺 -->
    <canvas
      ref="rulerCanvas"
      class="ruler-canvas"
      :width="canvasSize.fixed"
      :height="canvasSize.dynamic"
    ></canvas>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { ElMessage } from "element-plus";

// ========== 核心配置：固定标尺尺寸 & 刻度规则 ==========
const FIXED_EDGE_SIZE = 30; // 横尺高度/竖尺宽度 固定为30px
// 刻度配置（仿FastStone）
const MAJOR_TICK_INTERVAL = 50; // 主刻度间隔（50px）
const MINOR_TICK_INTERVAL = 10; // 次级刻度间隔（10px）
const FINE_TICK_INTERVAL = 1; // 细刻度间隔（1px）

// 响应式数据
const type = ref("horizontal"); // horizontal/vertical
const mouseX = ref(0);
const mouseY = ref(0);
const rulerWidth = ref(800); // 横尺宽度（可拉伸），竖尺宽度=30
const rulerHeight = ref(FIXED_EDGE_SIZE); // 横尺高度=30，竖尺高度（可拉伸）
const rulerCanvas = ref(null);
const winPos = ref({ x: 0, y: 0 });
const isDragging = ref(false);
const dragStartX = ref(0);
const dragStartY = ref(0);

// Canvas 尺寸计算：横尺[宽=窗口宽, 高=30]；竖尺[宽=30, 高=窗口高]
const canvasSize = computed(() => {
  return type.value === "horizontal"
    ? { fixed: rulerWidth.value, dynamic: FIXED_EDGE_SIZE }
    : { fixed: FIXED_EDGE_SIZE, dynamic: rulerHeight.value };
});

// 存储监听函数
let rulerInitListener = null;
let mousePositionListener = null;
let mouseMoveHandler = null;
let mouseUpHandler = null;

// ========== 核心重构：仿FastStone标尺绘制逻辑 ==========
const redrawRuler = () => {
  if (!rulerCanvas.value) return;
  const ctx = rulerCanvas.value.getContext("2d");
  const isHorizontal = type.value === "horizontal";
  const { fixed: w, dynamic: h } = canvasSize.value;

  // 初始化+抗锯齿关闭
  ctx.save();
  ctx.reset();
  ctx.imageSmoothingEnabled = false;
  ctx.webkitImageSmoothingEnabled = false;
  ctx.msImageSmoothingEnabled = false;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255, 255, 255, 1)";
  ctx.fillRect(0, 0, Math.floor(w), Math.floor(h));

  // 控制区域计算
  const center = Math.floor(isHorizontal ? h / 2 : w / 2);
  const controlAreaSize = 80;
  const controlStart = Math.floor(
    (isHorizontal ? w : h) / 2 - controlAreaSize / 2
  );
  const controlEnd = Math.floor(
    (isHorizontal ? w : h) / 2 + controlAreaSize / 2
  );

  // 样式配置
  ctx.strokeStyle = "#666";
  ctx.fillStyle = "#333";
  ctx.lineWidth = 1;
  ctx.font = "11px Arial, Helvetica, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textRendering = "geometricPrecision";

  const maxLength = isHorizontal ? w : h;
  const halfHeight = Math.floor(h);
  const halfWidth = Math.floor(w);

  ctx.beginPath();
  for (let i = 0; i <= maxLength; i += 1) {
    // 步长1px遍历
    if (i >= controlStart && i <= controlEnd) continue;

    // 刻度类型判断
    const isMajor = i % MAJOR_TICK_INTERVAL === 0; // 50px 主刻度
    const isMinor = i % MINOR_TICK_INTERVAL === 0; // 10px 次级刻度
    // 细刻度：非主/次级 且 是偶数像素位置（2、4、6...）
    const isFine = !isMajor && !isMinor && i % 2 === 0;

    if (!isMajor && !isMinor && !isFine) continue; // 跳过不需要绘制的位置

    // 刻度长度
    let tickLength = 0;
    if (isMajor) tickLength = 10;
    else if (isMinor) tickLength = 6;
    else if (isFine) tickLength = 3;

    // 坐标取整
    const pos = Math.floor(i);
    const tickLen = Math.floor(tickLength);

    if (isHorizontal) {
      // 上刻度
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, tickLen);
      // 下刻度
      ctx.moveTo(pos, halfHeight);
      ctx.lineTo(pos, halfHeight - tickLen);
    } else {
      // 左刻度
      ctx.moveTo(0, pos);
      ctx.lineTo(tickLen, pos);
      // 右刻度
      ctx.moveTo(halfWidth, pos);
      ctx.lineTo(halfWidth - tickLen, pos);
    }
  }
  ctx.stroke();
  ctx.closePath();

  // 绘制主刻度文本（不变）
  for (let i = 0; i <= maxLength; i += MAJOR_TICK_INTERVAL) {
    if (i >= controlStart && i <= controlEnd) continue;
    const pos = Math.floor(i);
    if (isHorizontal) {
      ctx.textAlign = "center";
      ctx.fillText(i.toString(), pos, Math.floor(center));
    } else {
      ctx.textAlign = "center";
      ctx.fillText(i.toString(), Math.floor(center), pos);
    }
  }

  // 鼠标标线+边框 部分不变
  if (winPos.value.x && winPos.value.y) {
    const localX = Math.floor(mouseX.value - winPos.value.x);
    const localY = Math.floor(mouseY.value - winPos.value.y);

    ctx.strokeStyle = "#ff4444";
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.7;

    ctx.beginPath();
    if (isHorizontal) {
      if (localX < controlStart || localX > controlEnd) {
        ctx.moveTo(localX, 0);
        ctx.lineTo(localX, halfHeight);
      }
    } else {
      if (localY < controlStart || localY > controlEnd) {
        ctx.moveTo(0, localY);
        ctx.lineTo(halfWidth, localY);
      }
    }
    ctx.stroke();
    ctx.closePath();
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = "#ccc";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(0, 0, Math.floor(w), Math.floor(h));
  ctx.stroke();
  ctx.closePath();

  ctx.restore();
};

// ========== 横竖切换逻辑：固定尺寸不变 ==========
const toggleType = async () => {
  const oldType = type.value;
  type.value = oldType === "horizontal" ? "vertical" : "horizontal";

  // 切换时调整窗口尺寸：横尺[宽=原长, 高=30]；竖尺[宽=30, 高=原长]
  const newSize =
    oldType === "horizontal"
      ? { width: FIXED_EDGE_SIZE, height: rulerWidth.value }
      : { width: rulerHeight.value, height: FIXED_EDGE_SIZE };

  // 调用主进程修改窗口尺寸（保留原有IPC逻辑）
  try {
    await window.channel.sendToolCmd(
      "ruler:set-size",
      newSize.width,
      newSize.height
    );
  } catch (e) {
    ElMessage.warning("切换尺寸失败：" + e.message);
  }

  // 更新本地尺寸
  rulerWidth.value = newSize.width;
  rulerHeight.value = newSize.height;
  // 重绘标尺
  redrawRuler();
};

// ========== 原有 IPC 逻辑保留 ==========
const closeRuler = async () => {
  try {
    await window.channel.closeScreenRuler();
  } catch (e) {
    ElMessage.warning("关闭失败：" + e.message);
  }
};

const updateRulerSize = async () => {
  try {
    const size = await window.channel.rulerGetSize();
    rulerWidth.value = size.width || 800;
    rulerHeight.value = size.height || FIXED_EDGE_SIZE;
  } catch (e) {
    rulerWidth.value = 800;
    rulerHeight.value = FIXED_EDGE_SIZE;
  }
  redrawRuler();
};

const updateWinPos = async () => {
  try {
    const pos = await window.channel.rulerGetPosition();
    winPos.value = pos;
  } catch (e) {
    winPos.value = { x: 0, y: 0 };
  }
};

const handleMouseDown = async (e) => {
  isDragging.value = true;
  try {
    const pos = await window.channel.rulerGetPosition();
    dragStartX.value = e.x - pos.x;
    dragStartY.value = e.y - pos.y;
  } catch (e) {
    dragStartX.value = e.x;
    dragStartY.value = e.y;
  }

  mouseMoveHandler = async (e) => {
    if (isDragging.value) {
      try {
        await window.channel.rulerSetPosition(
          e.x - dragStartX.value,
          e.y - dragStartY.value
        );
        await updateWinPos();
        redrawRuler();
      } catch (e) {
        console.error("拖动失败：", e);
      }
    }
  };

  mouseUpHandler = () => {
    isDragging.value = false;
    document.removeEventListener("mousemove", mouseMoveHandler);
    document.removeEventListener("mouseup", mouseUpHandler);
  };

  document.addEventListener("mousemove", mouseMoveHandler);
  document.addEventListener("mouseup", mouseUpHandler);
};

const handleMousePositionUpdate = async (pos) => {
  mouseX.value = pos.x;
  mouseY.value = pos.y;
  await updateWinPos();
  redrawRuler();
};

// ========== 初始化 & 监听 ==========
onMounted(async () => {
  // 监听初始配置
  rulerInitListener = (options) => {
    if (options.type) type.value = options.type;
  };
  try {
    window.channel.on("ruler-init", rulerInitListener);
  } catch (e) {
    console.warn("未监听初始化事件：", e);
  }

  // 监听鼠标位置
  mousePositionListener = handleMousePositionUpdate;
  try {
    window.channel.on("mouse-position", mousePositionListener);
  } catch (e) {
    console.warn("未监听鼠标位置事件：", e);
  }

  // 初始化尺寸和位置
  await updateRulerSize();
  await updateWinPos();
  redrawRuler();

  // 监听窗口缩放
  window.addEventListener("resize", async () => {
    await updateRulerSize();
    redrawRuler();
  });

  // 监听类型变化
  watch(type, redrawRuler);
});

onUnmounted(() => {
  // 移除事件监听
  if (rulerInitListener) {
    try {
      window.channel.off("ruler-init", rulerInitListener);
    } catch (e) {}
  }
  if (mousePositionListener) {
    try {
      window.channel.off("mouse-position", mousePositionListener);
    } catch (e) {}
  }
  if (mouseMoveHandler) {
    document.removeEventListener("mousemove", mouseMoveHandler);
  }
  if (mouseUpHandler) {
    document.removeEventListener("mouseup", mouseUpHandler);
  }
  window.removeEventListener("resize", updateRulerSize);
});
</script>

<style scoped>
/* 容器：固定宽高，禁止滚动 */
.ruler-container {
  position: relative;
  width: 100%;
  height: 100%;
  user-select: none;
  cursor: move;
  overflow: hidden;
}

/* Canvas：1:1 像素绘制，避免拉伸模糊 */
.ruler-canvas {
  display: block;
  /* 关键：禁止浏览器缩放 Canvas */
  width: 100%;
  height: 100%;
  /* 强制像素级渲染，禁用平滑 */
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  /* 避免布局偏移导致的模糊 */
  transform: translateZ(0);
}

/* 控制按钮区域：中间悬浮层 */
.ruler-controls {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  gap: 8px;
  background: rgba(255, 255, 255, 0.9);
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid #ddd;
  z-index: 10;
}

.control-btn {
  padding: 2px 8px;
  font-size: 12px;
  border: 1px solid #ccc;
  border-radius: 3px;
  background: #f5f5f5;
  cursor: pointer;
  transition: all 0.2s;
}

.control-btn:hover {
  background: #e0e0e0;
  border-color: #999;
}

/* 横竖尺鼠标样式优化 */
.ruler-horizontal {
  cursor: ew-resize; /* 横尺可左右拉伸 */
}
.ruler-vertical {
  cursor: ns-resize; /* 竖尺可上下拉伸 */
}
</style>
