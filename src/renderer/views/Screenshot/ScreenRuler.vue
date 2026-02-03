<template>
  <div class="ruler-container" :class="`ruler-${type}`">
    <canvas ref="rulerCanvas" class="ruler-canvas"></canvas>
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
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from "vue";
import IconTranslate from "@/components/icons/IconTranslate.vue";
import IconCloseBox from "@/components/icons/IconCloseBox.vue";
import IconDragLeft from "@/components/icons/IconDragLeft.vue";
import IconDragRight from "@/components/icons/IconDragRight.vue";
import ScreenRuler from "./ScreenRuler.js";

// 基础配置
const dpr = window.devicePixelRatio || 1;
const type = ref("horizontal");
const [rulerWidth, rulerHeight] = [
  ref(ScreenRuler.RULER_CONFIG.DEFAULT_SIZE.width),
  ref(ScreenRuler.RULER_CONFIG.DEFAULT_SIZE.height),
];
// 元素引用
const rulerCanvas = ref(null);
const measureLineTop = ref(null);
const measureLineBottom = ref(null);
const leftBtn = ref(null);
const rightBtn = ref(null);
// 状态管理
const winPos = ref({ x: 0, y: 0 });
const resizeMode = ref("none");
let screenRuler = null;
let removeResizeListener = null;
// 拖拽状态
let dragState = {
  isDragging: false,
  resizeMode: "none",
  start: { x: 0, y: 0, width: 0, height: 0 },
  anchor: { x: 0, y: 0 },
  mouseOffset: { x: 0, y: 0 },
};
let captureState = {
  isDragging: false,
  direction: "top",
};
// 测量线核心状态（全局唯一，避免多实例冲突）
let measureLineVisible = false;
let measureLineTimer = null;
let globalMouseMoveHandler = null;
let handleWindowLeave = null;
// 事件句柄（统一管理，方便清理）
let dragMouseMove = null;
let dragMouseUp = null;
let dragMouseLeave = null;

/**
 * 节流：强节流（40ms），避免高频触发，同时保证流畅度
 * @param {Function} fn 执行函数
 * @param {Number} delay 延迟时间
 * @returns {Function} 节流后的函数
 */
const throttle = (fn, delay = 40) => {
  let timer = null;
  return (...args) => {
    if (!timer) {
      timer = setTimeout(() => {
        fn.apply(this, args);
        timer = null;
      }, delay);
    }
  };
};

/**
 * 防抖：合并IPC调用，避免Electron进程通信阻塞
 * @param {Function} fn 执行函数
 * @param {Number} delay 延迟时间
 * @returns {Function} 防抖后的函数
 */
const debounce = (fn, delay = 20) => {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
};

/**
 * 防抖更新测量线位置（Electron IPC通信，避免高频调用）
 */
const debounceUpdatePos = (params) => {
  if (params.visible) {
    window.channel.updateMeasureLinePos({
      x: params.x,
      y: params.y,
      type: type.value,
      direction: params.direction,
    });
  } else {
    window.channel.hideWindow("MeasureLineWnd");
  }
};

/**
 * 初始化标尺实例
 */
const initScreenRuler = () => {
  if (!rulerCanvas.value) return;
  screenRuler = new ScreenRuler(rulerCanvas.value, {
    type: type.value,
    width: rulerWidth.value,
    height: rulerHeight.value,
    winPos: winPos.value,
  });
  screenRuler.redraw();
};

/**
 * 切换标尺方向（水平/垂直）
 */
async function toggleType() {
  const oldType = type.value;
  type.value = oldType === "horizontal" ? "vertical" : "horizontal";
  if (!screenRuler) return;
  const newSize = screenRuler.calculateNewSize();
  await window.channel?.rulerToggleType();
  rulerWidth.value = newSize.width;
  rulerHeight.value = newSize.height;
  screenRuler.updateType(type.value);
  screenRuler.updateSize(newSize.width, newSize.height);
  screenRuler.redraw();
  // 切换模式后重置测量线状态
  clearTimeout(measureLineTimer);
  measureLineVisible = false;
}

/**
 * 关闭标尺
 */
