<template>
  <div class="ruler-container" :class="`ruler-${type}`">
    <canvas ref="rulerCanvas" class="ruler-canvas"></canvas>
    <div ref="measureLineTop" class="measureline measure-line-top"></div>
    <div class="drag-area">
      <div
        ref="leftBtn"
        class="resize-btn resize-left"
        @mousedown.stop="startDrag('left', $event)"
      >
        <IconDragLeft />
      </div>
      <div class="ruler-controls">
        <div class="control-btn" @click.stop="toggleType">
          <IconTranslate />
        </div>
        <div class="control-btn" @click.stop="closeRuler">
          <IconCloseBox />
        </div>
      </div>
      <div
        ref="rightBtn"
        class="resize-btn resize-right"
        @mousedown.stop="startDrag('right', $event)"
      >
        <IconDragRight />
      </div>
    </div>
    <div ref="measureLineBottom" class="measureline measure-line-bottom"></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import IconTranslate from "@/components/icons/IconTranslate.vue";
import IconCloseBox from "@/components/icons/IconCloseBox.vue";
import IconDragLeft from "@/components/icons/IconDragLeft.vue";
import IconDragRight from "@/components/icons/IconDragRight.vue";
import ScreenRuler from "./ScreenRuler.js";

const dpr = window.devicePixelRatio || 1;
const type = ref("horizontal");
const [rulerWidth, rulerHeight] = [
  ref(ScreenRuler.RULER_CONFIG.DEFAULT_SIZE.width),
  ref(ScreenRuler.RULER_CONFIG.DEFAULT_SIZE.height),
];
const rulerCanvas = ref(null);
const measureLineTop = ref(null);
const measureLineBottom = ref(null);
const winPos = ref({ x: 0, y: 0 });
const resizeMode = ref("none");
let screenRuler = null;
let removeResizeListener = null;

let dragState = {
  isDragging: false,
  resizeMode: "none",
  start: { x: 0, y: 0, width: 0, height: 0 },
  anchor: { x: 0, y: 0 },
  mouseOffset: { x: 0, y: 0 },
};

const leftBtn = ref(null);
const rightBtn = ref(null);
let handleMouseMove = null;
let handleMouseUp = null;
let handleMouseLeave = null;

// ========== 核心：全局鼠标追踪 + 测量线状态管理 ==========
let globalMouseMoveHandler = null; // 全局鼠标事件
let measureLineVisible = false; // 手动管理显示状态
let measureLineTimer = null; // 延迟隐藏定时器
let handleWindowLeave = null; // 窗口离开兜底事件

/**
 * 节流：限制高频事件执行频率（16ms ≈ 60帧/秒）
 */
const throttle = (fn, delay = 16) => {
  let lastCall = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      fn(...args);
      lastCall = now;
    }
  };
};

/**
 * 防抖：合并短时间内的重复调用（仅用于显示更新）
 */
