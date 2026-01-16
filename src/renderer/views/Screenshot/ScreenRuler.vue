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
      <button class="control-btn" @click="toggleType">切换横竖</button>
      <button class="control-btn" @click="closeRuler">关闭</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { ElMessage } from "element-plus";
import ScreenRuler from "./ScreenRuler.js";

// ========== 响应式数据 ==========
const type = ref("horizontal");
const [mouseX, mouseY] = [ref(0), ref(0)];
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

// ========== 工具函数 ==========
/**
 * 安全执行异步操作
 * @param {Function} fn - 异步函数
 * @param {string} errorMsg - 错误提示
 * @returns {Promise<any>}
 */
const safeAsyncExec = async (fn, errorMsg) => {
  try {
    return await fn();
  } catch (e) {
    console.error(`${errorMsg}：`, e);
    ElMessage.warning(`${errorMsg}：${e.message}`);
    return null;
  }
};

// ========== 业务逻辑 ==========
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
  // 切换类型
  const oldType = type.value;
  type.value = oldType === "horizontal" ? "vertical" : "horizontal";

  // 计算新尺寸
  const newSize = screenRuler.calculateNewSize();

  // 调用主进程修改窗口尺寸
  await safeAsyncExec(
    () =>
      window.channel.sendToolCmd(
        "ruler:set-size",
        newSize.width,
        newSize.height
      ),
    "切换尺寸失败"
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
  await safeAsyncExec(() => window.channel.closeScreenRuler(), "关闭失败");
};

/**
 * 更新标尺尺寸
 */
const updateRulerSize = async () => {
  const size = await safeAsyncExec(
    () => window.channel.rulerGetSize(),
    "获取尺寸失败"
  );
  rulerWidth.value = size?.width || ScreenRuler.RULER_CONFIG.DEFAULT_SIZE.width;
  rulerHeight.value = size?.height || ScreenRuler.FIXED_EDGE_SIZE;

  if (screenRuler) {
    screenRuler.updateSize(rulerWidth.value, rulerHeight.value);
    screenRuler.redraw();
  }
};

/**
 * 更新窗口位置
 */
const updateWinPos = async () => {
  const pos = await safeAsyncExec(
    () => window.channel.rulerGetPosition(),
    "获取位置失败"
  );
  winPos.value = pos || { x: 0, y: 0 };

  if (screenRuler) {
    screenRuler.updateWinPos(winPos.value);
    screenRuler.redraw();
  }
};

/**
 * 处理鼠标按下（拖动）
 */
const handleMouseDown = async (e) => {
  isDragging.value = true;

  // 获取初始拖动位置
  const pos = await safeAsyncExec(
    () => window.channel.rulerGetPosition(),
    "获取初始位置失败"
  );
  dragStartX.value = e.x - (pos?.x || 0);
  dragStartY.value = e.y - (pos?.y || 0);

  // 鼠标移动处理
  const handleMouseMove = async (e) => {
    if (!isDragging.value) return;

    await safeAsyncExec(
      () =>
        window.channel.rulerSetPosition(
          e.x - dragStartX.value,
          e.y - dragStartY.value
        ),
      "拖动失败"
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

/**
 * 处理鼠标位置更新
 */
const handleMousePositionUpdate = async (pos) => {
  mouseX.value = pos.x;
  mouseY.value = pos.y;

  if (screenRuler) {
    screenRuler.updateMousePos({ x: pos.x, y: pos.y });
    screenRuler.redraw();
  }

  await updateWinPos();
};

// ========== 生命周期 ==========
onMounted(async () => {
  // 初始化核心实例
  initScreenRuler();

  // 初始化尺寸和位置
  await Promise.all([updateRulerSize(), updateWinPos()]);

  // 监听初始配置
  try {
    window.channel.on("ruler-init", (options) => {
      if (options.type) type.value = options.type;
      if (screenRuler) screenRuler.updateType(type.value);
    });
  } catch (e) {
    console.warn("未监听初始化事件：", e);
  }

  // 监听鼠标位置
  try {
    window.channel.on("mouse-position", handleMousePositionUpdate);
  } catch (e) {
    console.warn("未监听鼠标位置事件：", e);
  }

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

<style scoped>
.ruler-container {
  position: relative;
  width: 100%;
  height: 100%;
  user-select: none;
  cursor: move;
  overflow: hidden;
}

.ruler-canvas {
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  transform: translateZ(0);
}

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

.ruler-horizontal {
  cursor: ew-resize;
}
.ruler-vertical {
  cursor: ns-resize;
}
</style>
