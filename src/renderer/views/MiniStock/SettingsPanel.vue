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
            :class="{ active: dataSource === source.value }"
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
              v-model="shortcuts.toggleWindow"
              @focus="recordingKey = 'toggleWindow'"
              @blur="recordingKey = null"
              @keydown="captureShortcut"
              placeholder="点击录制"
            />
          </div>
          <div class="shortcut-item">
            <label>搜索面板</label>
            <input
              type="text"
              v-model="shortcuts.search"
              @focus="recordingKey = 'search'"
              @blur="recordingKey = null"
              @keydown="captureShortcut"
              placeholder="点击录制"
            />
          </div>
          <div class="shortcut-item">
            <label>自选股面板</label>
            <input
              type="text"
              v-model="shortcuts.favorites"
              @focus="recordingKey = 'favorites'"
              @blur="recordingKey = null"
              @keydown="captureShortcut"
              placeholder="点击录制"
            />
          </div>
          <div class="shortcut-item">
            <label>设置面板</label>
            <input
              type="text"
              v-model="shortcuts.settings"
              @focus="recordingKey = 'settings'"
              @blur="recordingKey = null"
              @keydown="captureShortcut"
              placeholder="点击录制"
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
              v-model="kLineMode"
              @change="setKLineMode('sync')"
            />
            同步切换（所有股票K线类型同步）
          </label>
          <label>
            <input
              type="radio"
              value="independent"
              v-model="kLineMode"
              @change="setKLineMode('independent')"
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
        </div>
      </div>
    </div>

    <div class="panel-footer">
      <button class="save-btn" @click="saveSettings">保存设置</button>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from "vue";
import { useConfigStore } from "../stores/configStore";
import { useStockStore } from "../stores/stockStore";

export default {
  name: "SettingsPanel",
  emits: ["close", "config-changed"],

  setup(props, { emit }) {
    const configStore = useConfigStore();
    const stockStore = useStockStore();

    const theme = ref("dark");
    const emaPeriods = [10, 20, 30, 60, 99, 255, 905];
    const emaColors = ref({});
    const dataSource = ref("eastmoney");
    const shortcuts = ref({
      toggleWindow: "Ctrl+Esc",
      search: "F1",
      favorites: "F2",
      settings: "F3",
    });
    const kLineMode = ref("sync");
    const favorites = ref([]);
    const recordingKey = ref(null);

    const dataSources = [
      { label: "东方财富", value: "eastmoney" },
      { label: "腾讯财经", value: "tencent" },
      { label: "百度财经", value: "baidu" },
      { label: "Yahoo Finance", value: "yahoo" },
    ];

    const setTheme = (newTheme) => {
      theme.value = newTheme;
      document.documentElement.setAttribute("data-theme", newTheme);
      emit("config-changed", "theme", newTheme);
    };

    const updateEMAColor = (period, color) => {
      emaColors.value[period] = color;
      emit("config-changed", "emaColors", emaColors.value);
    };

    const setDataSource = (source) => {
      dataSource.value = source;
      emit("config-changed", "dataProvider", source);
    };

    const setKLineMode = (mode) => {
      kLineMode.value = mode;
      emit("config-changed", "kLineMode", mode);
    };

    const captureShortcut = (event) => {
      if (!recordingKey.value) return;

      event.preventDefault();

      const keys = [];
      if (event.ctrlKey) keys.push("Ctrl");
      if (event.altKey) keys.push("Alt");
      if (event.shiftKey) keys.push("Shift");
      if (event.metaKey) keys.push("Meta");

      let key = "";
      if (event.key === " ") key = "Space";
      else if (event.key === "Escape") key = "Esc";
      else if (event.key === "Delete") key = "Del";
      else if (event.key.length === 1) key = event.key.toUpperCase();
      else key = event.key;

      if (key && !["Control", "Alt", "Shift", "Meta"].includes(key)) {
        keys.push(key);
        shortcuts.value[recordingKey.value] = keys.join("+");
      }

      recordingKey.value = null;
    };

    const resetShortcuts = () => {
      shortcuts.value = {
        toggleWindow: "Ctrl+Esc",
        search: "F1",
        favorites: "F2",
        settings: "F3",
      };
    };

    const removeFavorite = (code) => {
      stockStore.removeFavorite(code);
      loadFavorites();
    };

    const loadFavorites = () => {
      favorites.value = stockStore.favorites;
    };

    const saveSettings = async () => {
      await window.electron.setConfig("settings", {
        theme: theme.value,
        emaColors: emaColors.value,
        dataProvider: dataSource.value,
        kLineMode: kLineMode.value,
      });

      await window.electron.setConfig("shortcuts", shortcuts.value);

      emit("config-changed", "all", {
        theme: theme.value,
        emaColors: emaColors.value,
        dataProvider: dataSource.value,
        kLineMode: kLineMode.value,
        shortcuts: shortcuts.value,
      });

      emit("close");
    };

    const loadSettings = async () => {
      const savedTheme = await window.electron.getConfig("settings.theme");
      const savedColors = await window.electron.getConfig("settings.emaColors");
      const savedDataSource = await window.electron.getConfig(
        "settings.dataProvider"
      );
      const savedKLineMode =
        await window.electron.getConfig("settings.kLineMode");
      const savedShortcuts = await window.electron.getConfig("shortcuts");

      theme.value = savedTheme || "dark";
      emaColors.value = savedColors || {
        10: "#FF6B6B",
        20: "#4ECDC4",
        30: "#45B7D1",
        60: "#96CEB4",
        99: "#FFEAA7",
        255: "#DDA0DD",
        905: "#98D8C8",
      };
      dataSource.value = savedDataSource || "eastmoney";
      kLineMode.value = savedKLineMode || "sync";
      shortcuts.value = savedShortcuts || {
        toggleWindow: "Ctrl+Esc",
        search: "F1",
        favorites: "F2",
        settings: "F3",
      };
    };

    onMounted(() => {
      loadSettings();
      loadFavorites();
    });

    return {
      theme,
      emaPeriods,
      emaColors,
      dataSource,
      shortcuts,
      kLineMode,
      favorites,
      dataSources,
      recordingKey,
      setTheme,
      updateEMAColor,
      setDataSource,
      setKLineMode,
      captureShortcut,
      resetShortcuts,
      removeFavorite,
      saveSettings,
    };
  },
};
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

.setting-section {
  margin-bottom: 25px;
  padding-bottom: 20px;
  border-bottom: 1px solid #444;
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
}

.favorite-manage {
  max-height: 200px;
  overflow-y: auto;
}

.favorite-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  border-bottom: 1px solid #444;
}

.favorite-item button {
  padding: 2px 8px;
  background: #e81123;
  border: none;
  color: #fff;
  cursor: pointer;
  border-radius: 3px;
  font-size: 11px;
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
}

.save-btn:hover {
  background: #ff5252;
}
</style>
