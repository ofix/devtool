import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as monaco from 'monaco-editor'

// ========== 核心：禁用Monaco的Worker相关功能，消除警告 ==========
// 禁用TypeScript/JavaScript语法校验（彻底避免Worker调用）
// monaco.languages.javascript.javascriptDefaults.setDiagnosticsOptions({
//   noSemanticValidation: true,
//   noSyntaxValidation: true
// });
// // 禁用Vue/HTML/CSS/JSON的诊断功能（可选，按需添加）
// monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
//   enableSchemaRequest: false,
//   validate: false
// });

// 生成文件唯一ID
const generateFileId = (host, remoteFilePath) => `${host}_${remoteFilePath}`;

// 根据文件名获取语言类型
const getLanguageByFileName = (fileName) => {
  if (!fileName) return 'plaintext';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const languageMap = {
    js: 'javascript',
    ts: 'typescript',
    vue: 'vue',
    html: 'html',
    css: 'css',
    json: 'json'
  };
  return languageMap[ext] || 'plaintext';
};

export const useEditorStore = defineStore('editor', () => {
  // 状态
  const openFiles = ref([]);
  const activeFileId = ref(null);
  const monacoInstance = ref(monaco); // 直接初始化Monaco

  // 计算属性
  const activeFile = computed(() => {
    if (!activeFileId.value) return null;
    return openFiles.value.find(file => file.id === activeFileId.value);
  });

  const isFileOpened = computed(() => {
    return (host, remoteFilePath) => {
      const id = generateFileId(host, remoteFilePath);
      return openFiles.value.some(file => file.id === id);
    };
  });

  // 方法
  const setMonacoInstance = (monaco) => {
    monacoInstance.value = monaco;
  };

  const openFile = (fileInfo) => {
    if (!monacoInstance.value) {
      console.error('Monaco实例未初始化！');
      return null;
    }

    if (!fileInfo || !fileInfo.host || !fileInfo.remoteFilePath || !fileInfo.extractFileName) {
      console.error('文件信息不完整:', fileInfo);
      return null;
    }

    const {
      host,
      remoteFilePath,
      extractFileName,
      content = '',
      localFilePath = '',
      originFileName = extractFileName
    } = fileInfo;

    const fileId = generateFileId(host, remoteFilePath);
    const existingFile = openFiles.value.find(file => file.id === fileId);

    // 已打开则激活
    if (existingFile) {
      activeFileId.value = fileId;
      return existingFile;
    }

    // 兼容URI（避免Uri.file空值报错）
    let modelUri;
    if (localFilePath && localFilePath.trim()) {
      modelUri = monacoInstance.value.Uri.file(localFilePath);
    } else {
      modelUri = monacoInstance.value.Uri.parse(`inmemory://${host}${remoteFilePath}`);
    }

    // 创建Model（核心功能不受影响）
    const language = getLanguageByFileName(extractFileName);
    const model = monacoInstance.value.editor.createModel(
      content,
      language,
      modelUri
    );

    // 监听内容变化标记脏状态
    model.onDidChangeContent(() => {
      const file = openFiles.value.find(f => f.id === fileId);
      if (file) file.isDirty = true;
    });

    // 添加文件
    const newFile = {
      id: fileId,
      originFileName,
      extractFileName,
      remoteFilePath,
      host,
      localFilePath,
      model,
      isDirty: false,
      content
    };
    openFiles.value.push(newFile);
    activeFileId.value = fileId;
    return newFile;
  };

  const closeFile = (fileId, forceClose = false) => {
    const fileIndex = openFiles.value.findIndex(file => file.id === fileId);
    if (fileIndex === -1) return false;

    const file = openFiles.value[fileIndex];
    if (file.isDirty && !forceClose) return false;

    // 安全销毁Model
    if (file.model && !file.model.isDisposed()) {
      file.model.dispose();
    }

    openFiles.value.splice(fileIndex, 1);

    if (activeFileId.value === fileId) {
      activeFileId.value = openFiles.value.at(-1)?.id || null;
    }
    return true;
  };

  const saveFile = async (fileId, newContent) => {
    const file = openFiles.value.find(f => f.id === fileId);
    if (!file) return null;

    file.content = newContent || (file.model ? file.model.getValue() : '');
    file.isDirty = false;
    return file;
  };

  const switchActiveFile = (fileId) => {
    const fileExists = openFiles.value.some(f => f.id === fileId);
    if (fileExists) activeFileId.value = fileId;
  };

  const closeAllFiles = (forceClose = false) => {
    openFiles.value.forEach(file => {
      if (forceClose || !file.isDirty) {
        if (file.model && !file.model.isDisposed()) {
          file.model.dispose();
        }
      }
    });
    openFiles.value = forceClose ? [] : openFiles.value.filter(file => file.isDirty);
    activeFileId.value = null;
  };

  return {
    openFiles,
    activeFileId,
    activeFile,
    isFileOpened,
    setMonacoInstance,
    openFile,
    closeFile,
    saveFile,
    switchActiveFile,
    closeAllFiles
  };
});