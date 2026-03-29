<template>
  <div class="search-panel" @click.stop>
    <div class="panel-header">
      <h3>搜索股票</h3>
      <button class="close-btn" @click="$emit('close')">×</button>
    </div>

    <div class="search-box">
      <input
        v-model="keyword"
        type="text"
        placeholder="输入股票代码或名称..."
        @input="onSearch"
        @keyup.enter="selectFirst"
        autofocus
      />
    </div>

    <div class="search-results">
      <div
        v-for="stock in searchResults"
        :key="`${stock.market}_${stock.code}`"
        class="stock-item"
        @click="selectStock(stock)"
      >
        <div class="stock-info">
          <span class="stock-code">{{ stock.code }}</span>
          <span class="stock-name">{{ stock.name }}</span>
          <span class="stock-market">{{ getMarketLabel(stock.market) }}</span>
        </div>
        <div class="stock-actions">
          <button
            class="favorite-btn"
            :class="{ favorited: isFavorite(stock) }"
            @click.stop="toggleFavorite(stock)"
          >
            {{ isFavorite(stock) ? "★" : "☆" }}
          </button>
        </div>
      </div>

      <div v-if="searchResults.length === 0 && keyword" class="no-results">
        未找到相关股票
      </div>
    </div>
  </div>
</template>

<script>
import { ref, watch } from "vue";
import DataProviderManager from "@/MiniStock/Providers/DataProviderManager";
import { useStockStore } from "@/stores/StoreStockConfig";

export default {
  name: "SearchPanel",
  emits: ["close", "select-stock"],

  setup(props, { emit }) {
    const keyword = ref("");
    const searchResults = ref([]);
    const stockStore = useStockStore();

    const onSearch = async () => {
      if (!keyword.value.trim()) {
        searchResults.value = [];
        return;
      }

      const results = await DataProviderManager.searchStock(keyword.value);
      searchResults.value = results.slice(0, 20);
    };

    const selectStock = (stock) => {
      emit("select-stock", stock);
    };

    const selectFirst = () => {
      if (searchResults.value.length > 0) {
        selectStock(searchResults.value[0]);
      }
    };

    const isFavorite = (stock) => {
      return stockStore.isFavorite(stock.code);
    };

    const toggleFavorite = (stock) => {
      if (isFavorite(stock)) {
        stockStore.removeFavorite(stock.code);
      } else {
        stockStore.addFavorite(stock);
      }
    };

    const getMarketLabel = (market) => {
      const labels = {
        a: "A股",
        hk: "港股",
        us: "美股",
      };
      return labels[market] || market;
    };

    return {
      keyword,
      searchResults,
      onSearch,
      selectStock,
      selectFirst,
      isFavorite,
      toggleFavorite,
      getMarketLabel,
    };
  },
};
</script>

<style scoped>
.search-panel {
  position: fixed;
  left: 0;
  top: 0;
  width: 320px;
  height: 100%;
  background: #2a2a2a;
  box-shadow: 2px 0 10px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  border-bottom: 1px solid #444;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
}

.close-btn {
  background: none;
  border: none;
  color: #fff;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.close-btn:hover {
  background: #444;
}

.search-box {
  padding: 15px;
}

.search-box input {
  width: 100%;
  padding: 8px 12px;
  background: #333;
  border: 1px solid #444;
  border-radius: 4px;
  color: #fff;
  font-size: 14px;
}

.search-box input:focus {
  outline: none;
  border-color: #ff6b6b;
}

.search-results {
  flex: 1;
  overflow-y: auto;
}

.stock-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 15px;
  cursor: pointer;
  transition: background 0.2s;
}

.stock-item:hover {
  background: #333;
}

.stock-info {
  display: flex;
  gap: 10px;
  align-items: baseline;
}

.stock-code {
  font-family: monospace;
  font-size: 13px;
  color: #ff6b6b;
}

.stock-name {
  font-size: 14px;
}

.stock-market {
  font-size: 11px;
  color: #999;
}

.favorite-btn {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: #666;
  transition: color 0.2s;
}

.favorite-btn:hover {
  color: #ff6b6b;
}

.favorite-btn.favorited {
  color: #ff6b6b;
}

.no-results {
  text-align: center;
  padding: 20px;
  color: #999;
}
</style>
