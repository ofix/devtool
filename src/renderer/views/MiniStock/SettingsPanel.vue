<template>
  <div class="settings-panel" @click.stop>
    <div class="panel-header">
      <h3>设置</h3>
      <button class="close-btn" @click="$emit('close')">×</button>
    </div>

    <div class="settings-content">
      <!-- 主题设置 -->
      <div class="setting-section">
        <h4>主题颜色</h4>
        <div class="theme-selector">
          <button
            :class="{ active: theme === 'dark' }"
            @click="setTheme('dark')"
          >
            深色
          </button>
          <button
            :class="{ active: theme === 'light' }"
            @click="setTheme('light')"
          >
            浅色
          </button>
        </div>
      </div>

      <!-- EMA指标颜色设置 -->
      <div class="setting-section">
        <h4>EMA指标线颜色</h4>
        <div class="ema-colors">
          <div v-for="period in emaPeriods" :key="period" class="color-item">
            <label>EMA{{ period }}</label>
            <input
              type="color"
              :value="emaColors[period]"
              @change="updateEMAColor(period, $event.target.value)"
            />
          </div>
        </div>
      </div>

      <!-- 数据源切换 -->
      <div class="setting-section">
        <h4>数据源</h4>
        <div class="data-source-selector">
          <button
            v-for="source in dataSources"
            :key="source.value"
            :class="{ active: dataProvider === source.value }"
            @click="setDataSource(source.value)"
          >
            {{ source.label }}
          </button>
        </div>
      </div>

      <!-- 快捷键设置 -->
      <div class="setting-section">
        <h4>快捷键</h4>
        <div class="shortcuts">
          <div class="shortcut-item">
            <label>显示/隐藏窗口</label>
            <input
              type="text"
              :value="shortcuts.toggleWindow"
              @focus="startRecording('toggleWindow')"
              @blur="stopRecording"
              @keydown="captureShortcut"
              :placeholder="
                recordingKey === 'toggleWindow' ? '按下快捷键...' : '点击录制'
              "
            />
          </div>
          <div class="shortcut-item">
            <label>搜索面板</label>
            <input
              type="text"
              :value="shortcuts.search"
              @focus="startRecording('search')"
              @blur="stopRecording"
              @keydown="captureShortcut"
              :placeholder="
                recordingKey === 'search' ? '按下快捷键...' : '点击录制'
              "
            />
          </div>
          <div class="shortcut-item">
            <label>自选股面板</label>
            <input
              type="text"
              :value="shortcuts.favorites"
              @focus="startRecording('favorites')"
              @blur="stopRecording"
              @keydown="captureShortcut"
              :placeholder="
                recordingKey === 'favorites' ? '按下快捷键...' : '点击录制'
              "
            />
          </div>
          <div class="shortcut-item">
            <label>设置面板</label>
            <input
              type="text"
              :value="shortcuts.settings"
              @focus="startRecording('settings')"
              @blur="stopRecording"
              @keydown="captureShortcut"
              :placeholder="
                recordingKey === 'settings' ? '按下快捷键...' : '点击录制'
              "
            />
          </div>
        </div>
        <button class="reset-shortcuts" @click="resetShortcuts">
          恢复默认
        </button>
      </div>

      <!-- K线模式 -->
      <div class="setting-section">
        <h4>K线模式</h4>
        <div class="mode-selector">
          <label>
            <input
              type="radio"
              value="sync"
              v-model="klineMode"
              @change="setKlineMode('sync')"
            />
            同步切换（所有股票K线类型同步）
          </label>
          <label>
            <input
              type="radio"
              value="independent"
              v-model="klineMode"
              @change="setKlineMode('independent')"
            />
            独立切换（各股票K线类型独立）
          </label>
        </div>
      </div>

      <!-- 自选股管理 -->
      <div class="setting-section">
        <h4>自选股管理</h4>
        <div class="favorite-manage">
          <div
            v-for="stock in favorites"
            :key="stock.code"
            class="favorite-item"
          >
            <span>{{ stock.name }} ({{ stock.code }})</span>
            <button @click="removeFavorite(stock.code)">删除</button>
          </div>
          <div v-if="favorites.length === 0" class="empty-favorites">
            暂无自选股
          </div>
        </div>
      </div>
    </div>

    <div class="panel-footer">
      <button class="save-btn" @click="saveSettings">保存设置</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useStockConfigStore } from "@/stores/StoreStockConfig";
