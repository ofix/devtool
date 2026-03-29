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
    <div
      v-if="contextMenuVisible"
      class="context-menu"
      :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }"
    >
      <div class="menu-item" @click="removeFromFavorite">取消收藏</div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useStockStore } from "@/stores/StoreStock";

export default {
  name: "FavoritePanel",
  emits: ["close", "select-stock", "remove-stock"],

  setup(props, { emit }) {
    const stockStore = useStockStore();
    const contextMenuVisible = ref(false);
    const contextMenuX = ref(0);
    const contextMenuY = ref(0);
    const selectedStock = ref(null);

    const favorites = computed(() => stockStore.favorites);

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
        stockStore.removeFavorite(selectedStock.value.code);
        emit("remove-stock", selectedStock.value.code);
      }
      contextMenuVisible.value = false;
    };

    const hideContextMenu = () => {
      contextMenuVisible.value = false;
    };

    const getMarketLabel = (market) => {
      const labels = { a: "A股", hk: "港股", us: "美股" };
      return labels[market] || market;
    };

    const formatPrice = (price) => {
      return price ? price.toFixed(2) : "--";
    };

    const formatChange = (change) => {
      if (change === undefined) return "--";
      return change > 0 ? `+${change.toFixed(2)}` : change.toFixed(2);
    };

    const getPriceClass = (stock) => {
      if (!stock.change) return "";
      return stock.change > 0 ? "up" : stock.change < 0 ? "down" : "";
    };

    onMounted(() => {
      document.addEventListener("click", hideContextMenu);
    });

    onUnmounted(() => {
      document.removeEventListener("click", hideContextMenu);
    });

    return {
      favorites,
      contextMenuVisible,
      contextMenuX,
      contextMenuY,
      selectStock,
      showContextMenu,
      removeFromFavorite,
      getMarketLabel,
      formatPrice,
      formatChange,
      getPriceClass,
    };
  },
};
</script>

<style scoped>
.favorite-panel {
  position: fixed;
  left: 0;
  top: 0;
  width: 380px;
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

.favorite-list {
  flex: 1;
  overflow-y: auto;
}

.stock-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 15px;
  cursor: pointer;
  transition: background 0.2s;
  border-bottom: 1px solid #333;
}

.stock-item:hover {
  background: #333;
}

.stock-info {
  display: flex;
  gap: 10px;
  align-items: baseline;
  flex-wrap: wrap;
}

.stock-name {
  font-size: 14px;
  font-weight: bold;
}

.stock-code {
  font-family: monospace;
  font-size: 12px;
  color: #ff6b6b;
}

.stock-market {
  font-size: 10px;
  color: #999;
  padding: 2px 4px;
  background: #444;
  border-radius: 3px;
}

.stock-sector {
  font-size: 11px;
  color: #999;
}

.stock-price-info {
  text-align: right;
}

.stock-price {
  display: block;
  font-size: 16px;
  font-weight: bold;
}

.stock-change {
  font-size: 12px;
}

.up {
  color: #ef5350;
}

.down {
  color: #26a69a;
}

.empty {
  text-align: center;
  padding: 40px;
  color: #999;
}

.context-menu {
  position: fixed;
  background: #333;
  border: 1px solid #555;
  border-radius: 4px;
  box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.3);
  z-index: 2000;
}

.menu-item {
  padding: 8px 16px;
  cursor: pointer;
  white-space: nowrap;
}

.menu-item:hover {
  background: #444;
}
</style>
