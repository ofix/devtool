<template>
    <div class="kline-chart" ref="chartContainer">
      <div class="main-chart" ref="mainChart"></div>
      <div class="sub-chart" ref="subChart"></div>
    </div>
  </template>
  
  <script setup>
  import { ref, onMounted, watch, nextTick } from 'vue';
  import * as echarts from 'echarts';
  import DataSourceAdapter from './services/DataSourceAdapter';
  
  const props = defineProps({
    stockCode: {
      type: String,
      default: null
    },
    period: {
      type: String,
      default: '日'
    },
    showMA: {
      type: Boolean,
      default: true
    }
  });
  
  const emit = defineEmits(['data-loaded']);
  
  const chartContainer = ref(null);
  const mainChart = ref(null);
  const subChart = ref(null);
  let mainInstance = null;
  let subInstance = null;
  
  // 加载数据
  const loadData = async () => {
    if (!props.stockCode) return;
  
    try {
      const periodMap = {
        '分时': '1m',
        '5日': '5m',
        '日': 'day',
        '周': 'week',
        '月': 'month',
        '年': 'year'
      };
  
      const data = await DataSourceAdapter.getKLineData(
        props.stockCode, 
        periodMap[props.period] || 'day'
      );
  
      if (data && data.length > 0) {
        renderCharts(data);
        emit('data-loaded', data);
      }
    } catch (error) {
      console.error('加载K线数据失败:', error);
    }
  };
  
  // 渲染图表
  const renderCharts = (data) => {
    if (!mainInstance) {
      mainInstance = echarts.init(mainChart.value);
    }
    if (!subInstance) {
      subInstance = echarts.init(subChart.value);
    }
  
    // 准备数据
    const times = data.map(item => item.time);
    const opens = data.map(item => item.open);
    const closes = data.map(item => item.close);
    const highs = data.map(item => item.high);
    const lows = data.map(item => item.low);
    const volumes = data.map(item => item.volume);
    const turnovers = data.map(item => item.turnover / 10000); // 转换为万元
  
    // 计算均线
    const ma99 = calculateMA(99, closes);
    const ma255 = calculateMA(255, closes);
  
    // 主图配置
    const mainOption = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' }
      },
      grid: {
        left: '10%',
        right: '8%',
        bottom: '5%',
        top: '10%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: times,
        scale: true,
        boundaryGap: false,
        axisLine: { onZero: false },
        splitLine: { show: false },
        splitNumber: 20,
        min: 'dataMin',
        max: 'dataMax'
      },
      yAxis: {
        scale: true,
        splitArea: { show: true }
      },
      dataZoom: [
        { type: 'inside', start: 50, end: 100 },
        { type: 'slider', start: 50, end: 100 }
      ],
      series: [
        {
          name: 'K线',
          type: 'candlestick',
          data: data.map(item => [item.open, item.close, item.low, item.high]),
          itemStyle: {
            color: '#f56c6c',
            color0: '#67c23a',
            borderColor: '#f56c6c',
            borderColor0: '#67c23a'
          }
        }
      ]
    };
  
    // 添加均线
    if (props.showMA) {
      mainOption.series.push(
        {
          name: 'MA99',
          type: 'line',
          data: ma99,
          smooth: true,
          lineStyle: { color: '#409eff', width: 1 },
          showSymbol: false
        },
        {
          name: 'MA255',
          type: 'line',
          data: ma255,
          smooth: true,
          lineStyle: { color: '#e6a23c', width: 1 },
          showSymbol: false
        }
      );
    }
  
    // 副图配置（成交量）
    const subOption = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' }
      },
      grid: {
        left: '10%',
        right: '8%',
        bottom: '5%',
        top: '5%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: times,
        scale: true,
        boundaryGap: false,
        axisLine: { onZero: false },
        splitLine: { show: false }
      },
      yAxis: {
        scale: true,
        splitArea: { show: true }
      },
      dataZoom: [
        { type: 'inside', start: 50, end: 100 },
        { type: 'slider', start: 50, end: 100 }
      ],
      series: [
        {
          name: '成交量',
          type: 'bar',
          data: volumes,
          itemStyle: {
            color: (params) => {
              const index = params.dataIndex;
              return closes[index] >= opens[index] ? '#f56c6c' : '#67c23a';
            }
          }
        },
        {
          name: '成交额',
          type: 'line',
          data: turnovers,
          yAxisIndex: 1,
          lineStyle: { color: '#409eff', width: 1 },
          showSymbol: false
        }
      ]
    };
  
    mainInstance.setOption(mainOption);
    subInstance.setOption(subOption);
  };
  
  // 计算移动平均线
  const calculateMA = (dayCount, data) => {
    const result = [];
    for (let i = 0; i < data.length; i++) {
      if (i < dayCount - 1) {
        result.push('-');
        continue;
      }
      let sum = 0;
      for (let j = 0; j < dayCount; j++) {
        sum += data[i - j];
      }
      result.push((sum / dayCount).toFixed(2));
    }
    return result;
  };
  
  // 更新均线显示
  const updateMA = (show) => {
    if (mainInstance) {
      loadData(); // 重新加载数据并渲染
    }
  };
  
  // 处理键盘缩放
  const handleZoom = (direction) => {
    if (mainInstance) {
      const option = mainInstance.getOption();
      const dataZoom = option.dataZoom[0];
      let start = dataZoom.start;
      let end = dataZoom.end;
      
      if (direction === 'in') {
        start = Math.min(start + 5, end - 10);
      } else {
        start = Math.max(start - 5, 0);
      }
      
      mainInstance.setOption({
        dataZoom: [{ start, end }]
      });
      
      if (subInstance) {
        subInstance.setOption({
          dataZoom: [{ start, end }]
        });
      }
    }
  };
  
  // 监听属性变化
  watch(() => props.stockCode, () => {
    loadData();
  });
  
  watch(() => props.period, () => {
    loadData();
  });
  
  watch(() => props.showMA, (newVal) => {
    updateMA(newVal);
  });
  
  onMounted(() => {
    loadData();
  });
  
  // 暴露方法
  defineExpose({
    loadData,
    updateMA,
    handleZoom
  });
  </script>
  
  <style scoped>
  .kline-chart {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: white;
  }
  
  .main-chart {
    flex: 3;
    width: 100%;
    min-height: 0;
  }
  
  .sub-chart {
    flex: 1;
    width: 100%;
    min-height: 0;
    border-top: 1px solid #ebeef5;
  }
  </style>