<template>
  <div class="search-overlay" @click.self="$emit('close')">
    <div class="search-panel" @click.stop>
      <!-- 搜索框 -->
      <div class="search-box">
        <el-input
          ref="searchInput"
          v-model="keyword"
          placeholder="代码/名称/拼音/*"
          @input="onSearch"
          @keyup.enter="selectCurrent"
          @keyup.down.prevent="nextResult"
          @keyup.up.prevent="prevResult"
          clearable
          autofocus
        />
      </div>

      <!-- 搜索结果 -->
      <div class="search-results" ref="resultsRef">
        <div
          v-for="(share, index) in searchResults"
          :key="`${share.market}_${share.code}`"
          class="share-item"
          :class="{ active: currentIndex === index }"
          @click="selectStock(share)"
          @mouseenter="currentIndex = index"
        >
          <div class="top">
            <span class="name">{{ share.name }}</span>
            <span class="market">{{ getMarketLabel(share) }}</span>
          </div>
          <div class="bottom">
            <span class="code">{{ share.code }}</span>
            <button
              class="favorite"
              :class="{ favorited: share.favorite }"
              @click.stop="toggleFavorite(share)"
            >
              <IconFavorite v-if="share.favorite" class="favorite-icon" />
              <IconFavoriteEmpty v-else class="favorite-icon" />
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
import IconFavorite from "@/icons/IconFavorite.vue";
import IconFavoriteEmpty from "@/icons/IconFavoriteEmpty.vue";

const props = defineProps({
  initialKey: { type: String, default: "" },
});
const emit = defineEmits(["close", "select-share", "add-favorite"]);

const keyword = ref("");
const searchResults = ref([]);
const loading = ref(false);
const currentIndex = ref(-1);
const searchInput = ref(null);
const resultsRef = ref(null);

// 自动聚焦
watch(
  () => props.initialKey,
  (val) => {
    nextTick(() => searchInput.value?.focus());
  },
  { immediate: true }
);

// 搜索
const onSearch = async () => {
  const k = keyword.value?.trim();
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

// 列表 Enter / 点击 都触发选中给父组件
const selectShare = (s) => emit("select-share", s);
const selectCurrent = () => {
  if (currentIndex.value >= 0 && searchResults.value[currentIndex.value]) {
    selectShare(searchResults.value[currentIndex.value]);
  }
};

// 上下
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

const scrollToActive = () => {
  nextTick(() => {
    const container = resultsRef.value;
    const item = container?.children[currentIndex.value];
    if (item) item.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
};

// 市场转换
const getMarketLabel = (share) => {
  const { market, code } = share;
  const mk = (market || "").toLowerCase();
  if (mk === "sz") return code.startsWith("3") ? "创业板" : "深市";
  if (mk === "sh") return "沪市";
  if (mk === "bj") return "北交所";
  if (mk === "hk") return "港股";
  if (mk === "us") return "美股";
  return market;
};

// 自选收藏（调用接口 + 通知父组件）
const toggleFavorite = async (share) => {
  try {
    // 调用底层接口添加自选
    if (share.favorite) {
      share.favorite = false;
      await window.channel.delFavoriteShare(share.code);
    } else {
      share.favorite = true;
      await window.channel.addFavoriteShare(share.code);
    }
    // 通知父组件刷新自选列表
    emit("add-favorite", share);
  } catch (err) {
    console.error("添加自选失败", err);
  }
};

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

.search-box {
  padding: 12px;
  border-bottom: 1px solid #eee;
}

/* el-input 样式美化 */
:deep(.el-input__wrapper) {
  height: 32px;
  box-shadow: none;
  background: #f5f5f7;
  border-radius: 6px;
}
:deep(.el-input__inner) {
  height: 32px;
}

.search-results {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.share-item {
  padding: 6px 10px;
  cursor: pointer;
  height: 52px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}
.share-item.active {
  background: #e8f4ff;
}

.top,
.bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.name {
  font-size: 14px;
  color: #222;
}
.market {
  font-size: 12px;
  color: #666;
  background: #f1f3f5;
  padding: 1px 6px;
  border-radius: 4px;
}
.code {
  font-size: 14px;
  color: #888;
}

.favorite {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
}

.favorite.favorited {
  color: #ff0000;
}

.favorite-icon {
  display: inline-block;
  font-size: 14px !important; /* 你想要的大小 */
  width: 14px !important;
  height: 14px !important;
  line-height: 1;
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

/* 滚动条 */
.search-results::-webkit-scrollbar {
  width: 5px;
}
.search-results::-webkit-scrollbar-track {
  background: transparent;
}
.search-results::-webkit-scrollbar-thumb {
  background-color: #dcdcdc;
  border-radius: 3px;
}
.search-results::-webkit-scrollbar-thumb:hover {
  background-color: #bbbbbb;
}
.search-results::-webkit-scrollbar-button {
  display: none;
}
</style>
