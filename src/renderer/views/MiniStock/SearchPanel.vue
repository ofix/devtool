<template>
  <div class="search-overlay" @click.self="$emit('close')">
    <div class="search-panel" @click.stop>
      <!-- 搜索框：固定置顶 -->
      <div class="search-box">
        <input
          ref="searchInput"
          v-model="keyword"
          type="text"
          placeholder="代码/名称/拼音/*"
          @input="onSearch"
          @keyup.enter="selectCurrent"
          @keyup.down.prevent="nextResult"
          @keyup.up.prevent="prevResult"
          autofocus
        />
        <button class="clear-btn" v-if="keyword" @click="keyword = ''">
          ×
        </button>
      </div>

      <!-- 搜索结果：同花顺标准左右布局 -->
      <div class="search-results" ref="resultsRef">
        <div
          v-for="(stock, index) in searchResults"
          :key="`${stock.market}_${stock.code}`"
          class="stock-item"
          :class="{ active: currentIndex === index }"
          @click="selectStock(stock)"
          @mouseenter="currentIndex = index"
        >
          <!-- 左侧：名称 + 市场 + 代码 一起排列 -->
          <div class="top">
            <span class="name">{{ stock.name }}</span>
            <span class="market">{{ getMarketLabel(stock) }}</span>
          </div>
          <div class="bottom">
            <span class="code">{{ stock.code }}</span>
            <!-- 右侧：收藏按钮 -->
            <button
              class="favorite"
              :class="{ favorited: isFavorite(stock) }"
              @click.stop="toggleFavorite(stock)"
            >
              {{ isFavorite(stock) ? "★" : "☆" }}
            </button>
          </div>
        </div>
        <div
          v-if="!loading && keyword && searchResults.length === 0"
          class="no-results"
        >
          未找到相关股票
        </div>
      </div>

      <div v-if="loading" class="loading">搜索中…</div>
      <div class="hint" v-if="keyword">↑↓ 切换 · Enter 确认 · Esc 关闭</div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from "vue";

const props = defineProps({
  initialKey: { type: String, default: "" },
});
const emit = defineEmits(["close", "select-share"]);

const keyword = ref("");
const searchResults = ref([]);
const loading = ref(false);
const currentIndex = ref(-1);
const searchInput = ref(null);
const resultsRef = ref(null);

// 初始按键
watch(
  () => props.initialKey,
  (k) => {
    // keyword.value = k;
    nextTick(() => searchInput.value?.focus());
  },
  { immediate: true }
);

// 搜索
const onSearch = async () => {
  const k = keyword.value.trim();
  if (!k) {
    searchResults.value = [];
    currentIndex.value = -1;
    return;
  }
  loading.value = true;
  try {
    const res = await window.channel.searchShares(k);
    searchResults.value = res || [];
    currentIndex.value = searchResults.value.length ? 0 : -1;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

// 选中
const selectStock = (s) => emit("select-share", s);
const selectCurrent = () => {
  if (currentIndex.value >= 0 && searchResults.value[currentIndex.value]) {
    selectStock(searchResults.value[currentIndex.value]);
  }
};

// 上下切换
const nextResult = () => {
  if (currentIndex.value < searchResults.value.length - 1) {
    currentIndex.value++;
    scrollToActive();
  }
};
const prevResult = () => {
  if (currentIndex.value > 0) {
    currentIndex.value--;
    scrollToActive();
  }
};

// 自动滚动
const scrollToActive = () => {
  nextTick(() => {
    const container = resultsRef.value;
    const item = container?.children[currentIndex.value];
    if (item) item.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
};

// 市场转换（创业板判断）
const getMarketLabel = (stock) => {
  const { market, code } = stock;
  if (market === "SZ") return code.startsWith("3") ? "创业板" : "深市";
  if (market === "SH") return "沪市";
  if (market === "bj") return "北交所";
  if (market === "hk") return "港股";
  if (market === "us") return "美股";
  return market;
};

// 收藏
const isFavorite = (stock) => false;
const toggleFavorite = (stock) => console.log("收藏", stock);

// 防抖
let timer;
watch(keyword, () => {
  clearTimeout(timer);
  timer = setTimeout(onSearch, 200);
});
</script>

<style scoped>
.search-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.search-panel {
  width: 280px;
  height: 100%;
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 搜索框 */
.search-box {
  padding: 12px;
  border-bottom: 1px solid #eee;
  position: relative;
}
.search-box input {
  width: 100%;
  height: 32px;
  padding: 0 8px;
  background: #f5f5f7;
  border: none;
  border-radius: 8px;
  outline: none;
  font-size: 15px;
}
.clear-btn {
  position: absolute;
  right: 18px;
  top: 22px;
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
}

/* 同花顺标准列表 */
.search-results {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}
.stock-item {
  padding: 4px 6px;
  cursor: pointer;
  display: flex;
  height: 52px;
  flex-direction: column;
  gap: 2px;
}
.stock-item.active {
  background: #e8f4ff;
}

/* 左侧：名称 市场 代码 横向排列 */
.top,
.bottom {
  display: flex;
  width: 100%;
  align-items: left;
  justify-content: space-between;
  gap: 10px;
}
.name {
  font-size: 14px;
  color: #222;
  min-width: 70px;
}
.market {
  font-size: 14px;
  color: #666;
  background: #f1f3f5;
  padding: 2px 6px;
  border-radius: 4px;
}
.code {
  font-size: 14px;
  color: #888;
}

/* 右侧收藏 */
.favorite {
  background: none;
  border: none;
  font-size: 16px;
  color: #666;
  cursor: pointer;
  margin-top: -4px;
  margin-right: 4px;
}
.favorite.favorited {
  color: #ffcc00;
}

.no-results,
.loading {
  padding: 30px 0;
  text-align: center;
  color: #999;
}

.hint {
  font-size: 12px;
  color: #888;
  text-align: center;
  padding: 8px 0;
  border-top: 1px solid #eee;
}

/* 滚动条整体宽度 */
.search-results::-webkit-scrollbar {
  width: 5px;
}
/* 滚动条轨道 */
.search-results::-webkit-scrollbar-track {
  background: transparent;
}
/* 滚动条滑块 */
.search-results::-webkit-scrollbar-thumb {
  background-color: #dcdcdc;
  border-radius: 3px;
}
/* hover 加深 */
.search-results::-webkit-scrollbar-thumb:hover {
  background-color: #bbbbbb;
}
/* 完全隐藏滚动条上下按钮 */
.search-results::-webkit-scrollbar-button {
  display: none;
}
</style>
