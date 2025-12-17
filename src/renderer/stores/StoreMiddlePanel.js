// 仅管理中间面板状态（可选，若中间有独立状态）
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useMiddlePanelStore = defineStore('mainPanel', () => {
  // 中间面板的独立状态（如编辑器打开的文件、搜索关键词）
  const editorOpenFile = ref('index.js');
  const searchKeyword = ref('');

  // 中间面板专属方法
  const setEditorOpenFile = (file) => {
    editorOpenFile.value = file;
  };
  const setSearchKeyword = (keyword) => {
    searchKeyword.value = keyword;
  };

  return { editorOpenFile, searchKeyword, setEditorOpenFile, setSearchKeyword };
});