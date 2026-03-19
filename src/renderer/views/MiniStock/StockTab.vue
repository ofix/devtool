<template>
    <div class="stock-container">
      <div class="left-panel">
        <div class="search-box">
          <el-input
            v-model="searchKeyword"
            placeholder="搜索股票 (代码/名称/拼音)"
            :prefix-icon="Search"
            clearable
            @input="handleSearch"
            @keydown.up.prevent="moveSelection(-1)"
            @keydown.down.prevent="moveSelection(1)"
            @keydown.enter.prevent="addSelectedToFav"
          />
        </div>
        
        <div class="search-results" v-if="searchResults.length > 0 && searchKeyword">
          <div
            v-for="(item, index) in searchResults"
            :key="item.code"
            class="search-item"
            :class="{ active: selectedIndex === index }"
            @click="selectSearchItem(index)"
            @dblclick="addToFavorites(item)"
          >
            <span class="code">{{ item.code }}</span>
            <span class="name">{{ item.name }}</span>
            <span class="type">{{ item.type }}</span>
          </div>
        </div>
  
        <div class="favorites-list">
          <div
            v-for="stock in favorites"
            :key="stock.code"
            class="favorite-item"
            :class="{ active: selectedStock?.code === stock.code }"
            @click="selectStock(stock)"
          >
            <div class="stock-info">
              <span class="code">{{ stock.code }}</span>
              <span class="name">{{ stock.name }}</span>
            </div>
            <div class="stock-price" :class="getChangeClass(stock.changePercent)">
              {{ formatPercent(stock.changePercent) }}
            </div>
          </div>
        </div>
      </div>
  
      <div class="right-panel">
        <div class="chart-header">
          <div class="period-tabs">
            <el-radio-group v-model="selectedPeriod" size="small" @change="handlePeriodChange">
              <el-radio-button label="分时">分时</el-radio-button>
              <el-radio-button label="5日">5日</el-radio-button>
              <el-radio-button label="日">日</el-radio-button>
              <el-radio-button label="周">周</el-radio-button>
              <el-radio-button label="月">月</el-radio-button>
              <el-radio-button label="年">年</el-radio-button>
            </el-radio-group>
          </div>
        </div>
  
        <div class="chart-container">
          <KLineChart
            ref="chartRef"
            :stock-code="selectedStock?.code"
            :period="selectedPeriod"
            :show-ma="showMA"
            @data-loaded="handleChartDataLoaded"
          />
        </div>
      </div>
  
      <ConceptPanel
        v-if="showConcept"
        :stock-code="selectedStock?.code"
        :stock-name="selectedStock?.name"
        @close="showConcept = false"
      />
    </div>
  </template>
  
  <script setup>
  import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
  import { Search } from '@element-plus/icons-vue';
  import { ElMessage } from 'element-plus';
  import KLineChart from './KLineChart.vue';
  import ConceptPanel from './ConceptPanel.vue';
  import DataSourceAdapter from './services/DataSourceAdapter';
  
  // 状态
  const searchKeyword = ref('');
  const searchResults = ref([]);
  const selectedIndex = ref(-1);
  const favorites = ref([]);
  const selectedStock = ref(null);
  const selectedPeriod = ref('日');
  const showMA = ref(true);
  const showConcept = ref(false);
  const chartRef = ref(null);
  
  // 加载自选列表
  const loadFavorites = async () => {
    const codes = JSON.parse(localStorage.getItem('favorites') || '[]');
    if (codes.length > 0) {
      const stocks = await DataSourceAdapter.getBatchStockRealTime(codes);
      favorites.value = stocks.map(stock => ({
        ...stock,
        changePercent: stock.changePercent || 0
      }));
      
      if (!selectedStock.value && stocks.length > 0) {
        selectedStock.value = stocks[0];
      }
    } else {
      favorites.value = [];
    }
  };
  
  // 搜索股票
  const handleSearch = async () => {
    if (!searchKeyword.value) {
      searchResults.value = [];
      return;
    }
    
    const results = await DataSourceAdapter.searchStocks(searchKeyword.value);
    searchResults.value = results;
    selectedIndex.value = results.length > 0 ? 0 : -1;
  };
  
  // 移动选择
  const moveSelection = (delta) => {
    if (searchResults.value.length === 0) return;
    
    const newIndex = selectedIndex.value + delta;
    if (newIndex >= 0 && newIndex < searchResults.value.length) {
      selectedIndex.value = newIndex;
    }
  };
  
  // 添加选中的股票到自选
  const addSelectedToFav = async () => {
    if (selectedIndex.value >= 0 && searchResults.value[selectedIndex.value]) {
      await addToFavorites(searchResults.value[selectedIndex.value]);
    }
  };
  
  // 添加到自选
  const addToFavorites = async (stock) => {
    const codes = JSON.parse(localStorage.getItem('favorites') || '[]');
    if (!codes.includes(stock.code)) {
      codes.push(stock.code);
      localStorage.setItem('favorites', JSON.stringify(codes));
      await loadFavorites();
      ElMessage.success(`已添加 ${stock.name} 到自选`);
    } else {
      ElMessage.info('股票已在自选列表中');
    }
    
    searchKeyword.value = '';
    searchResults.value = [];
  };
  
  // 选择搜索项
  const selectSearchItem = (index) => {
    selectedIndex.value = index;
  };
  
  // 选择股票
  const selectStock = (stock) => {
    selectedStock.value = stock;
  };
  
  // 格式化涨幅
  const formatPercent = (value) => {
    if (value === undefined || value === null) return '0.00%';
    return `${value > 0 ? '+' : ''}${Number(value).toFixed(2)}%`;
  };
  
  // 获取涨跌样式
  const getChangeClass = (value) => {
    if (value > 0) return 'up';
    if (value < 0) return 'down';
    return '';
  };
  
  // 切换概念面板
  const toggleConceptPanel = () => {
    if (selectedStock.value) {
      showConcept.value = !showConcept.value;
    }
  };
  
  // 切换均线
  const toggleMA = () => {
    showMA.value = !showMA.value;
    if (chartRef.value) {
      chartRef.value.updateMA(showMA.value);
    }
  };
  
  // 处理键盘事件
  const handleArrowUp = () => {
    if (favorites.value.length > 0) {
      const currentIndex = favorites.value.findIndex(s => s.code === selectedStock.value?.code);
      if (currentIndex > 0) {
        selectedStock.value = favorites.value[currentIndex - 1];
      }
    }
  };
  
  const handleArrowDown = () => {
    if (favorites.value.length > 0) {
      const currentIndex = favorites.value.findIndex(s => s.code === selectedStock.value?.code);
      if (currentIndex < favorites.value.length - 1) {
        selectedStock.value = favorites.value[currentIndex + 1];
      }
    }
  };
  
  const handleEnter = () => {
    // 已经在添加自选中处理
  };
  
  // 处理周期切换
  const handlePeriodChange = () => {
    if (chartRef.value) {
      chartRef.value.loadData();
    }
  };
  
  // 处理图表数据加载
  const handleChartDataLoaded = () => {
    // 可以在这里处理图表加载后的逻辑
  };
  
  // 定时刷新自选数据
  let timer = null;
  onMounted(() => {
    loadFavorites();
    timer = setInterval(loadFavorites, 1000); // 1秒刷新一次
  });
  
  onUnmounted(() => {
    if (timer) {
      clearInterval(timer);
    }
  });
  
  // 暴露方法给父组件
  defineExpose({
    toggleConceptPanel,
    toggleMA,
    handleArrowUp,
    handleArrowDown,
    handleEnter
  });
  </script>
  
  <style scoped>
  .stock-container {
    height: 100%;
    display: flex;
    overflow: hidden;
  }
  
  .left-panel {
    width: 300px;
    border-right: 1px solid #dcdfe6;
    display: flex;
    flex-direction: column;
    background-color: white;
  }
  
  .search-box {
    padding: 10px;
    border-bottom: 1px solid #ebeef5;
  }
  
  .search-results {
    max-height: 300px;
    overflow-y: auto;
    border-bottom: 1px solid #ebeef5;
    background-color: white;
    z-index: 10;
  }
  
  .search-item {
    padding: 8px 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    border-bottom: 1px solid #f0f0f0;
  }
  
  .search-item:hover,
  .search-item.active {
    background-color: #ecf5ff;
  }
  
  .search-item .code {
    width: 80px;
    font-family: monospace;
  }
  
  .search-item .name {
    flex: 1;
    margin-left: 8px;
  }
  
  .search-item .type {
    width: 40px;
    color: #909399;
    font-size: 12px;
  }
  
  .favorites-list {
    flex: 1;
    overflow-y: auto;
  }
  
  .favorite-item {
    padding: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #ebeef5;
    cursor: pointer;
  }
  
  .favorite-item:hover {
    background-color: #f5f7fa;
  }
  
  .favorite-item.active {
    background-color: #ecf5ff;
    border-left: 3px solid #409eff;
  }
  
  .stock-info {
    display: flex;
    flex-direction: column;
  }
  
  .stock-info .code {
    font-size: 12px;
    color: #909399;
  }
  
  .stock-info .name {
    font-size: 14px;
    font-weight: 500;
    margin-top: 4px;
  }
  
  .stock-price {
    font-size: 16px;
    font-weight: bold;
  }
  
  .stock-price.up {
    color: #f56c6c;
  }
  
  .stock-price.down {
    color: #67c23a;
  }
  
  .right-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  
  .chart-header {
    padding: 10px;
    border-bottom: 1px solid #ebeef5;
    background-color: white;
  }
  
  .chart-container {
    flex: 1;
    overflow: hidden;
  }
  </style>