<template>
  <div class="minute-kline-ctrl" tabindex="0">
    <!-- Canvas画布 -->
    <canvas
      ref="canvasRef"
      :width="width"
      :height="height"
      @mousemove="handleMouseMove"
      @mouseleave="handleMouseLeave"
      @wheel="handleWheel"
    ></canvas>

    <!-- 副图切换 -->
    <!-- <div class="subchart-switch">
      <button @click="toggleSubChart">
        {{ subChartMode === "volume" ? "成交量" : "MACD" }}
      </button>
    </div> -->
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from "vue";
import MinuteKlineRenderer from "./Components/MinuteKlineRenderer";

const props = defineProps({
  share: {
    type: Object,
    required: true,
  },
  minuteKlines: {
    type: Object,
  },
  fiveMinuteKlines: {
    type: Array,
    required: true,
  },
  height: {
    type: Number,
    default: 300,
  },
});

// Refs
const canvasRef = ref(null);
let renderer = null;

const subChartMode = ref("volume");
const width = ref(0);
const height = ref(props.height);

// 切换副图
const toggleSubChart = () => {
  subChartMode.value = subChartMode.value === "volume" ? "macd" : "volume";
  renderer?.setSubChartMode(subChartMode.value);
};

// 鼠标移动事件
const handleMouseMove = (e) => {
  if (!renderer) return;

  const rect = canvasRef.value.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // 计算数据索引
  const step =
    (width.value - renderer.chartLeft - renderer.chartRight) /
    (renderer.minuteKlines.length - 1);
  const index = Math.round((mouseX - renderer.chartLeft) / step);

  if (index >= 0 && index < renderer.minuteKlines.length) {
    renderer.setCrosshair(mouseX, mouseY, index);
  }
};

// 鼠标离开事件
const handleMouseLeave = () => {
  renderer?.hideCrosshair();
};

// 初始化Canvas
const initCanvas = () => {
  if (!canvasRef.value) return;
  const rect = canvasRef.value.parentElement.getBoundingClientRect();
  width.value = rect.width;

  renderer = new MinuteKlineRenderer(canvasRef.value, {
    theme: "dark",
  });
  renderer.setMinuteKlines(props.minuteKlines?.[0], props.fiveMinuteKlines);
};

// 窗口大小变化
const handleResize = () => {
  if (canvasRef.value && renderer) {
    const rect = canvasRef.value.parentElement.getBoundingClientRect();
    width.value = rect.width;
    renderer.resize();
  }
};

// 监听股票切换
watch(
  [() => props.minuteKlines, () => props.fiveMinuteKlines],
  () => {
    renderer.setMinuteKlines(props.minuteKlines?.[0], props.fiveMinuteKlines);
  },
  {
    deep: true, // 因为是数组/对象，必须加 deep
  }
);

// 生命周期
onMounted(() => {
  initCanvas();
  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
  renderer?.destroy();
});
</script>

<style scoped>
.minute-kline-ctrl {
  display: flex;
  flex-direction: column;
  height: 100%;
  outline: none;
  position: relative;
}

/* .minute-info-bar {
    display: flex;
    gap: 20px;
    padding: 8px 12px;
    background: #252525;
    border-radius: 4px;
    margin-bottom: 8px;
    font-size: 12px;
    flex-wrap: wrap;
}

.minute-info-bar .label {
    color: #999;
    margin-right: 4px;
}

.minute-info-bar .value {
    font-weight: bold;
    font-family: monospace;
}

.minute-info-bar .value.up {
    color: #ef5350;
}

.minute-info-bar .value.down {
    color: #26a69a;
} */

canvas {
  flex: 1;
  width: 100%;
  border-radius: 4px;
  cursor: crosshair;
}

.subchart-switch {
  position: absolute;
  right: 10px;
  bottom: 10px;
}

.subchart-switch button {
  background: rgba(0, 0, 0, 0.6);
  border: none;
  color: #fff;
  padding: 2px 8px;
  cursor: pointer;
  border-radius: 3px;
  font-size: 10px;
}

.light .subchart-switch button {
  background: rgba(255, 255, 255, 0.8);
  color: #333;
}
</style>
