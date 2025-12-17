import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';

export const useSearchReplaceStore = defineStore('searchReplace', () => {
  // 内存文件列表
  const virtualFiles = ref([]);
  // 查找替换配置
  const findReplaceOptions = ref({
    searchText: '',
    replaceText: '',
    caseSensitive: false,
    useRegex: false,
    wholeWord: false,
    includeDir: '/',
    excludeDirs: ['/node_modules', '/dist'],
  });
  // 匹配结果列表
  const matchResults = ref([]);
  // 替换操作状态
  const replaceStatus = ref({
    replacedCount: 0,
    affectedFiles: [],
    isLoading: false,
  });
  // 编辑器相关状态
  const activeFile = ref(null);
  const editorInstance = ref(null);
  const currentMatchIndex = ref(-1);

  // 当前匹配项
  const currentMatch = computed(() => {
    if (currentMatchIndex.value === -1 || matchResults.value.length === 0) return null;
    return matchResults.value[currentMatchIndex.value];
  });
  // 匹配总数
  const matchCount = computed(() => matchResults.value.length);

  // 添加内存文件
  const addVirtualFile = (file) => {
    virtualFiles.value.push({
      path: file.path,
      content: file.content,
      lastModified: Date.now(),
    });
  };
  // 清空内存文件
  const clearVirtualFiles = () => {
    virtualFiles.value = [];
  };
  // 更新查找配置
  const updateFindOptions = (options) => {
    findReplaceOptions.value = { ...findReplaceOptions.value, ...options };
  };
  // 清空匹配结果
  const clearMatchResults = () => {
    matchResults.value = [];
  };
  // 重置替换状态
  const resetReplaceStatus = () => {
    replaceStatus.value = {
      replacedCount: 0,
      affectedFiles: [],
      isLoading: false,
    };
  };
  // 设置当前激活的文件
  const setActiveFile = (file) => {
    activeFile.value = file;
    currentMatchIndex.value = -1; // 切换文件重置跳转索引
  };
  // 保存编辑器实例
  const setEditorInstance = (editor) => {
    editorInstance.value = editor;
  };
  // 跳转至上一个匹配项
  const goToPrevMatch = () => {
    if (matchResults.value.length === 0) return;
    currentMatchIndex.value = currentMatchIndex.value <= 0
      ? matchResults.value.length - 1
      : currentMatchIndex.value - 1;
    jumpToMatch(currentMatch.value);
  };
  // 跳转至下一个匹配项
  const goToNextMatch = () => {
    if (matchResults.value.length === 0) return;
    currentMatchIndex.value = currentMatchIndex.value >= matchResults.value.length - 1
      ? 0
      : currentMatchIndex.value + 1;
    jumpToMatch(currentMatch.value);
  };
  // 跳转到指定匹配项
  const jumpToMatch = (match) => {
    if (!match || !editorInstance.value) return;
    // 切换到匹配项对应的文件
    if (activeFile.value?.path !== match.file.path) {
      setActiveFile(match.file);
      // 延迟跳转（等待编辑器加载内容）
      setTimeout(() => jumpToPosition(match.start), 100);
    } else {
      jumpToPosition(match.start);
    }
  };
  // 跳转到指定位置（按字符索引）
  const jumpToPosition = (startIndex) => {
    if (!editorInstance.value || !activeFile.value) return;
    const editor = editorInstance.value;
    const model = editor.getModel();
    const position = model.getPositionAt(startIndex);
    editor.revealPositionInCenter(position); // 居中显示
    editor.setPosition(position); // 光标定位
    editor.focus(); // 编辑器聚焦
  };
  // 清空高亮
  const clearHighlights = () => {
    if (!editorInstance.value) return;
    editorInstance.value.deltaDecorations(
      editorInstance.value.getModel().getAllDecorations(),
      []
    );
  };
  // 渲染匹配项高亮
  const renderHighlights = () => {
    if (!editorInstance.value || !activeFile.value || matchResults.value.length === 0) return;
    const editor = editorInstance.value;
    const model = editor.getModel();
    // 筛选当前文件的匹配项
    const currentFileMatches = matchResults.value.filter(
      match => match.file.path === activeFile.value.path
    );
    // 构建装饰器
    const decorations = currentFileMatches.map(match => {
      const startPos = model.getPositionAt(match.start);
      const endPos = model.getPositionAt(match.end);
      return {
        range: window.monaco.Range(
          startPos.lineNumber,
          startPos.column,
          endPos.lineNumber,
          endPos.column
        ),
        options: {
          inlineClassName: 'match-highlight',
        },
      };
    });
    // 应用装饰器
    editor.deltaDecorations([], decorations);
  };

  return {
    // 状态
    virtualFiles,
    findReplaceOptions,
    matchResults,
    replaceStatus,
    activeFile,
    editorInstance,
    currentMatchIndex,
    // 计算属性
    currentMatch,
    matchCount,
    // 方法
    addVirtualFile,
    clearVirtualFiles,
    updateFindOptions,
    clearMatchResults,
    resetReplaceStatus,
    setActiveFile,
    setEditorInstance,
    goToPrevMatch,
    goToNextMatch,
    jumpToMatch,
    jumpToPosition,
    clearHighlights,
    renderHighlights,
  };
});