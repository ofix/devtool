<template>
  <div class="ruler-container" :class="`ruler-${type}`">
    <!-- Canvas 标尺 -->
    <canvas
      ref="rulerCanvas"
      class="ruler-canvas"
      :width="canvasSize.fixed"
      :height="canvasSize.dynamic"
    ></canvas>

    <!-- 左侧拉伸按钮：添加 .stop 阻止冒泡 -->
    <div
      ref="leftBtn"
      class="resize-btn resize-left"
      @mousedown.stop="startDrag('left', $event)"
    >
      <IconDragLeft />
    </div>

    <!-- 控制按钮：保持原有逻辑 -->
    <div class="ruler-controls">
      <div class="control-btn" @click.stop="toggleType">
        <IconTranslate />
      </div>
      <div class="control-btn" @click.stop="closeRuler">
        <IconCloseBox />
      </div>
    </div>

    <!-- 右侧拉伸按钮：添加 .stop 阻止冒泡 -->
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

// 核心状态
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

// 拖拽状态
let dragState = {
  isDragging: false,
  resizeMode: "none",
  start: { x: 0, y: 0, width: 0, height: 0 },
  anchor: { x: 0, y: 0 },
  mouseOffset: { x: 0, y: 0 }, // 鼠标相对于窗口边缘的初始偏移（核心修复）
};

const leftBtn = ref(null);
const rightBtn = ref(null);
let handleMouseMove = null;
let handleMouseUp = null;
let handleMouseLeave = null;
let globalMousePos = { x: 0, y: 0 };

const canvasSize = computed(() => {
  return screenRuler ? screenRuler.getCanvasSize() : { fixed: 0, dynamic: 0 };
});

// 初始化标尺
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

// 切换标尺类型
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

// 关闭标尺
async function closeRuler() {
  await window.channel.closeScreenRuler();
}

/**
 * 拉伸开始：新增$event，记录【鼠标初始偏移】
 * @param {string} mode - left/right
 * @param {MouseEvent} e - 原生鼠标事件
 */
async function startDrag(mode, e) {
  // 禁止拖拽时重复触发
  if (dragState.isDragging) return;

  // 获取窗口初始边界（全局坐标）
  const bounds = await window.channel.rulerGetBounds();
  // 记录【鼠标相对于窗口的初始偏移】（消去点击位置的偏差）
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

  // 初始化锚定边界
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
    mouseOffset, // 保存初始偏移
  };
  // 初始化全局鼠标坐标
  globalMousePos.x = e.screenX;
  globalMousePos.y = e.screenY;
  resizeMode.value = mode;
}
/**
 * 统一重置拖拽状态（避免状态残留）
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
// 生命周期钩子
onMounted(async () => {
  initScreenRuler();
  // 全局鼠标移动
  handleMouseMove = async (e) => {
    // 双重校验：拖拽状态+鼠标是否按下（原生e.buttons，防止状态残留）
    if (!dragState.isDragging || e.buttons !== 1) {
      resetDragState();
      return;
    }

    const mouseX = e.screenX;
    const mouseY = e.screenY;
    const minSize = 150;
    const { resizeMode, start, anchor, mouseOffset } = dragState;
    let newBounds = { ...start };

    // 横向拉伸：锁定高度，补偿偏移
    if (type.value === "horizontal") {
      newBounds.height = start.height;
      if (resizeMode === "left") {
        // 偏移补偿：鼠标X - 偏移量（让窗口边缘贴住鼠标，而非鼠标在窗口内）
        const targetX = Math.max(0, mouseX - mouseOffset.x);
        newBounds.width = Math.max(mioSize, anchor.x - targetX);
        newBounds.x = anchor.x - newBounds.width;
      } else if (resizeMode === "right") {
        const targetWidth = Math.max(
          minSize,
          mouseX - anchor.x - mouseOffset.x
        );
        newBounds.width = targetWidth;
      }
    }
    // 纵向拉伸：锁定宽度，补偿偏移
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

    await window.channel.rulerSetBounds(newBounds);
    // 同步更新本地状态
    if (screenRuler) {
      screenRuler.updateSize(newBounds.width, newBounds.height);
      screenRuler.updateWinPos({ x: newBounds.x, y: newBounds.y });
      screenRuler.redraw();
    }
    rulerWidth.value = newBounds.width;
    rulerHeight.value = newBounds.height;
    winPos.value = { x: newBounds.x, y: newBounds.y };
  };

  // 鼠标松开/离开：重置状态
  handleMouseUp = () => resetDragState();
  handleMouseLeave = () => resetDragState();

  // 绑定全局事件，鼠标移除窗口外也能响应鼠标移动事件（window级别，document都不行）
  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", handleMouseUp);
  window.addEventListener("mouseleave", handleMouseLeave);

  // 监听主进程resize事件
  if (window.channel?.onRulerResize) {
    removeResizeListener = window.channel.onRulerResize((bounds) => {
      if (!dragState.isDragging) {
        // 拖拽时忽略主进程推送，避免冲突
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

  // 卸载时清理
  onUnmounted(() => {
    resetDragState();
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
    document.removeEventListener("mouseleave", handleMouseLeave);
    if (removeResizeListener) removeResizeListener();
  });
});
</script>

<style type="scss" scoped>
.ruler-container {
  /* 关键属性：开启拖拽 */
  -webkit-app-region: drag;
  user-select: none;
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  /* 动态鼠标样式优先级最高 */
  cursor: move;
}

.ruler-container .ruler-controls,
.ruler-container .resize-btn {
  /* 明确标记按钮区域不参与窗口拖拽 */
  -webkit-app-region: no-drag !important;
}

.ruler-canvas {
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  transform: translateZ(0);
}

.ruler-controls {
  position: absolute;
  width: 40px;
  height: 20px;
  left: 40px;
  top: 36px;
  display: flex;
  gap: 4px;
  z-index: 10;
  cursor: pointer;
}

.control-btn {
  width: 18px;
  height: 18px;
  padding: 2px;
}

.icon {
  width: 14px;
  height: 14px;
  color: #000;
}

.control-btn:hover .icon {
  color: #046e75;
}

.resize-btn {
  position: absolute;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 按钮单独设置鼠标样式，确保可点击 */
  cursor: ew-resize;

  .icon {
    color: #575757;
    font-size: 14px;
    font-weight: bold;
    line-height: 1;
  }
}

/* 拉伸按钮垂直居中 */
.resize-left {
  left: 2px;
  top: 46%;
  transform: translateY(-50%);
}

.resize-right {
  right: 2px;
  top: 46%;
  transform: translateY(-50%);
}

.ruler-vertical {
  .resize-btn {
    position: absolute;
    width: 16px;
    height: 16px;
    cursor: ns-resize;
  }
  .resize-left {
    left: 50%;
    top: 2px;
    transform: translateX(-50%);
  }
  .resize-right {
    left: 50%;
    bottom: 2px;
    transform: translateX(-50%);
  }
}

</style>