const debounce = (fn, delay = 8) => {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

// 获取元素的屏幕坐标系边界（解决DPR/拖拽区域偏移）
const getElementScreenRect = (el) => {
  if (!el) return { x: 0, y: 0, right: 0, bottom: 0 };
  const rect = el.getBoundingClientRect();
  // 转换为屏幕坐标（Electron窗口偏移修正 + 整数取整）
  return {
    x: Math.floor(rect.left) + window.screenX,
    y: Math.floor(rect.top) + window.screenY,
    right: Math.ceil(rect.right) + window.screenX,
    bottom: Math.ceil(rect.bottom) + window.screenY,
  };
};

// 判断鼠标是否在测量线区域内（1px容错，精准判定）
const isInMeasureArea = (mouseX, mouseY) => {
  const topRect = getElementScreenRect(measureLineTop.value);
  const bottomRect = getElementScreenRect(measureLineBottom.value);

  // 1px容错：抵消小数像素间隙，同时保证离开判定精准
  const inTop =
    mouseX >= topRect.x - 1 &&
    mouseX <= topRect.right + 1 &&
    mouseY >= topRect.y - 1 &&
    mouseY <= topRect.bottom + 1;

  const inBottom =
    mouseX >= bottomRect.x - 1 &&
    mouseX <= bottomRect.right + 1 &&
    mouseY >= bottomRect.y - 1 &&
    mouseY <= bottomRect.bottom + 1;

  return inTop || inBottom;
};

// 防抖更新标线位置（避免高频IPC调用）
const debounceUpdatePos = debounce((params) => {
  window.channel.updateMeasureLinePos({
    x: params.x,
    y: params.y,
    type: "horizontal",
    visible: params.visible,
  });
}, 16);

// 全局鼠标移动处理（核心修复：解决显示/隐藏异常）
const handleGlobalMouseMove = throttle((e) => {
  const inArea = isInMeasureArea(e.screenX, e.screenY);
  clearTimeout(measureLineTimer);

  // 1. 鼠标在测量区：强制更新状态 + 显示标线
  if (inArea) {
    measureLineVisible = true;
    const topRect = getElementScreenRect(measureLineTop.value);
    const isTop = e.screenY >= topRect.y && e.screenY <= topRect.bottom;
    const targetY = isTop ? e.screenY - 20 : e.screenY;
    debounceUpdatePos({ x: e.screenX, y: targetY, visible: true });
  }
  // 2. 鼠标离开测量区：无条件触发延迟隐藏（30ms快速响应）
  else {
    measureLineTimer = setTimeout(() => {
      if (measureLineVisible) {
        measureLineVisible = false;
        window.channel.updateMeasureLinePos({
          type: "horizontal",
          visible: false,
        });
      }
    }, 30);
  }
});

const initScreenRuler = () => {
  if (!rulerCanvas.value) return;
  screenRuler = new ScreenRuler(rulerCanvas.value, {
    type: type.value,
    width: rulerWidth.value,
    height: rulerHeight.value,
    winPos: winPos.value,
  });
  screenRuler.redraw();
  // 移除所有元素内的mouse事件绑定，彻底规避事件干扰
};

async function toggleType() {
  const oldType = type.value;
  type.value = oldType === "horizontal" ? "vertical" : "horizontal";
  const newSize = screenRuler.calculateNewSize();
  await window.channel.rulerToggleType();
  rulerWidth.value = newSize.width;
  rulerHeight.value = newSize.height;
  screenRuler.updateType(type.value);
  screenRuler.updateSize(newSize.width, newSize.height);
  screenRuler.redraw();
}

async function closeRuler() {
  // 关闭时强制隐藏标线
  clearTimeout(measureLineTimer);
  if (measureLineVisible) {
    measureLineVisible = false;
    window.channel.updateMeasureLinePos({
      type: "horizontal",
      visible: false,
    });
  }
  await window.channel.closeScreenRuler();
}

async function startDrag(mode, e) {
  if (dragState.isDragging) return;
  const bounds = await window.channel.rulerGetBounds();
  let mouseOffset = {
    x: e.screenX - bounds.x,
    y: e.screenY - bounds.y,
  };

  if (mode == "right") {
    mouseOffset = {
      x: e.screenX - bounds.x - bounds.width,
      y: e.screenY - bounds.y,
    };
  }

  const anchor = {
    x:
      type.value === "horizontal" && mode === "left"
        ? bounds.x + bounds.width
        : bounds.x,
    y:
      type.value === "vertical" && mode === "left"
        ? bounds.y + bounds.height
        : bounds.y,
  };

  dragState = {
    isDragging: true,
    resizeMode: mode,
    start: { ...bounds },
    anchor,
    mouseOffset,
  };
  resizeMode.value = mode;
}

const resetDragState = () => {
  dragState = {
    isDragging: false,
    resizeMode: "none",
    start: { x: 0, y: 0, width: 0, height: 0 },
    anchor: { x: 0, y: 0 },
    mouseOffset: { x: 0, y: 0 },
  };
  resizeMode.value = "none";
};

onMounted(async () => {
  initScreenRuler();

  // ========== 绑定全局鼠标事件 ==========
  globalMouseMoveHandler = handleGlobalMouseMove;
  window.addEventListener("mousemove", globalMouseMoveHandler);

  // ========== 新增：窗口离开/失焦 兜底隐藏 ==========
  handleWindowLeave = () => {
    clearTimeout(measureLineTimer);
    if (measureLineVisible) {
      measureLineVisible = false;
      window.channel.updateMeasureLinePos({
        type: "horizontal",
        visible: false,
      });
    }
  };
  // 鼠标移出窗口时触发
  document.addEventListener("mouseleave", handleWindowLeave);
  // 窗口失焦时触发（切到其他应用）
  window.addEventListener("blur", handleWindowLeave);

  // 拖拽逻辑保持不变
  handleMouseMove = async (e) => {
    if (!dragState.isDragging || e.buttons !== 1) {
      resetDragState();
      return;
    }

    const mouseX = e.screenX;
    const mouseY = e.screenY;
    const minSize = 240;
    const { resizeMode, start, anchor, mouseOffset } = dragState;
    let newBounds = { ...start };

    if (type.value === "horizontal") {
      newBounds.height = start.height;
      if (resizeMode === "left") {
        const targetX = Math.max(0, mouseX - mouseOffset.x);
        newBounds.width = Math.max(minSize, anchor.x - targetX);
        newBounds.x = anchor.x - newBounds.width;
      } else if (resizeMode === "right") {
        const targetWidth = Math.max(
          minSize,
          mouseX - anchor.x - mouseOffset.x
        );
        newBounds.width = targetWidth;
      }
    } else {
      newBounds.width = start.width;
      if (resizeMode === "left") {
        const targetY = Math.max(0, mouseY - mouseOffset.y);
        newBounds.height = Math.max(minSize, anchor.y - targetY);
        newBounds.y = anchor.y - newBounds.height;
      } else if (resizeMode === "right") {
        const targetHeight = Math.max(
          minSize,
          mouseY - anchor.y - mouseOffset.y
        );
        newBounds.height = targetHeight;
      }
    }

    await window.channel.rulerSetBounds(newBounds);
    rulerWidth.value = newBounds.width;
    rulerHeight.value = newBounds.height;
    winPos.value = { x: newBounds.x, y: newBounds.y };

    if (screenRuler) {
      screenRuler.updateSize(newBounds.width, newBounds.height);
      screenRuler.updateWinPos({ x: newBounds.x, y: newBounds.y });
      screenRuler.redraw();
    }
  };

  handleMouseUp = () => resetDragState();
  handleMouseLeave = () => resetDragState();

  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", handleMouseUp);
  window.addEventListener("mouseleave", handleMouseLeave);

  if (window.channel?.onRulerResize) {
    removeResizeListener = window.channel.onRulerResize((bounds) => {
      if (!dragState.isDragging) {
        rulerWidth.value = bounds.width;
        rulerHeight.value = bounds.height;
        winPos.value = { x: bounds.x, y: bounds.y };
        screenRuler?.updateSize(bounds.width, bounds.height);
        screenRuler?.updateWinPos({ x: bounds.x, y: bounds.y });
      }
    });
  }

  watch(type, () => {
    if (screenRuler) screenRuler.redraw();
  });
});

onUnmounted(() => {
  // ========== 清理所有事件和定时器 ==========
  clearTimeout(measureLineTimer);
  resetDragState();

  // 移除全局鼠标追踪
  window.removeEventListener("mousemove", globalMouseMoveHandler);
  // 移除拖拽相关事件
  window.removeEventListener("mousemove", handleMouseMove);
  window.removeEventListener("mouseup", handleMouseUp);
  window.removeEventListener("mouseleave", handleMouseLeave);
  // 移除窗口兜底隐藏事件
  if (handleWindowLeave) {
    document.removeEventListener("mouseleave", handleWindowLeave);
    window.removeEventListener("blur", handleWindowLeave);
  }
  // 移除尺寸监听
  if (removeResizeListener) removeResizeListener();
});
</script>

<style type="scss" scoped>
.ruler-container {
  user-select: none;
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  cursor: move;
  box-sizing: border-box;
  /* 修复：禁止布局抖动 */
  will-change: transform;
  transform: translateZ(0);
}

.drag-area {
  width: 100%;
  position: absolute;
  left: 0;
  top: 20px;
  /* 修复：用整数像素，避免calc产生小数 */
  height: calc(100% - 40px);
  -webkit-app-region: drag;
  /* 修复：开启GPU加速，避免布局重排 */
  transform: translateZ(0);
  z-index: 10;
}

.drag-area .ruler-controls,
.drag-area .resize-btn {
  -webkit-app-region: no-drag !important;
  box-sizing: border-box;
  pointer-events: auto !important;
}

.ruler-canvas {
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  transform: translateZ(0);
  display: block;
}

/* 控制按钮容器：降低层级，避免遮挡measure-line的视觉 */
.ruler-controls {
  position: absolute;
  width: auto;
  height: auto;
  left: 40px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 4px;
  z-index: 10;
  cursor: pointer;
}

.control-btn {
  width: 18px;
  height: 18px;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon {
  width: 14px;
  height: 14px;
  color: #000;
  flex-shrink: 0;
}

.control-btn:hover .icon {
  color: #046e75;
}

/* 拖拽按钮：降低层级，避免遮挡measure-line的视觉 */
.resize-btn {
  position: absolute;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ew-resize;
  flex-shrink: 0;
  z-index: 10;

  .icon {
    color: #575757;
    font-size: 14px;
    font-weight: bold;
    line-height: 1;
    transform-origin: center center;
    flex-shrink: 0;
  }
}

.resize-left {
  left: 2px;
  top: 50%;
  transform: translateY(-50%);
}

.resize-right {
  right: 2px;
  top: 50%;
  transform: translateY(-50%);
}

.ruler-vertical {
  .ruler-controls {
    width: auto;
    height: auto;
    left: 50%;
    top: 40px;
    transform: translateX(-50%);
    flex-direction: column;
    gap: 4px;
  }

  .resize-btn {
    cursor: ns-resize;

    &.resize-left .icon {
      transform: rotate(90deg);
    }

    &.resize-right .icon {
      transform: rotate(-90deg);
    }
  }

  .resize-left {
    left: 50%;
    top: 2px;
    transform: translateX(-50%);
    right: auto;
  }

  .resize-right {
    left: 50%;
    bottom: 2px;
    top: auto;
    transform: translateX(-50%);
    right: auto;
  }
}

/* ========== 测量线样式：视觉优先 + 无事件干扰 ========== */
.measure-line-top {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 20px;
  /* 视觉层级最高，避免被遮挡 */
  z-index: 20;
  /* 关键：不接收任何事件，交给全局追踪 */
  pointer-events: none;
  cursor:
    url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="),
    none !important;
  /* 确保光标样式生效 */
  user-select: none;
  -webkit-user-select: none;
}
.measure-line-bottom {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 100%;
  height: 20px;
  z-index: 20;
  pointer-events: none;
  cursor:
    url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="),
    none !important;
  user-select: none;
  -webkit-user-select: none;
}
</style>
