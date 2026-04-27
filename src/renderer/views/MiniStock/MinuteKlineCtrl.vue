<template>
    <div class="minute-kline-ctrl" tabindex="0">
      <!-- 分时图类型切换 -->
      <div class="chart-type-bar">
        <button
          v-for="type in chartTypes"
          :key="type.value"
          :class="{ active: currentType === type.value }"
          @click="changeType(type.value)"
        >
          {{ type.label }}
        </button>
      </div>
  
      <!-- 分时图信息栏 -->
      <div class="minute-info-bar">
        <div class="current-price">
          <span class="label">最新价</span>
          <span class="value" :class="getPriceClass(currentPrice)">
            {{ formatPrice(currentPrice) }}
          </span>
        </div>
        <div class="change-info">
          <span class="label">涨跌</span>
          <span class="value" :class="getPriceClass(change)">
            {{ formatChange(change) }}
          </span>
        </div>
        <div class="percent-info">
          <span class="label">涨幅</span>
          <span class="value" :class="getPriceClass(changePercent)">
            {{ formatPercent(changePercent) }}%
          </span>
        </div>
        <div class="volume-info">
          <span class="label">成交量</span>
          <span class="value">{{ formatVolume(volume) }}</span>
        </div>
        <div class="amount-info">
          <span class="label">成交额</span>
          <span class="value">{{ formatAmount(amount) }}</span>
        </div>
      </div>
  
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
      <div class="subchart-switch">
        <button @click="toggleSubChart">
          {{ subChartMode === 'volume' ? '成交量' : 'MACD' }}
        </button>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref, onMounted, onUnmounted, watch } from 'vue';
  import MinuteKlineRenderer from './Components/MinuteKlineRenderer';
  
  const props = defineProps({
    stockCode: {
      type: String,
      required: true
    },
    market: {
      type: String,
      default: 'a'
    },
    height: {
      type: Number,
      default: 300
    }
  });
  
  const emit = defineEmits(['minute-ready']);
  
  // Refs
  const canvasRef = ref(null);
  let renderer = null;
  
  // 状态
  const currentType = ref('minute');
  const chartTypes = [
    { label: '分时', value: 'minute' },
    { label: '5日分时', value: '5day' }
  ];
  
  const subChartMode = ref('volume');
  const width = ref(0);
  const height = ref(props.height);
  
  // 实时数据
  const currentPrice = ref(0);
  const change = ref(0);
  const changePercent = ref(0);
  const volume = ref(0);
  const amount = ref(0);
  
  // 格式化函数
  const formatPrice = (price) => {
    if (price === undefined || price === null) return '--';
    return price.toFixed(2);
  };
  
  const formatChange = (change) => {
    if (change === undefined || change === null) return '--';
    return change > 0 ? `+${change.toFixed(2)}` : change.toFixed(2);
  };
  
  const formatPercent = (percent) => {
    if (percent === undefined || percent === null) return '--';
    return percent > 0 ? `+${percent.toFixed(2)}` : percent.toFixed(2);
  };
  
  const formatVolume = (vol) => {
    if (vol === undefined || vol === null) return '--';
    if (vol >= 100000000) return (vol / 100000000).toFixed(2) + '亿';
    if (vol >= 10000) return (vol / 10000).toFixed(2) + '万';
    return vol.toString();
  };
  
  const formatAmount = (amt) => {
    if (amt === undefined || amt === null) return '--';
    if (amt >= 100000000) return (amt / 100000000).toFixed(2) + '亿';
    if (amt >= 10000) return (amt / 10000).toFixed(2) + '万';
    return amt.toString();
  };
  
  const getPriceClass = (value) => {
    if (value === undefined || value === null || value === 0) return '';
    return value > 0 ? 'up' : 'down';
  };
  
  // 加载分时数据
  const loadMinuteData = async () => {
    try {
      const data = await window.channel.getMinuteKlineData(
        props.stockCode,
        props.market,
        currentType.value
      );
  
      if (data && data.length > 0) {
        renderer?.setData(data);
        
        // 更新信息栏
        const lastItem = data[data.length - 1];
        const preClose = data[0].preClose || data[0].price;
        currentPrice.value = lastItem.price;
        volume.value = lastItem.volume;
        amount.value = lastItem.amount;
        change.value = currentPrice.value - preClose;
        changePercent.value = (change.value / preClose) * 100;
      }
    } catch (error) {
      console.error('加载分时数据失败:', error);
    }
  };
  
  // 切换图表类型
  const changeType = (type) => {
    currentType.value = type;
    loadMinuteData();
  };
  
  // 切换副图
  const toggleSubChart = () => {
    subChartMode.value = subChartMode.value === 'volume' ? 'macd' : 'volume';
    renderer?.setSubChartMode(subChartMode.value);
  };
  
  // 鼠标移动事件
  const handleMouseMove = (e) => {
    if (!renderer) return;
    
    const rect = canvasRef.value.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // 计算数据索引
    const step = (width.value - renderer.chartLeft - renderer.chartRight) / (renderer.data.length - 1);
    const index = Math.round((mouseX - renderer.chartLeft) / step);
    
    if (index >= 0 && index < renderer.data.length) {
      renderer.setCrosshair(mouseX, mouseY, index);
    }
  };
  
  // 鼠标离开事件
  const handleMouseLeave = () => {
    renderer?.hideCrosshair();
  };
  
  // 鼠标滚轮
  const handleWheel = (e) => {
    e.preventDefault();
    // 缩放功能（可选）
  };
  
  // 初始化Canvas
  const initCanvas = () => {
    if (!canvasRef.value) return;
  
    const rect = canvasRef.value.parentElement.getBoundingClientRect();
    width.value = rect.width;
  
    renderer = new MinuteKlineRenderer(canvasRef.value, {
      theme: 'dark'
    });
  
    emit('minute-ready', props.stockCode, {
      refresh: loadMinuteData
    });
  
    loadMinuteData();
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
  watch(() => props.stockCode, () => {
    loadMinuteData();
  });
  
  // 生命周期
  onMounted(() => {
    initCanvas();
    window.addEventListener('resize', handleResize);
  });
  
  onUnmounted(() => {
    window.removeEventListener('resize', handleResize);
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
  
  .chart-type-bar {
    display: flex;
    gap: 4px;
    margin-bottom: 8px;
    padding: 4px;
    background: #252525;
    border-radius: 4px;
  }
  
  .chart-type-bar button {
    background: none;
    border: none;
    color: #999;
    padding: 4px 12px;
    cursor: pointer;
    border-radius: 3px;
    font-size: 12px;
    transition: all 0.2s;
  }
  
  .chart-type-bar button:hover {
    background: #333;
  }
  
  .chart-type-bar button.active {
    background: #ff6b6b;
    color: #fff;
  }
  
  .minute-info-bar {
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
  }
  
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