import { useStockStore } from "@/stores/StoreStock";
import { storeToRefs } from "pinia";

// Emits
const emit = defineEmits(["close", "config-changed"]);

// Stores
const configStore = useStockConfigStore();
const stockStore = useStockStore();

// 使用 storeToRefs 解构响应式状态
const { theme, dataProvider, klineMode, emaColors, shortcuts } =
  storeToRefs(configStore);
const { favorites } = storeToRefs(stockStore);

// 本地状态（不需要同步到 store 的）
const emaPeriods = [10, 20, 30, 60, 99, 255, 905];
const recordingKey = ref(null);

// Data sources configuration
const dataSources = [
  { label: "东方财富", value: "eastmoney" },
  { label: "腾讯财经", value: "tencent" },
  { label: "百度财经", value: "baidu" },
  { label: "Yahoo Finance", value: "yahoo" },
];

// Methods - 直接调用 store 的 actions
const setTheme = (newTheme) => {
  configStore.updateTheme(newTheme);
  document.documentElement.setAttribute("data-theme", newTheme);
  emit("config-changed", "theme", newTheme);
};

const updateEMAColor = (period, color) => {
  configStore.updateEMAColor(period, color);
  emit("config-changed", "emaColors", emaColors.value);
};

const setDataSource = (source) => {
  configStore.updateDataProvider(source);
  emit("config-changed", "dataProvider", source);
};

const setKlineMode = (mode) => {
  configStore.updateKlineMode(mode);
  emit("config-changed", "klineMode", mode);
};

const startRecording = (key) => {
  recordingKey.value = key;
};

const stopRecording = () => {
  recordingKey.value = null;
};

const captureShortcut = (event) => {
  if (!recordingKey.value) return;

  event.preventDefault();
  event.stopPropagation();

  const keys = [];
  if (event.ctrlKey) keys.push("Ctrl");
  if (event.altKey) keys.push("Alt");
  if (event.shiftKey) keys.push("Shift");
  if (event.metaKey) keys.push("Win");

  // 获取按键名称
  let key = "";
  if (event.key === " ") key = "Space";
  else if (event.key === "Escape") key = "Esc";
  else if (event.key === "Delete") key = "Del";
  else if (event.key === "ArrowUp") key = "↑";
  else if (event.key === "ArrowDown") key = "↓";
  else if (event.key === "ArrowLeft") key = "←";
  else if (event.key === "ArrowRight") key = "→";
  else if (event.key.length === 1) key = event.key.toUpperCase();
  else key = event.key;

  // 过滤掉修饰键本身
  if (key && !["Control", "Alt", "Shift", "Meta"].includes(key)) {
    keys.push(key);
    const shortcut = keys.join("+");

    // 直接更新 store 中的快捷键
    shortcuts.value[recordingKey.value] = shortcut;
    configStore.updateShortcut(recordingKey.value, shortcut);
    emit("config-changed", "shortcuts", shortcuts.value);
  }

  recordingKey.value = null;
};

const resetShortcuts = () => {
  // 重置 shortcuts 的值
  shortcuts.value = {
    toggleWindow: "Ctrl+Esc",
    search: "F1",
    favorites: "F2",
    settings: "F3",
  };
  configStore.updateShortcuts(shortcuts.value);
  emit("config-changed", "shortcuts", shortcuts.value);
};

const removeFavorite = (code) => {
  stockStore.removeFavorite(code);
  // favorites 会自动更新，因为它是响应式的
};

