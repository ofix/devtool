<template>
    <div class="minute-kline-ctrl" tabindex="0">  
      <!-- 分时图信息栏 -->
      <div class="minute-info-bar">
        <div class="share-name"> <!-- 股票名称 股票代码 -->
            {{props.share.name}} ({{ props.share.code }})
        </div>
        <div class="current-price"> <!-- 股票当前价格 -->
          <span class="value" :class="getPriceClass(currentPrice)">
            {{ formatPrice(currentPrice) }}
          </span>
        </div>
        <div class="price-info"> <!-- 股票涨幅 -->
          <span class="value" :class="getPriceClass(changePercent)">
            {{ formatPercent(changePercent) }}%
          </span>
        </div>
        <div class="price-info"> <!-- 股票最高价 -->
          <span class="value" :class="getPriceClass(changePercent)">
            {{ formatPrice(maxPrice) }}
          </span>
        </div>
        <div class="price-info"> <!-- 股票最低价 -->
          <span class="value" :class="getPriceClass(changePercent)">
            {{ formatPrice(minPrice) }}
          </span>
        </div>
        <div class="button"> <!-- 股票最低价 -->
          <el-button>参考价</el-button>
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
    share:{
        type: Object,
        required:true,
    },
    data:{
        type: Object,
        required: true,
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
  const maxPrice = ref(0);
  const minPrice = ref(10000);
  const volume = ref(0);
  const amount = ref(0);
  
  // 格式化函数
  const formatPrice = (price) => {
    if (price === undefined || price === null) return '--';
    return price.toFixed(2);
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
    renderer.setData(props.data);  
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
  watch(() => props.data, () => {
    renderer.setData(props.data);
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