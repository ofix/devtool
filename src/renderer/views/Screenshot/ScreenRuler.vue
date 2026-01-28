<template>
  <div class="ruler-container" :class="`ruler-${type}`">
    <canvas ref="rulerCanvas" class="ruler-canvas"></canvas>
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
let globalMousePos = { x: 0, y: 0 };

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
  globalMousePos.x = e.screenX;
  globalMousePos.y = e.screenY;
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
          mouseX - anchor.x - mouseOffset.x,
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
          mouseY - anchor.y - mouseOffset.y,
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
  resetDragState();
  window.removeEventListener("mousemove", handleMouseMove);
  window.removeEventListener("mouseup", handleMouseUp);
  window.removeEventListener("mouseleave", handleMouseLeave);
  if (removeResizeListener) removeResizeListener();
});
</script>

<style type="scss" scoped>
.ruler-container {
  -webkit-app-region: drag;
  user-select: none;
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  cursor: move;
  /* 为子元素居中提供参考 */
  box-sizing: border-box;
}

.ruler-container .ruler-controls,
.ruler-container .resize-btn {
  -webkit-app-region: no-drag !important;
  /* 统一盒模型，避免padding/border影响尺寸 */
  box-sizing: border-box;
}

.ruler-canvas {
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  transform: translateZ(0);
  display: block;
}

/* 控制按钮容器：通用居中方案，适配横竖 */
.ruler-controls {
  position: absolute;
  /* 移除固定宽高，由子元素自适应 */
  width: auto;
  height: auto;
  /* 横向标尺：左偏移40px，垂直居中 */
  left: 40px;
  top: 50%;
  /* 核心：垂直居中（抵消自身高度的50%） */
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
  /* 确保按钮本身内容居中 */
  flex-shrink: 0;
}

.icon {
  width: 14px;
  height: 14px;
  color: #000;
  /* 确保图标自适应按钮尺寸 */
  flex-shrink: 0;
}

.control-btn:hover .icon {
  color: #046e75;
}

/* 拖拽按钮：通用样式，统一居中逻辑 */
.resize-btn {
  position: absolute;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ew-resize;
  /* 确保按钮不被挤压 */
  flex-shrink: 0;

  .icon {
    color: #575757;
    font-size: 14px;
    font-weight: bold;
    line-height: 1;
    transform-origin: center center;
    flex-shrink: 0;
  }
}

/* 横向标尺：拖拽按钮垂直居中（核心修复） */
.resize-left {
  left: 2px;
  /* 垂直居中：top 50% + transform Y轴偏移 */
  top: 50%;
  transform: translateY(-50%);
}

.resize-right {
  right: 2px;
  /* 垂直居中：和左侧按钮一致 */
  top: 50%;
  transform: translateY(-50%);
}

/* 纵向标尺样式修正（核心：所有居中逻辑重构） */
.ruler-vertical {
  /* 控制按钮：横向居中，上偏移40px */
  .ruler-controls {
    /* 移除固定宽高，适配竖向排列 */
    width: auto;
    height: auto;
    /* 横向居中 + 上偏移40px */
    left: 50%;
    top: 40px;
    /* 核心：横向居中（抵消自身宽度的50%） */
    transform: translateX(-50%);
    /* 竖向排列 */
    flex-direction: column;
    gap: 4px;
  }

  /* 拖拽按钮样式修正 */
  .resize-btn {
    cursor: ns-resize;

    /* 左侧按钮（顶部）顺时针旋转90° */
    &.resize-left .icon {
      transform: rotate(90deg);
    }

    /* 右侧按钮（底部）逆时针旋转90°（修复之前的错误旋转） */
    &.resize-right .icon {
      transform: rotate(-90deg);
    }
  }

  /* 纵向标尺：拖拽按钮横向居中 */
  .resize-left {
    /* 横向居中 + 上偏移2px */
    left: 50%;
    top: 2px;
    /* 核心：横向居中（抵消自身宽度的50%） */
    transform: translateX(-50%);
    /* 覆盖横向的top/transform */
    right: auto;
  }

  .resize-right {
    /* 横向居中 + 下偏移2px */
    left: 50%;
    bottom: 2px;
    /* 覆盖横向的top属性 */
    top: auto;
    /* 核心：横向居中 */
    transform: translateX(-50%);
    right: auto;
  }
}
</style>
