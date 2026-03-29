<template>
  <div class="mini-stock-window" :class="theme">
    <!-- 自定义标题栏（可拖拽区域） -->
    <div class="title-bar" @mousedown="startDrag">
      <div class="window-controls">
        <button class="control-btn minimize" @click="minimizeWindow">─</button>
        <button class="control-btn maximize" @click="toggleMaximize">□</button>
        <button class="control-btn close" @click="closeWindow">×</button>
      </div>
    </div>

    <!-- 股票容器：多股并列 -->
    <div
      class="stocks-container"
      :style="{ gridTemplateColumns: `repeat(${stockCount}, 1fr)` }"
    >
      <div
        v-for="(stock, index) in displayStocks"
        :key="stock.code"
        class="stock-card"
        :class="{ active: currentStock === stock.code }"
        @click="selectStock(stock.code)"
      >
        <div class="stock-header">
          <span class="stock-name">{{ stock.name }}</span>
          <span class="stock-code">{{ stock.code }}</span>
        </div>

        <div class="stock-price" :class="getPriceClass(stock)">
          {{ formatPrice(stock.price) }}
        </div>

        <div class="stock-change" :class="getPriceClass(stock)">
          {{ formatChange(stock.change) }} ({{
            formatPercent(stock.changePercent)
          }}%)
        </div>

        <!-- K线图组件 -->
        <KLineCtrl
          :ref="`kline_${stock.code}`"
          :stock-code="stock.code"
          :market="stock.market"
          :height="300"
          @kline-ready="onKLineReady"
        />
      </div>
    </div>

    <!-- 搜索面板 -->
    <SearchPanel
      v-if="showSearchPanel"
      @close="closeSearchPanel"
      @select-stock="addStock"
    />

    <!-- 自选股面板 -->
    <FavoritePanel
      v-if="showFavoritePanel"
      @close="closeFavoritePanel"
      @select-stock="selectStock"
      @remove-stock="removeStock"
    />

    <!-- 设置面板 -->
    <SettingsPanel
      v-if="showSettingsPanel"
      @close="closeSettingsPanel"
      @config-changed="onConfigChanged"
    />
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from "vue";
import KLineCtrl from "./KLineCtrl.vue";
import SearchPanel from "./SearchPanel.vue";
import FavoritePanel from "./FavoritePanel.vue";
import SettingsPanel from "./SettingsPanel.vue";
import DataProviderManager from "@/MiniStock/Providers/DataProviderManager";
import { useStockStore } from "@/stores/StoreStock";
import { useConfigStore } from "@/stores/StoreStockConfig";