async function closeRuler() {
  // 清理测量线状态
  clearTimeout(measureLineTimer);
  measureLineVisible = false;
  window.channel.closeWindow("ScreenRulerWnd");
}

/**
 * 开始拖拽（调整标尺尺寸）
 * @param {String} mode 拖拽模式：left/right
 * @param {MouseEvent} e 鼠标事件
 */
async function startDrag(mode, e) {
  // 阻止事件冒泡，避免与全局鼠标事件冲突
  e.stopImmediatePropagation();
  if (dragState.isDragging || !window.channel) return;
  const bounds = await window.channel.rulerGetBounds();
  // 计算鼠标偏移和锚点
  let mouseOffset = { x: e.screenX - bounds.x, y: e.screenY - bounds.y };
  if (mode === "right") {
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
  // 设置拖拽状态
  dragState = {
    isDragging: true,
    resizeMode: mode,
    start: { ...bounds },
    anchor,
    mouseOffset,
  };

  resizeMode.value = mode;
}
/**
 * 重置拖拽状态
 */
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

function getMeasureDirection(mouseX, mouseY) {
  if (type.value == "horizontal") {
    if (mouseY <= 30 * dpr) {
      return "top";
    }
    if (mouseY >= 70 * dpr) {
      return "bottom";
    }
    return "none";
  } else {
    if (mouseX <= 30 * dpr) {
      return "left";
    }
    if (mouseX >= 70 * dpr) {
      return "right";
    }
    return "none";
  }
}

onMounted(async () => {
  initScreenRuler();
  rulerCanvas.value.addEventListener("mousedown", (e) => {
    let direction = getMeasureDirection(e.clientX, e.clientY);
    if (direction != "none") {
      captureState.isDragging = true;
      screenRuler.setMeasureDirection(direction);
      if (direction == "top" || direction == "bottom") {
        screenRuler.setMeasurePoints(e.clientX, e.clientX);
      } else {
        screenRuler.setMeasurePoints(e.clientY, e.clientY);
      }
      captureState.direction = direction;
    } else {
      captureState.isDragging = false;
    }
    screenRuler?.redraw();
  });
  rulerCanvas.value.addEventListener("mouseup", (e) => {
    captureState.isDragging = false;
  });
  rulerCanvas.value.addEventListener("mousemove", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (captureState.isDragging && e.buttons == 1) {
      if (
        captureState.direction == "top" ||
        captureState.direction == "bottom"
      ) {
        screenRuler?.updateEndMeasurePoint(e.clientX);
      } else {
        screenRuler?.updateEndMeasurePoint(e.clientY);
      }
      screenRuler?.redraw();
    }
    if (dragState.isDragging) {
      return;
    }
    const mouseX = e.screenX;
    const mouseY = e.screenY;
    const clientY = e.clientY;
    const clientX = e.clientX;
    if (type.value === "horizontal") {
      if (clientY <= 20) {
        debounceUpdatePos({
          x: mouseX - 2,
          y: mouseY - 18,
          visible: true,
          direction: "top",
        });
      } else {
        debounceUpdatePos({
          x: mouseX,
          y: mouseY + 1,
          visible: true,
          direction: "bottom",
        });
      }
    } else {
      if (clientX <= 20) {
        debounceUpdatePos({
          x: mouseX - 28,
          y: mouseY,
          visible: true,
          direction: "left",
        });
      } else if (clientX >= 80) {
        debounceUpdatePos({
          x: mouseX + 1,
          y: mouseY,
          visible: true,
          direction: "right",
        });
      }
    }
  });

  rulerCanvas.value.addEventListener("mouseleave", (e) => {
    window.channel.hideWindow("MeasureLineWnd");
  });

  // ========== 2. 绑定拖拽专属鼠标事件（独立于全局事件，避免冲突） ==========
  dragMouseMove = async (e) => {
    if (!dragState.isDragging || e.buttons !== 1) {
      resetDragState();
      return;
    }
    const mouseX = e.screenX;
    const mouseY = e.screenY;
    const minSize = 240;
    const { resizeMode, start, anchor, mouseOffset } = dragState;
    let newBounds = { ...start };

    // 水平模式：调整宽度
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
    }
    // 垂直模式：调整高度
    else {
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

    // 更新标尺尺寸和位置
    await window.channel?.rulerSetBounds(newBounds);
    rulerWidth.value = newBounds.width;
    rulerHeight.value = newBounds.height;
    winPos.value = { x: newBounds.x, y: newBounds.y };
    if (screenRuler) {
      screenRuler.updateSize(newBounds.width, newBounds.height);
      screenRuler.updateWinPos({ x: newBounds.x, y: newBounds.y });
      screenRuler.redraw();
    }
  };

  dragMouseUp = () => {
    resetDragState();
  };

  window.addEventListener("mousemove", dragMouseMove, { capture: true });
  window.addEventListener("mouseup", dragMouseUp, { capture: true });

  // ========== 4. 标尺尺寸监听 ==========
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

  // ========== 5. 监听标尺方向变化 ==========
  watch(type, () => {
    if (screenRuler) screenRuler.redraw();
    // 方向切换后重置测量线
    clearTimeout(measureLineTimer);
    measureLineVisible = false;
    window.channel.hideWindow("MeasureLineWnd");
  });
});

