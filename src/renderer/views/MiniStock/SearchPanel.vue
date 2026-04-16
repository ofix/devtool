<template>
    <div class="search-panel" @click.stop>
      <div class="panel-header">
        <h3>搜索股票</h3>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>
  
      <div class="search-box">
        <input
          ref="searchInput"
          v-model="keyword"
          type="text"
          placeholder="输入股票代码或名称..."
          @input="onSearch"
          @keyup.enter="selectCurrent"
          @keyup.down="nextResult"
          @keyup.up="prevResult"
          autofocus
        />
      </div>
  
      <div class="search-results" v-if="!loading">
        <div
          v-for="(stock, index) in searchResults"
          :key="`${stock.market}_${stock.code}`"
          class="stock-item"
          :class="{ active: currentIndex === index }"
          @click="selectStock(stock)"
          @mouseenter="currentIndex = index"
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
  
        <div v-if="searchResults.length === 0 && keyword && !loading" class="no-results">
          未找到相关股票
        </div>
      </div>
  
      <div v-if="loading" class="loading">
        <div class="spinner"></div>
        <span>搜索中...</span>
      </div>
  
      <div class="panel-footer" v-if="hasResults">
        <span>共 {{ resultCount }} 条结果</span>
        <span class="shortcut-hint">↑↓ 选择 | Enter 确认</span>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref, watch, computed, nextTick } from "vue";
  import { useStockStore } from "@/stores/StoreStock";
  import { storeToRefs } from "pinia";
  
  // Emits
  const emit = defineEmits(["close", "select-stock"]);
  
  // Stores
  const stockStore = useStockStore();
  const { addFavorite, removeFavorite, isFavorite: checkIsFavorite } = stockStore;
  
  // Reactive state
  const keyword = ref("");
  const searchResults = ref([]);
  const loading = ref(false);
  const currentIndex = ref(-1);
  const searchInput = ref(null);
  
  // Computed
  const hasResults = computed(() => searchResults.value.length > 0);
  const resultCount = computed(() => searchResults.value.length);
  
  // Methods
  const onSearch = async () => {
    const trimmedKeyword = keyword.value.trim();
    
    if (!trimmedKeyword) {
      searchResults.value = [];
      currentIndex.value = -1;
      return;
    }
  
    loading.value = true;
    
    try {
      const results = await window.channel.searchStock(trimmedKeyword);
      searchResults.value = results.slice(0, 20);
      currentIndex.value = searchResults.value.length > 0 ? 0 : -1;
    } catch (error) {
      console.error("搜索失败:", error);
      searchResults.value = [];
      currentIndex.value = -1;
    } finally {
      loading.value = false;
    }
  };
  
  const selectStock = (stock) => {
    emit("select-stock", stock);
  };
  
  const selectCurrent = () => {
    if (currentIndex.value >= 0 && searchResults.value[currentIndex.value]) {
      selectStock(searchResults.value[currentIndex.value]);
    } else if (searchResults.value.length > 0) {
      selectStock(searchResults.value[0]);
    }
  };
  
  const nextResult = () => {
    if (currentIndex.value < searchResults.value.length - 1) {
      currentIndex.value++;
      scrollToCurrent();
    }
  };
  
  const prevResult = () => {
    if (currentIndex.value > 0) {
      currentIndex.value--;
      scrollToCurrent();
    }
  };
  
  const scrollToCurrent = () => {
    nextTick(() => {
      const activeElement = document.querySelector('.stock-item.active');
      if (activeElement) {
        activeElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  };
  
  const isFavorite = (stock) => {
    return checkIsFavorite(stock.code);
  };
  
  const toggleFavorite = (stock) => {
    if (isFavorite(stock)) {
      removeFavorite(stock.code);
    } else {
      addFavorite(stock);
    }
  };
  
  const getMarketLabel = (market) => {
    const labels = {
      a: "A股",
      hk: "港股",
      us: "美股",
      sh: "沪市",
      sz: "深市",
      bj: "北交所",
    };
    return labels[market] || market;
  };
  
  // Debounced search
  let searchTimeout;
  watch(keyword, () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      onSearch();
    }, 300);
  });
  
  // Reset current index when results change
  watch(searchResults, () => {
    currentIndex.value = searchResults.value.length > 0 ? 0 : -1;
  });
  
  // Focus input on mount
  import { onMounted } from "vue";
  onMounted(() => {
    searchInput.value?.focus();
  });
  </script>
  
  <style scoped>
  /* 样式与之前相同，增加以下样式 */
  
  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;
    gap: 12px;
    color: #999;
  }
  
  .spinner {
    width: 30px;
    height: 30px;
    border: 3px solid #444;
    border-top-color: #ff6b6b;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  
  .panel-footer {
    padding: 10px 15px;
    border-top: 1px solid #444;
    font-size: 11px;
    color: #666;
    display: flex;
    justify-content: space-between;
  }
  
  .shortcut-hint {
    font-family: monospace;
  }
  
  .stock-item.active {
    background: #3a3a3a;
    border-left: 3px solid #ff6b6b;
  }
  
  .stock-item.active .stock-code {
    color: #ff8c8c;
  }
  </style>