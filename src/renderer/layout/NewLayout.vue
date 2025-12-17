<!-- App.vue（根布局） -->
<template>
  <div class="vscode-layout">
    <!-- 1. 最左侧菜单（Activity Bar） -->
    <div class="sidebar">
      <button
        class="sidebar-btn"
        :class="{ active: sidebarStore.activeSidebarKey === 'explorer' }"
        @click="sidebarStore.setActiveSidebarKey('explorer')"
        title="资源管理器"
      >
        <i class="icon-folder"></i>
      </button>
      <button
        class="sidebar-btn"
        :class="{ active: sidebarStore.activeSidebarKey === 'search' }"
        @click="sidebarStore.setActiveSidebarKey('search')"
        title="搜索替换"
      >
        <i class="icon-search"></i>
      </button>
      <button
        class="sidebar-btn"
        :class="{ active: sidebarStore.activeSidebarKey === 'editor' }"
        @click="sidebarStore.setActiveSidebarKey('editor')"
        title="编辑器"
      >
        <i class="icon-edit"></i>
      </button>
      <button
        class="sidebar-btn"
        :class="{ active: sidebarStore.activeSidebarKey === 'debug' }"
        @click="sidebarStore.setActiveSidebarKey('debug')"
        title="调试"
      >
        <i class="icon-debug"></i>
      </button>
    </div>

    <!-- 2. 中间面板（仅响应左侧菜单状态） -->
    <div class="main-panel">
      <!-- keep-alive 缓存重组件，避免重复初始化（VSCode 核心优化） -->
      <keep-alive>
        <!-- 资源管理器面板 -->
        <ExplorerPanel v-show="sidebarStore.activeSidebarKey === 'explorer'" />
        <!-- 搜索替换面板 -->
        <SearchPanel v-show="sidebarStore.activeSidebarKey === 'search'" />
        <!-- 代码编辑器面板 -->
        <CodeEditorPanel v-show="sidebarStore.activeSidebarKey === 'editor'" />
        <!-- 调试面板 -->
        <DebugPanel v-show="sidebarStore.activeSidebarKey === 'debug'" />
      </keep-alive>
    </div>

    <!-- 3. 右侧面板（完全独立，不监听左侧/中间状态） -->
    <div class="right-panel" v-show="rightStore.isTerminalShow">
      <div class="terminal-header">
        <h3>终端</h3>
        <button @click="rightStore.toggleTerminal">×</button>
      </div>
      <div class="terminal-logs">
        <div
          v-for="(log, idx) in rightStore.terminalLogs"
          :key="idx"
          class="log-item"
        >
          {{ log.time }}: {{ log.content }}
        </div>
      </div>
      <div class="terminal-input">
        <input
          v-model="newLog"
          @keyup.enter="addTerminalLog"
          placeholder="输入终端命令..."
        />
        <button @click="addTerminalLog">执行</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
// 引入 Pinia Store
import { useSidebarStore } from "@/stores/sidebarStore";
import { useRightPanelStore } from "@/stores/rightPanelStore";
// 引入中间面板组件
import ExplorerPanel from "@/components/ExplorerPanel.vue";
import SearchPanel from "@/components/SearchPanel.vue";
import CodeEditorPanel from "@/components/CodeEditorPanel.vue";
import DebugPanel from "@/components/DebugPanel.vue";

// 初始化 Store（右侧 Store 仅在右侧面板使用，中间面板不碰）
const sidebarStore = useSidebarStore();
const rightStore = useRightPanelStore();

// 右侧面板临时状态（仅作用于右侧）
const newLog = ref("");
const addTerminalLog = () => {
  if (!newLog.value) return;
  rightStore.addTerminalLog(newLog.value);
  newLog.value = "";
};
</script>

<style scoped>
/* 复刻 VSCode 样式 */
.vscode-layout {
  display: flex;
  height: 100vh;
  background: #1e1e1e;
  color: #fff;
  overflow: hidden;
}

/* 最左侧菜单（VSCode Activity Bar 同款） */
.sidebar {
  width: 52px;
  background: #252526;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 16px;
  gap: 8px;
}
.sidebar-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  color: #ccc;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.sidebar-btn.active {
  background: #007acc; /* VSCode 蓝色高亮 */
  color: #fff;
}
.sidebar-btn:hover:not(.active) {
  background: #333;
}

/* 中间面板（占满剩余空间） */
.main-panel {
  flex: 1;
  padding: 8px;
  overflow: hidden;
}

/* 右侧面板（固定宽度，独立样式） */
.right-panel {
  width: 350px;
  background: #1e1e1e;
  border-left: 1px solid #333;
  display: flex;
  flex-direction: column;
}
.terminal-header {
  padding: 8px 16px;
  border-bottom: 1px solid #333;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
}
.terminal-header button {
  border: none;
  background: transparent;
  color: #ccc;
  cursor: pointer;
  font-size: 16px;
}
.terminal-logs {
  flex: 1;
  padding: 8px 16px;
  overflow-y: auto;
  font-family: monospace;
  font-size: 14px;
  line-height: 1.5;
}
.terminal-input {
  padding: 8px 16px;
  border-top: 1px solid #333;
  display: flex;
  gap: 8px;
}
.terminal-input input {
  flex: 1;
  padding: 8px;
  background: #252526;
  border: 1px solid #333;
  color: #fff;
  border-radius: 4px;
  outline: none;
}
.terminal-input button {
  padding: 0 16px;
  background: #007acc;
  border: none;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
}
</style>