const saveSettings = async () => {
  // 配置已经通过各个 setter 方法实时保存到 store
  // 这里只需要触发保存到本地存储
  await configStore.saveAllToStorage();

  emit("config-changed", "all", {
    theme: theme.value,
    emaColors: emaColors.value,
    dataProvider: dataProvider.value,
    klineMode: klineMode.value,
    shortcuts: shortcuts.value,
  });

  emit("close");
};

// Lifecycle
onMounted(() => {
  // 应用当前主题到 DOM
  document.documentElement.setAttribute("data-theme", theme.value);
});
</script>

<style scoped>
.settings-panel {
  position: fixed;
  left: 0;
  top: 0;
  width: 450px;
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

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 15px;
}

.settings-content::-webkit-scrollbar {
  width: 6px;
}

.settings-content::-webkit-scrollbar-track {
  background: #333;
}

.settings-content::-webkit-scrollbar-thumb {
  background: #666;
  border-radius: 3px;
}

.setting-section {
  margin-bottom: 25px;
  padding-bottom: 20px;
  border-bottom: 1px solid #444;
}

.setting-section:last-child {
  border-bottom: none;
}

.setting-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #ff6b6b;
}

.theme-selector,
.data-source-selector {
  display: flex;
  gap: 10px;
}

.theme-selector button,
.data-source-selector button {
  padding: 6px 16px;
  background: #333;
  border: 1px solid #555;
  color: #fff;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.theme-selector button:hover,
.data-source-selector button:hover {
  background: #444;
}

.theme-selector button.active,
.data-source-selector button.active {
  background: #ff6b6b;
  border-color: #ff6b6b;
}

.ema-colors {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.color-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.color-item label {
  font-size: 12px;
}

.color-item input {
  width: 50px;
  height: 30px;
  border: 1px solid #555;
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
}

.shortcuts {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.shortcut-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.shortcut-item label {
  font-size: 13px;
}

.shortcut-item input {
  width: 150px;
  padding: 4px 8px;
  background: #333;
  border: 1px solid #555;
  color: #fff;
  border-radius: 4px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}

.shortcut-item input:focus {
  outline: none;
  border-color: #ff6b6b;
  background: #3a3a3a;
}

.reset-shortcuts {
  margin-top: 10px;
  padding: 4px 12px;
  background: #444;
  border: none;
  color: #fff;
  cursor: pointer;
  border-radius: 4px;
  font-size: 12px;
  transition: background 0.2s;
}

.reset-shortcuts:hover {
  background: #555;
}

.mode-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mode-selector label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
}

.mode-selector input {
  cursor: pointer;
}

.favorite-manage {
  max-height: 200px;
  overflow-y: auto;
}

.favorite-manage::-webkit-scrollbar {
  width: 4px;
}

.favorite-manage::-webkit-scrollbar-track {
  background: #333;
}

.favorite-manage::-webkit-scrollbar-thumb {
  background: #666;
  border-radius: 2px;
}

.favorite-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  border-bottom: 1px solid #444;
}

.favorite-item span {
  font-size: 13px;
}

.favorite-item button {
  padding: 2px 8px;
  background: #e81123;
  border: none;
  color: #fff;
  cursor: pointer;
  border-radius: 3px;
  font-size: 11px;
  transition: background 0.2s;
}

.favorite-item button:hover {
  background: #ff3333;
}

.empty-favorites {
  text-align: center;
  padding: 20px;
  color: #999;
  font-size: 13px;
}

.panel-footer {
  padding: 15px;
  border-top: 1px solid #444;
}

.save-btn {
  width: 100%;
  padding: 8px;
  background: #ff6b6b;
  border: none;
  color: #fff;
  cursor: pointer;
  border-radius: 4px;
  font-size: 14px;
  transition: background 0.2s;
}

.save-btn:hover {
  background: #ff5252;
}
</style>
