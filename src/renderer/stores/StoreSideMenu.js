// 仅管理左侧菜单状态
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSideMenuStore = defineStore('sidebar', () => {
  // 核心状态：当前激活的左侧菜单 key（对应 VSCode 的 Activity Bar 选中项）
  const activeSidebarKey = ref('explorer'); // explorer/search/editor/debug

  // 切换左侧菜单（点击时调用）
  const setActiveSidebarKey = (key) => {
    activeSidebarKey.value = key;
    // 可选：记录菜单切换历史（复刻 VSCode 视图历史）
    // historyStack.value.push(key);
  };

  return { activeSidebarKey, setActiveSidebarKey };
});