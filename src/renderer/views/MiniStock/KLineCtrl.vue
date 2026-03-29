<template>
  <div class="kline-ctrl" tabindex="0" @keydown="handleKeyDown">
    <!-- K线类型切换 -->
    <div class="kline-type-bar">
      <button
        v-for="type in klineTypes"
        :key="type.value"
        :class="{ active: currentType === type.value }"
        @click="changeType(type.value)"
      >
        {{ type.label }}
      </button>
    </div>

    <!-- Canvas画布 -->
    <canvas
      ref="canvasRef"
      :width="width"
      :height="height"
      @wheel="handleWheel"
    ></canvas>

    <!-- EMA指标按钮 -->
    <div class="ema-buttons">
      <button
        v-for="period in emaPeriods"
        :key="period"
        :class="{ active: emaVisible[period], disabled: !emaVisible[period] }"
        @click="toggleEMA(period)"
      >
        EMA{{ period }}
      </button>
    </div>

    <!-- 副图切换 -->
    <div class="subchart-switch">
      <button @click="toggleSubChart">
        {{ subChartMode === "volume" ? "成交量" : "成交额" }}
      </button>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted, watch } from "vue";
import KLineRenderer from "../canvas/KLineRenderer";
import DataProviderManager from "../providers/DataProviderManager";
import { useConfigStore } from "../stores/configStore";

export default {
  name: "KLineCtrl",
  props: {
    stockCode: {
      type: String,
      required: true,
    },
    market: {
      type: String,
      default: "a",
    },
    height: {
      type: Number,
      default: 300,
    },
  },

  emits: ["kline-ready"],

  setup(props, { emit }) {
    const canvasRef = ref(null);
    const renderer = ref(null);
    const currentType = ref("day");
    const emaPeriods = [10, 20, 30, 60, 99, 255, 905];
    const emaVisible = ref({});
    const subChartMode = ref("amount"); // amount or volume
    const width = ref(0);
    const klineData = ref([]);
    const updateTimer = ref(null);
    const configStore = useConfigStore();

    const klineTypes = [
      { label: "日K", value: "day" },
      { label: "周K", value: "week" },
      { label: "月K", value: "month" },
      { label: "年K", value: "year" },
      { label: "分时", value: "minute" },
      { label: "5日分时", value: "5minute" },
    ];

    // 初始化EMA可见性
    emaPeriods.forEach((period) => {
      emaVisible.value[period] = true;
    });

    // 加载K线数据
    const loadKLineData = async () => {
      try {
        const endDate = new Date().toISOString().split("T")[0];
        const startDate = getStartDate(currentType.value);

        const data = await DataProviderManager.getKLineData(
          props.stockCode,
          props.market,
          currentType.value,
          startDate,
          endDate
        );

        klineData.value = data;
        if (renderer.value) {
          renderer.value.setData(data);
        }
      } catch (error) {
        console.error("加载K线数据失败:", error);
      }
    };

    // 获取开始日期
    const getStartDate = (type) => {
      const now = new Date();
      switch (type) {
        case "day":
          return new Date(now.setFullYear(now.getFullYear() - 1))
            .toISOString()
            .split("T")[0];
        case "week":
          return new Date(now.setFullYear(now.getFullYear() - 2))
            .toISOString()
            .split("T")[0];
        case "month":
          return new Date(now.setFullYear(now.getFullYear() - 5))
            .toISOString()
            .split("T")[0];
        case "year":
          return new Date(now.setFullYear(now.getFullYear() - 10))
            .toISOString()
            .split("T")[0];
        default:
          return new Date(now.setMonth(now.getMonth() - 1))
            .toISOString()
            .split("T")[0];
      }
    };

    // 加载实时数据
    const loadRealtimeData = async () => {
      if (!isTradingTime()) return;

      try {
        const realtime = await DataProviderManager.getRealtimeData([
          props.stockCode,
        ]);
        if (
          realtime &&
          realtime[props.stockCode] &&
          klineData.value.length > 0
        ) {
          // 更新最后一条K线数据
          const lastCandle = klineData.value[klineData.value.length - 1];
          const rt = realtime[props.stockCode];

          lastCandle.close = rt.price;
          lastCandle.high = Math.max(lastCandle.high, rt.price);
          lastCandle.low = Math.min(lastCandle.low, rt.price);
          lastCandle.volume = rt.volume;
          lastCandle.amount = rt.amount;

          if (renderer.value) {
            renderer.value.render();
          }
        }
      } catch (error) {
        console.error("加载实时数据失败:", error);
      }
    };

    // 判断是否交易时间
    const isTradingTime = () => {
      const now = new Date();
      const day = now.getDay();
      const time = now.getHours() * 100 + now.getMinutes();

      if (day === 0 || day === 6) return false;

      // A股交易时间
      const morningStart = 930,
        morningEnd = 1130;
      const afternoonStart = 1300,
        afternoonEnd = 1500;

      return (
        (time >= morningStart && time < morningEnd) ||
        (time >= afternoonStart && time < afternoonEnd)
      );
    };

    // 切换K线类型
    const changeType = (type) => {
      currentType.value = type;
      loadKLineData();
    };

    // 切换EMA显隐
    const toggleEMA = (period) => {
      emaVisible.value[period] = !emaVisible.value[period];
      if (renderer.value && renderer.value.emaRenderer) {
        renderer.value.emaRenderer.toggleLine(period, emaVisible.value[period]);
        renderer.value.render();
      }
    };

    // 切换副图
    const toggleSubChart = () => {
      subChartMode.value =
        subChartMode.value === "volume" ? "amount" : "volume";
      if (renderer.value && renderer.value.volumeRenderer) {
        renderer.value.volumeRenderer.setDisplayMode(subChartMode.value);
        renderer.value.render();
      }
    };

    // 键盘事件
    const handleKeyDown = (event) => {
      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          if (renderer.value) renderer.value.zoom("in");
          break;
        case "ArrowDown":
          event.preventDefault();
          if (renderer.value) renderer.value.zoom("out");
          break;
        case "ArrowLeft":
          event.preventDefault();
          if (renderer.value) renderer.value.pan("left");
          break;
        case "ArrowRight":
          event.preventDefault();
          if (renderer.value) renderer.value.pan("right");
          break;
      }
    };

    // 鼠标滚轮
    const handleWheel = (event) => {
      event.preventDefault();
      if (event.deltaY < 0) {
        renderer.value?.zoom("in");
      } else {
        renderer.value?.zoom("out");
      }
    };

    // 更新配置
    const updateConfig = (config) => {
      if (renderer.value) {
        Object.assign(renderer.value.config, config);
        renderer.value.render();
      }
    };

    // 初始化Canvas
    const initCanvas = () => {
      if (!canvasRef.value) return;

      const rect = canvasRef.value.parentElement.getBoundingClientRect();
      width.value = rect.width;

      renderer.value = new KLineRenderer(canvasRef.value, {
        theme: configStore.theme,
        colors: {
          ema: configStore.emaColors,
        },
      });

      emit("kline-ready", props.stockCode, {
        updateConfig,
        refresh: loadKLineData,
      });

      loadKLineData();
    };

    // 窗口大小变化
    const handleResize = () => {
      if (canvasRef.value && renderer.value) {
        const rect = canvasRef.value.parentElement.getBoundingClientRect();
        width.value = rect.width;
        canvasRef.value.width = width.value;
        canvasRef.value.height = props.height;
        renderer.value.resize();
      }
    };

    // 启动定时更新
    const startTimer = () => {
      if (updateTimer.value) clearInterval(updateTimer.value);
      updateTimer.value = setInterval(() => {
        loadRealtimeData();
      }, 3000);
    };

    onMounted(() => {
      initCanvas();
      startTimer();
      window.addEventListener("resize", handleResize);

      // 设置canvas焦点
      canvasRef.value?.parentElement?.focus();
    });

    onUnmounted(() => {
      if (updateTimer.value) {
        clearInterval(updateTimer.value);
      }
      window.removeEventListener("resize", handleResize);
    });

    watch(
      () => props.stockCode,
      () => {
        loadKLineData();
      }
    );

    return {
      canvasRef,
      currentType,
      emaPeriods,
      emaVisible,
      subChartMode,
      width,
      klineTypes,
      changeType,
      toggleEMA,
      toggleSubChart,
      handleKeyDown,
      handleWheel,
      updateConfig,
    };
  },
};
</script>

