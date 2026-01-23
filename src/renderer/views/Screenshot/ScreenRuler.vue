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
    <!-- 控制按钮 -->
    <div class="ruler-controls">
      <div class="control-btn">
        <IconTranslate @click="toggleType" />
      </div>
      <div class="control-btn">
        <IconCloseBox @click="closeRuler" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import IconTranslate from "@/components/icons/IconTranslate.vue";
import IconCloseBox from "@/components/icons/IconCloseBox.vue";
import ScreenRuler from "./ScreenRuler.js";

const type = ref("horizontal");
const [rulerWidth, rulerHeight] = [
  ref(ScreenRuler.RULER_CONFIG.DEFAULT_SIZE.width),
  ref(ScreenRuler.RULER_CONFIG.DEFAULT_SIZE.height),
];
const rulerCanvas = ref(null);
const winPos = ref({ x: 0, y: 0 });
const [isDragging, dragStartX, dragStartY] = [ref(false), ref(0), ref(0)];

// 标尺核心实例
let screenRuler = null;

// ========== 计算属性 ==========
const canvasSize = computed(() => {
  return screenRuler ? screenRuler.getCanvasSize() : { fixed: 0, dynamic: 0 };
});

/**
 * 初始化标尺核心实例
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
 * 切换标尺类型
 */
const toggleType = async () => {
  const oldType = type.value;
  type.value = oldType === "horizontal" ? "vertical" : "horizontal";
  const newSize = screenRuler.calculateNewSize();
  // 调用主进程修改窗口尺寸
  await window.channel.sendToolCmd(
    "ruler:set-size",
    newSize.width,
    newSize.height
  );

  // 更新本地尺寸和核心实例
  rulerWidth.value = newSize.width;
  rulerHeight.value = newSize.height;
  screenRuler.updateType(type.value);
  screenRuler.updateSize(newSize.width, newSize.height);
  screenRuler.redraw();
};

/**
 * 关闭标尺
 */
const closeRuler = async () => {
  await window.channel.closeScreenRuler();
};

/**
 * 更新标尺尺寸
 */
const updateRulerSize = async () => {
  const size = await window.channel.rulerGetSize();
  rulerWidth.value = size?.width || ScreenRuler.RULER_CONFIG.DEFAULT_SIZE.width;
  rulerHeight.value = size?.height || ScreenRuler.FIXED_EDGE_SIZE;

  if (screenRuler) {
    screenRuler.updateSize(rulerWidth.value, rulerHeight.value);
  }
};

/**
 * 更新窗口位置
 */
const updateWinPos = async () => {
  const pos = await window.channel.rulerGetPosition();
  winPos.value = pos || { x: 0, y: 0 };

  if (screenRuler) {
    screenRuler.updateWinPos(winPos.value);
  }
};

/**
 * 处理鼠标按下（拖动）
 */
const handleMouseDown = async (e) => {
  isDragging.value = true;

  // 获取初始拖动位置
  const pos = await window.channel.rulerGetPosition();
  dragStartX.value = e.x - (pos?.x || 0);
  dragStartY.value = e.y - (pos?.y || 0);

  // 鼠标移动处理
  const handleMouseMove = async (e) => {
    if (!isDragging.value) return;
    await window.channel.rulerSetPosition(
      e.x - dragStartX.value,
      e.y - dragStartY.value
    );
    await updateWinPos();
  };

  // 鼠标抬起处理
  const handleMouseUp = () => {
    isDragging.value = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
};

// ========== 生命周期 ==========
onMounted(async () => {
  // 初始化核心实例
  initScreenRuler();

  // 窗口缩放监听
  const handleResize = async () => {
    await updateRulerSize();
  };
  window.addEventListener("resize", handleResize);

  // 监听类型变化
  watch(type, () => {
    if (screenRuler) screenRuler.redraw();
  });

  // 卸载清理
  onUnmounted(() => {
    window.removeEventListener("resize", handleResize);
    // 移除 channel 监听
    try {
      window.channel.off("ruler-init");
      window.channel.off("mouse-position");
    } catch (e) {}
  });
});
</script>

<style type="scss" scoped>
.ruler-container {
  /* 关键属性：开启拖拽 */
  -webkit-app-region: drag;
  /* 防止拖拽区域内的按钮被遮挡/无法点击 */
  user-select: none;
  position: relative;
  width: 100%;
  height: 100%;
  user-select: none;
  cursor: move;
  overflow: hidden;
}

.ruler-container .ruler-controls {
  -webkit-app-region: no-drag;
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
  cursor:pointer;
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

.control-btn:hover {
  .icon{
    color:#046e75;
  }
}

.ruler-horizontal {
  cursor: ew-resize;
}
.ruler-vertical {
  cursor: ns-resize;
}
</style>
