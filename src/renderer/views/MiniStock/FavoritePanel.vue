<template>
  <div class="favorite-panel" @click.stop>
    <div class="panel-header">
      <h3>自选股</h3>
      <button class="close-btn" @click="$emit('close')">×</button>
    </div>

    <div class="favorite-list">
      <div
        v-for="stock in favorites"
        :key="stock.code"
        class="stock-item"
        @click="selectStock(stock)"
        @contextmenu.prevent="showContextMenu($event, stock)"
      >
        <div class="stock-info">
          <span class="stock-name">{{ stock.name }}</span>
          <span class="stock-code">{{ stock.code }}</span>
          <span class="stock-market">{{ getMarketLabel(stock.market) }}</span>
          <span class="stock-sector">{{ stock.sector || "--" }}</span>
        </div>
        <div class="stock-price-info">
          <span class="stock-price" :class="getPriceClass(stock)">
            {{ formatPrice(stock.price) }}
          </span>
          <span class="stock-change" :class="getPriceClass(stock)">
            {{ formatChange(stock.change) }}
          </span>
        </div>
      </div>

      <div v-if="favorites.length === 0" class="empty">
        暂无自选股，按F1搜索添加
      </div>
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div
        v-if="contextMenuVisible"
        class="context-menu"
        :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }"
        @click.stop
      >
        <div class="menu-item" @click="removeFromFavorite">取消收藏</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useStockStore } from "@/stores/StoreStock"; // 使用新的 Pinia store
import { storeToRefs } from "pinia";

// Emits
const emit = defineEmits(["close", "select-stock", "remove-stock"]);

// Store
const stockStore = useStockStore();
const { favorites } = storeToRefs(stockStore);
const { removeFavorite } = stockStore;

// 本地状态
const contextMenuVisible = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);
const selectedStock = ref(null);

// 计算属性
const hasFavorites = computed(() => favorites.value.length > 0);
const favoriteCount = computed(() => favorites.value.length);

// 方法
const selectStock = (stock) => {
  emit("select-stock", stock.code);
  emit("close");
};

const showContextMenu = (event, stock) => {
  contextMenuVisible.value = true;
  contextMenuX.value = event.clientX;
  contextMenuY.value = event.clientY;
  selectedStock.value = stock;
};

const removeFromFavorite = () => {
  if (selectedStock.value) {
    removeFavorite(selectedStock.value.code);
    emit("remove-stock", selectedStock.value.code);
  }
  hideContextMenu();
};

const hideContextMenu = () => {
  contextMenuVisible.value = false;
  selectedStock.value = null;
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

const formatPrice = (price) => {
  if (price === undefined || price === null) return "--";
  return price.toFixed(2);
};

const formatChange = (change) => {
  if (change === undefined || change === null) return "--";
  const formatted = change.toFixed(2);
  return change > 0 ? `+${formatted}` : formatted;
};

const getPriceClass = (stock) => {
  if (!stock.change || stock.change === 0) return "";
  return stock.change > 0 ? "up" : "down";
};

// 监听全局点击隐藏右键菜单
const handleGlobalClick = () => {
  if (contextMenuVisible.value) {
    hideContextMenu();
  }
};

// 监听 ESC 键关闭面板
const handleEscapeKey = (event) => {
  if (event.key === "Escape" && contextMenuVisible.value) {
    hideContextMenu();
  } else if (event.key === "Escape") {
    emit("close");
  }
};

// 生命周期
onMounted(() => {
  document.addEventListener("click", handleGlobalClick);
  document.addEventListener("keydown", handleEscapeKey);
});

onUnmounted(() => {
  document.removeEventListener("click", handleGlobalClick);
  document.removeEventListener("keydown", handleEscapeKey);
});
</script>

<style scoped>
.favorite-panel {
  position: fixed;
  left: 0;
  top: 0;
  width: 420px;
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
  padding: 15px 20px;
  border-bottom: 1px solid #444;
  background: #2a2a2a;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
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
  transition: all 0.2s;
}

.close-btn:hover {
  background: #444;
  transform: scale(1.05);
}

.favorite-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.favorite-list::-webkit-scrollbar {
  width: 6px;
}

.favorite-list::-webkit-scrollbar-track {
  background: #333;
}

.favorite-list::-webkit-scrollbar-thumb {
  background: #666;
  border-radius: 3px;
}

.favorite-list::-webkit-scrollbar-thumb:hover {
  background: #888;
}

.stock-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  cursor: pointer;
  transition: all 0.2s;
  border-bottom: 1px solid #333;
}

.stock-item:hover {
  background: #333;
  transform: translateX(2px);
}

.stock-info {
  display: flex;
  gap: 10px;
  align-items: baseline;
  flex-wrap: wrap;
  flex: 1;
}

.stock-name {
  font-size: 14px;
  font-weight: bold;
  color: #e0e0e0;
}

.stock-code {
  font-family: monospace;
  font-size: 12px;
  color: #ff6b6b;
  font-weight: 500;
}

.stock-market {
  font-size: 10px;
  color: #999;
  padding: 2px 6px;
  background: #444;
  border-radius: 3px;
}

.stock-sector {
  font-size: 11px;
  color: #999;
  padding: 2px 6px;
  background: #3a3a3a;
  border-radius: 3px;
}

.stock-price-info {
  text-align: right;
  min-width: 100px;
}

.stock-price {
  display: block;
  font-size: 16px;
  font-weight: bold;
  font-family: monospace;
}

.stock-change {
  display: block;
  font-size: 12px;
  font-family: monospace;
}

.up {
  color: #ef5350;
}

.down {
  color: #26a69a;
}

.empty {
  text-align: center;
  padding: 60px 20px;
  color: #999;
  font-size: 14px;
}

.context-menu {
  position: fixed;
  background: #2a2a2a;
  border: 1px solid #555;
  border-radius: 6px;
  box-shadow: 2px 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 2000;
  min-width: 120px;
  overflow: hidden;
  animation: menuFadeIn 0.15s ease;
}

@keyframes menuFadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.menu-item {
  padding: 10px 16px;
  cursor: pointer;
  white-space: nowrap;
  font-size: 13px;
  transition: background 0.2s;
  color: #e0e0e0;
}

.menu-item:hover {
  background: #e81123;
  color: #fff;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .favorite-panel {
    width: 100%;
    max-width: 380px;
  }

  .stock-info {
    gap: 6px;
  }

  .stock-name {
    font-size: 13px;
  }

  .stock-code {
    font-size: 11px;
  }
}
</style>