export default {
  name: "MiniStockWindow",
  components: {
    KLineCtrl,
    SearchPanel,
    FavoritePanel,
    SettingsPanel,
  },

  setup() {
    const stockStore = useStockStore();
    const configStore = useConfigStore();

    const showSearchPanel = ref(false);
    const showFavoritePanel = ref(false);
    const showSettingsPanel = ref(false);
    const currentStock = ref(null);
    const theme = ref("dark");
    const klineRefs = ref({});

    // 显示的股票列表（最多4只）
    const displayStocks = computed(() => {
      return stockStore.displayStocks.slice(0, 4);
    });

    const stockCount = computed(() => displayStocks.value.length);

    // 快捷键监听
    const handleShortcut = (type) => {
      switch (type) {
        case "search":
          showSearchPanel.value = !showSearchPanel.value;
          showFavoritePanel.value = false;
          showSettingsPanel.value = false;
          break;
        case "favorites":
          showFavoritePanel.value = !showFavoritePanel.value;
          showSearchPanel.value = false;
          showSettingsPanel.value = false;
          break;
        case "settings":
          showSettingsPanel.value = !showSettingsPanel.value;
          showSearchPanel.value = false;
          showFavoritePanel.value = false;
          break;
      }
    };

    // 窗口控制
    const startDrag = () => {
      window.channel.startDrag();
    };

    const minimizeWindow = () => {
      window.channel.minimizeWindow();
    };

    const toggleMaximize = () => {
      window.channel.maximizeWindow();
    };

    const closeWindow = () => {
      window.channel.closeWindow();
    };

    // 股票操作
    const selectStock = (code) => {
      currentStock.value = code;
      stockStore.setCurrentStock(code);
    };

    const addStock = (stock) => {
      stockStore.addStock(stock);
      showSearchPanel.value = false;
    };

    const removeStock = (code) => {
      stockStore.removeStock(code);
    };

    // 面板控制
    const closeSearchPanel = () => {
      showSearchPanel.value = false;
    };

    const closeFavoritePanel = () => {
      showFavoritePanel.value = false;
    };

    const closeSettingsPanel = () => {
      showSettingsPanel.value = false;
    };

    // 配置变更
    const onConfigChanged = (key, value) => {
      if (key === "theme") {
        theme.value = value;
      }
      // 更新所有K线图的配置
      Object.values(klineRefs.value).forEach((ref) => {
        if (ref && ref.updateConfig) {
          ref.updateConfig({ [key]: value });
        }
      });
    };

    // K线图就绪
    const onKLineReady = (code, instance) => {
      klineRefs.value[code] = instance;
    };

    // 格式化函数
    const formatPrice = (price) => {
      return price ? price.toFixed(2) : "--";
    };

    const formatChange = (change) => {
      if (change === undefined) return "--";
      return change > 0 ? `+${change.toFixed(2)}` : change.toFixed(2);
    };

    const formatPercent = (percent) => {
      if (percent === undefined) return "--";
      return percent > 0 ? `+${percent.toFixed(2)}` : percent.toFixed(2);
    };

    const getPriceClass = (stock) => {
      if (!stock.change) return "";
      return stock.change > 0 ? "up" : stock.change < 0 ? "down" : "";
    };

    // 加载配置
    const loadConfig = async () => {
      const savedTheme = await window.channel.getConfig("settings.theme");
      theme.value = savedTheme || "dark";
    };

    // 快捷键监听
    onMounted(() => {
      loadConfig();

      if (window.channel.onShortcut) {
        window.channel.onShortcut(handleShortcut);
      }

      // 监听Esc关闭面板
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          showSearchPanel.value = false;
          showFavoritePanel.value = false;
          showSettingsPanel.value = false;
        }
      });
    });

    onUnmounted(() => {
      // 清理
    });

    return {
      displayStocks,
      stockCount,
      currentStock,
      theme,
      showSearchPanel,
      showFavoritePanel,
      showSettingsPanel,
      startDrag,
      minimizeWindow,
      toggleMaximize,
      closeWindow,
      selectStock,
      addStock,
      removeStock,
      closeSearchPanel,
      closeFavoritePanel,
      closeSettingsPanel,
      onConfigChanged,
      onKLineReady,
      formatPrice,
      formatChange,
      formatPercent,
      getPriceClass,
    };
  },
};
</script>

<style scoped>
/* 深色主题变量 */
[data-theme="dark"] {
  --bg-primary: #1a1a1a;
  --bg-secondary: #2a2a2a;
  --text-primary: #ffffff;
  --text-secondary: #999999;
  --border-color: #444444;
  --up-color: #ef5350;
  --down-color: #26a69a;
}

/* 浅色主题变量 */
[data-theme="light"] {
  --bg-primary: #f5f5f5;
  --bg-secondary: #ffffff;
  --text-primary: #333333;
  --text-secondary: #666666;
  --border-color: #dddddd;
  --up-color: #ef5350;
  --down-color: #26a69a;
}

/* 全局滚动条样式 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--bg-secondary);
}

::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}
.mini-stock-window {
  width: 100%;
  height: 100%;
  background-color: #1a1a1a;
  color: #ffffff;
  overflow: hidden;
  user-select: none;
}

.mini-stock-window.light {
  background-color: #f5f5f5;
  color: #333333;
}

.title-bar {
  height: 32px;
  background-color: rgba(0, 0, 0, 0.3);
  -webkit-app-region: drag;
  position: relative;
}

.window-controls {
  position: absolute;
  right: 10px;
  top: 0;
  height: 100%;
  display: flex;
  gap: 8px;
  -webkit-app-region: no-drag;
}

.control-btn {
  background: none;
  border: none;
  color: #ffffff;
  font-size: 16px;
  cursor: pointer;
  padding: 0 8px;
  transition: background 0.2s;
}

.control-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.control-btn.close:hover {
  background-color: #e81123;
}

.stocks-container {
  display: grid;
  height: calc(100% - 32px);
  gap: 1px;
  background-color: #333;
}

.stock-card {
  background-color: #1a1a1a;
  padding: 10px;
  overflow: auto;
  cursor: pointer;
  transition: background 0.2s;
}

.light .stock-card {
  background-color: #ffffff;
}

.stock-card:hover {
  background-color: #252525;
}

.light .stock-card:hover {
  background-color: #f0f0f0;
}

.stock-card.active {
  background-color: #2a2a2a;
  border-left: 3px solid #ff6b6b;
}

.stock-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px;
  color: #999;
}

.stock-name {
  font-weight: bold;
}

.stock-price {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 4px;
}

.stock-change {
  font-size: 14px;
  margin-bottom: 12px;
}

.up {
  color: #ef5350;
}

.down {
  color: #26a69a;
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #2a2a2a;
}

::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #777;
}
</style>