onUnmounted(() => {
  clearTimeout(measureLineTimer);
  measureLineVisible = false;
  resetDragState();

  // 移除拖拽事件
  if (dragMouseMove)
    window.removeEventListener("mousemove", dragMouseMove, { capture: true });
  if (dragMouseUp)
    window.removeEventListener("mouseup", dragMouseUp, { capture: true });

  // 移除尺寸监听
  if (removeResizeListener) removeResizeListener();

  // 清空所有引用，避免内存泄漏
  screenRuler = null;
  globalMouseMoveHandler = null;
  handleWindowLeave = null;
  dragMouseMove = null;
  dragMouseUp = null;
  dragMouseLeave = null;
});
</script>

<style type="scss" scoped>
.ruler-container {
  user-select: none;
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  transform: translateZ(0);
}

.drag-area {
  -webkit-app-region: drag;
  user-select: none;
  position: absolute;

  box-sizing: border-box;
  transform: translateZ(0);

  .ruler-horizontal & {
    width: 100%;
    height: calc(100% - 60px);
    left: 0;
    top: 30px;
  }
  .ruler-vertical & {
    width: calc(100% - 60px);
    height: 100%;
    left: 30px;
    top: 0px;
  }
}

.drag-area .ruler-controls,
.drag-area .resize-btn {
  -webkit-app-region: no-drag !important;
}

.ruler-canvas {
  width: 100%;
  height: 100%;
  display: block;
  /* image-rendering: pixelated;
  image-rendering: crisp-edges; */
  transform: translateZ(0);
  cursor:
    url("@/assets/empty.cur") 0 0,
    auto;
}

.ruler-controls {
  position: absolute;
  display: flex;
  gap: 4px;
  cursor: pointer;

  .ruler-horizontal & {
    left: 40px;
    top: 50%;
    transform: translateY(-50%);
    flex-direction: row;
  }

  .ruler-vertical & {
    left: 50%;
    top: 40px;
    transform: translateX(-50%);
    flex-direction: column;
  }
}

.control-btn {
  width: 18px;
  height: 18px;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  .icon {
    width: 14px;
    height: 14px;
    color: #000;
    transition: color 0.2s ease;
  }
  &:hover .icon {
    color: #046e75;
  }
}

.resize-btn {
  position: absolute;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  z-index: 20;
  cursor: ew-resize;
  .icon {
    color: #575757;
    font-size: 14px;
    font-weight: bold;
    line-height: 1;
    transform-origin: center;
  }

  .ruler-horizontal & {
    top: 50%;
    transform: translateY(-50%);
    &.resize-left {
      left: 2px;
    }
    &.resize-right {
      right: 2px;
    }
  }

  .ruler-vertical & {
    left: 50%;
    transform: translateX(-50%);
    cursor: ns-resize;
    &.resize-left {
      top: 2px;
    }
    &.resize-right {
      bottom: 2px;
    }
    &.resize-left .icon {
      transform: rotate(90deg);
    }
    &.resize-right .icon {
      transform: rotate(-90deg);
    }
  }
}
</style>
