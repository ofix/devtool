<template>
  <div
    class="ruler-container"
    :class="`ruler-${type}`"
    :style="{ width: '100%', height: '100%' }"
  >
    <!-- 标尺刻度 -->
    <div class="ruler-scale">
      <div
        v-for="tick in tickList"
        :key="tick.value"
        class="ruler-tick"
        :style="{
          [type === 'horizontal' ? 'left' : 'top']: `${tick.percent}%`,
          height: tick.type === 'major' ? '20px' : '10px',
          width: tick.type === 'major' ? '20px' : '10px',
        }"
      >
        <span v-if="tick.type === 'major'" class="tick-label">{{
          tick.value
        }}</span>
      </div>
    </div>

    <!-- 鼠标位置显示 -->
    <div class="ruler-position">
      X: {{ mouseX }} px | Y: {{ mouseY }} px | 尺寸: {{ rulerWidth }} x
      {{ rulerHeight }} px
    </div>

    <!-- 控制面板 -->
    <div class="ruler-controls">
      <el-button size="mini" icon="el-icon-refresh" @click="toggleType">
        {{ type === "horizontal" ? "竖尺" : "横尺" }}
      </el-button>
      <el-select v-model="precision" size="mini" style="width: 80px">
        <el-option label="1px" value="1"></el-option>
        <el-option label="5px" value="5"></el-option>
        <el-option label="10px" value="10"></el-option>
      </el-select>
      <el-button size="mini" icon="el-icon-close" @click="closeRuler"
        >关闭</el-button
      >
    </div>

    <!-- 鼠标标线 -->
    <div
      class="mouse-line vertical"
      v-if="type === 'horizontal'"
      :style="{ left: `${mousePercentX}%` }"
    ></div>
    <div
      class="mouse-line horizontal"
      v-if="type === 'vertical'"
      :style="{ top: `${mousePercentY}%` }"
    ></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { ElMessage } from "element-plus";

// 响应式数据
const type = ref("horizontal");
const precision = ref("1");
const mouseX = ref(0);
const mouseY = ref(0);
const mousePercentX = ref(0);
const mousePercentY = ref(0);
const rulerWidth = ref(0);
const rulerHeight = ref(0);
const screenWidth = ref(0);
const screenHeight = ref(0);

// 存储监听函数引用（用于卸载时清理）
let rulerInitListener = null;
let mousePositionListener = null;

// 计算刻度列表
const tickList = computed(() => {
  const list = [];
  const precisionVal = Number(precision.value);
  const maxValue =
    type.value === "horizontal" ? rulerWidth.value : rulerHeight.value;

  for (let i = 0; i <= maxValue; i += precisionVal) {
    const percent = (i / maxValue) * 100;
    const isMajor = i % (10 * precisionVal) === 0;
    list.push({
      value: i,
      percent,
      type: isMajor ? "major" : "minor",
    });
  }
  return list;
});

// 切换标尺方向（基于你现有 channel 调用）
const toggleType = async () => {
  type.value = type.value === "horizontal" ? "vertical" : "horizontal";
  // 调用主进程切换窗口尺寸
  const newSize = await window.channel.rulerToggleType();
  if (newSize) {
    rulerWidth.value = newSize.width;
    rulerHeight.value = newSize.height;
  }
};

// 关闭标尺（复用你 preload 中定义的 closeScreenRuler）
const closeRuler = async () => {
  await window.channel.closeScreenRuler();
};

// 更新标尺尺寸（基于 channel 获取）
const updateRulerSize = async () => {
  const size = await window.channel.rulerGetSize();
  rulerWidth.value = size.width;
  rulerHeight.value = size.height;
};

// 初始化
onMounted(async () => {
  // 1. 监听初始配置（复用你 preload 的 on 方法）
  rulerInitListener = (options) => {
    if (options.type) type.value = options.type;
    if (options.precision) precision.value = options.precision;
  };
  window.channel.on("ruler-init", rulerInitListener);

  // 2. 监听鼠标位置
  mousePositionListener = async (pos) => {
    mouseX.value = pos.x;
    mouseY.value = pos.y;
    screenWidth.value = pos.screenWidth;
    screenHeight.value = pos.screenHeight;

    // 获取窗口位置和尺寸（通过 channel 调用）
    const winPos = await window.channel.rulerGetPosition();
    const winSize = await window.channel.rulerGetSize();

    // 计算鼠标在标尺内的百分比
    if (type.value === "horizontal") {
      mousePercentX.value = ((pos.x - winPos.x) / winSize.width) * 100;
    } else {
      mousePercentY.value = ((pos.y - winPos.y) / winSize.height) * 100;
    }
  };
  window.channel.on("mouse-position", mousePositionListener);

  // 3. 初始化窗口尺寸
  await updateRulerSize();
  window.addEventListener("resize", updateRulerSize);

  // 4. 拖拽窗口（基于 channel 设置位置）
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;

  document.addEventListener("mousedown", async (e) => {
    if (e.target.classList.contains("ruler-container")) {
      isDragging = true;
      const winPos = await window.channel.rulerGetPosition();
      dragStartX = e.x - winPos.x;
      dragStartY = e.y - winPos.y;
    }
  });

  document.addEventListener("mousemove", async (e) => {
    if (isDragging) {
      await window.channel.rulerSetPosition(e.x - dragStartX, e.y - dragStartY);
    }
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
  });

  ElMessage.success("标尺已打开（ESC键可关闭）");
});

// 清理监听
onUnmounted(() => {
  // 移除自定义监听
  if (rulerInitListener) window.channel.off("ruler-init", rulerInitListener);
  if (mousePositionListener)
    window.channel.off("mouse-position", mousePositionListener);
  window.removeEventListener("resize", updateRulerSize);
});
</script>

<style scoped>
/* 样式完全保持不变 */
.ruler-container {
  position: relative;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #ccc;
  user-select: none;
  cursor: move;
}

.ruler-horizontal {
  flex-direction: row;
}
.ruler-vertical {
  flex-direction: column;
}

.ruler-scale {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
}

.ruler-tick {
  position: absolute;
  border-left: 1px solid #666;
  border-bottom: 1px solid #666;
}

.tick-label {
  position: absolute;
  bottom: 0;
  left: -5px;
  font-size: 12px;
  color: #333;
}

.ruler-position {
  position: absolute;
  top: 2px;
  right: 10px;
  font-size: 12px;
  color: #666;
  background: rgba(255, 255, 255, 0.8);
  padding: 2px 5px;
  border-radius: 3px;
}

.ruler-controls {
  position: absolute;
  bottom: 2px;
  right: 10px;
  display: flex;
  gap: 5px;
}

.mouse-line {
  position: absolute;
  background: #ff4444;
  opacity: 0.7;
}
.vertical {
  width: 1px;
  height: 100%;
  top: 0;
}
.horizontal {
  height: 1px;
  width: 100%;
  left: 0;
}

.ruler-vertical .ruler-scale {
  flex-direction: column;
}
.ruler-vertical .ruler-tick {
  border-left: none;
  border-bottom: none;
  border-top: 1px solid #666;
  border-right: 1px solid #666;
}
.ruler-vertical .tick-label {
  bottom: auto;
  left: 5px;
  top: -8px;
}
</style>
