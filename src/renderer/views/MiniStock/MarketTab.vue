<template>
    <div class="market-container">
      <el-table 
        :data="marketData" 
        style="width: 100%; height: 100%" 
        :row-class-name="tableRowClassName"
        v-loading="loading"
        stripe
        border
      >
        <el-table-column prop="code" label="代码" width="100" />
        <el-table-column prop="name" label="名称" width="120" />
        <el-table-column prop="changePercent" label="涨幅%" width="100">
          <template #default="{ row }">
            <span :class="getChangeClass(row.changePercent)">
              {{ formatPercent(row.changePercent) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="industry" label="行业板块" width="120" />
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <div class="operation-cell" @mouseenter="hoverRow = row.code" @mouseleave="hoverRow = null">
              <el-button 
                v-if="hoverRow === row.code" 
                :type="isFav(row.code) ? 'danger' : 'primary'"
                :icon="isFav(row.code) ? StarFilled : Star"
                circle
                size="small"
                @click="toggleFavorite(row)"
              />
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </template>
  
  <script setup>
  import { ref, onMounted, onUnmounted } from 'vue';
  import { Star, StarFilled } from '@element-plus/icons-vue';
  import { ElMessage } from 'element-plus';
  import DataSourceAdapter from './services/DataSourceAdapter';
  
  const marketData = ref([]);
  const loading = ref(true);
  const hoverRow = ref(null);
  const favorites = ref(new Set(JSON.parse(localStorage.getItem('favorites') || '[]')));
  
  const formatPercent = (value) => {
    if (value === undefined || value === null) return '0.00%';
    return `${value > 0 ? '+' : ''}${Number(value).toFixed(2)}%`;
  };
  
  const getChangeClass = (value) => {
    if (value > 0) return 'up';
    if (value < 0) return 'down';
    return '';
  };
  
  const isFav = (code) => {
    return favorites.value.has(code);
  };
  
  const toggleFavorite = (stock) => {
    if (favorites.value.has(stock.code)) {
      favorites.value.delete(stock.code);
      ElMessage.success(`已取消收藏 ${stock.name}`);
    } else {
      favorites.value.add(stock.code);
      localStorage.setItem(stock.code, JSON.stringify(stock));
      ElMessage.success(`已收藏 ${stock.name}`);
    }
    localStorage.setItem('favorites', JSON.stringify([...favorites.value]));
  };
  
  const tableRowClassName = ({ row, rowIndex }) => {
    if (rowIndex % 2 === 0) {
      return 'even-row';
    }
    return '';
  };
  
  const fetchMarketData = async () => {
    try {
      loading.value = true;
      const data = await DataSourceAdapter.getMarketTop100();
      marketData.value = data;
      console.log(data);
    } catch (error) {
      console.error('获取市场数据失败:', error);
      ElMessage.error('获取市场数据失败');
    } finally {
      loading.value = false;
    }
  };
  
  // 定时刷新数据
  let timer = null;
  onMounted(() => {
    fetchMarketData();
    timer = setInterval(fetchMarketData, 3000); // 3秒刷新一次
  });
  
  onUnmounted(() => {
    if (timer) {
      clearInterval(timer);
    }
  });
  </script>
  
  <style scoped>
  .market-container {
    height: 100%;
    overflow: hidden;
  }
  
  :deep(.el-table) {
    height: 100%;
  }
  
  :deep(.up) {
    color: #f56c6c;
    font-weight: bold;
  }
  
  :deep(.down) {
    color: #67c23a;
    font-weight: bold;
  }
  
  .operation-cell {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 40px;
  }
  
  :deep(.even-row) {
    background-color: #fafafa;
  }
  </style>