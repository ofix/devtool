<template>
    <el-config-provider :locale="zhCn">
      <div class="app-container">
        <el-tabs v-model="activeTab" type="border-card" class="main-tabs">
          <el-tab-pane label="市场行情" name="market">
            <market-tab ref="marketTab" />
          </el-tab-pane>
          <el-tab-pane label="股票实时行情" name="stock">
            <stock-tab ref="stockTab" />
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-config-provider>
  </template>
  
  <script setup>
  import { ref, onMounted, onUnmounted } from 'vue';
  import { ElConfigProvider } from 'element-plus';
  import zhCn from 'element-plus/dist/locale/zh-cn.mjs';
  import MarketTab from './MarketTab.vue';
  import StockTab from './StockTab.vue';
  import { setupKeyboardListener } from './keyboard';
  
  const activeTab = ref('market');
  const marketTab = ref(null);
  const stockTab = ref(null);
  
  // 设置键盘监听
  onMounted(() => {
    setupKeyboardListener({
      onCtrl0: () => {
        // 老板键由主进程处理，这里不需要额外处理
      },
      onC: () => {
        if (activeTab.value === 'stock' && stockTab.value) {
          stockTab.value.toggleConceptPanel();
        }
      },
      onSpace: () => {
        if (activeTab.value === 'stock' && stockTab.value) {
          stockTab.value.toggleMA();
        }
      },
      onArrowUp: (e) => {
        if (activeTab.value === 'stock' && stockTab.value) {
          e.preventDefault();
          stockTab.value.handleArrowUp();
        }
      },
      onArrowDown: (e) => {
        if (activeTab.value === 'stock' && stockTab.value) {
          e.preventDefault();
          stockTab.value.handleArrowDown();
        }
      },
      onEnter: (e) => {
        if (activeTab.value === 'stock' && stockTab.value) {
          e.preventDefault();
          stockTab.value.handleEnter();
        }
      }
    });
  });
  </script>
  
  <style>
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  html, body, #app {
    height: 100%;
    overflow: hidden;
  }
  
  .app-container {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background-color: #f5f7fa;
  }
  
  .main-tabs {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  
  .main-tabs :deep(.el-tabs__content) {
    flex: 1;
    overflow: auto;
    padding: 0;
  }
  
  .main-tabs :deep(.el-tab-pane) {
    height: 100%;
  }
  </style>