<style scoped>
.kline-ctrl {
  display: flex;
  flex-direction: column;
  height: 100%;
  outline: none;
}

.kline-type-bar {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
  padding: 4px;
  background: #252525;
  border-radius: 4px;
}

.kline-type-bar button {
  background: none;
  border: none;
  color: #999;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 3px;
  font-size: 11px;
  transition: all 0.2s;
}

.kline-type-bar button:hover {
  background: #333;
}

.kline-type-bar button.active {
  background: #ff6b6b;
  color: #fff;
}

canvas {
  flex: 1;
  width: 100%;
  background: #1a1a1a;
  border-radius: 4px;
}

.ema-buttons {
  display: flex;
  gap: 4px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.ema-buttons button {
  background: #252525;
  border: none;
  color: #ff6b6b;
  padding: 2px 6px;
  cursor: pointer;
  border-radius: 3px;
  font-size: 10px;
  transition: all 0.2s;
}

.ema-buttons button:hover {
  background: #333;
}

.ema-buttons button.active {
  background: #ff6b6b;
  color: #fff;
}

.ema-buttons button.disabled {
  opacity: 0.4;
  text-decoration: line-through;
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
  padding: 2px 6px;
  cursor: pointer;
  border-radius: 3px;
  font-size: 10px;
}

.light .subchart-switch button {
  background: rgba(255, 255, 255, 0.8);
  color: #333;
}
</style>
