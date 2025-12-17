// 仅管理右侧面板状态（完全独立）
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useRightPanelStore = defineStore('rightPanel', () => {
  // 右侧面板独立状态（如终端日志、是否显示终端）
  const terminalLogs = ref([]);
  const isTerminalShow = ref(true);

  // 右侧面板专属方法（和左侧/中间无关）
  const addTerminalLog = (log) => {
    terminalLogs.value.push({
      time: new Date().toLocaleTimeString(),
      content: log
    });
    // 限制日志数量（VSCode 终端也会限制行数）
    if (terminalLogs.value.length > 100) terminalLogs.value.shift();
  };
  const toggleTerminal = () => {
    isTerminalShow.value = !isTerminalShow.value;
  };

  return { terminalLogs, isTerminalShow, addTerminalLog, toggleTerminal };
});