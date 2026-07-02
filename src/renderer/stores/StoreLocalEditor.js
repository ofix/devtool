import { defineStore } from 'pinia'
import { ref, computed, markRaw } from 'vue'
import * as monaco from 'monaco-editor'

// 生成文件唯一ID
const generateFileId = (path) => `${path}`;

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
        json: 'json',
        c: 'cpp',
        h: 'cpp',
        cpp: 'cpp',
        php: 'php',
        java: 'java',
        dart: 'dart',
        py: 'python',
        sh: 'shell'
    };
    return languageMap[ext] || 'plaintext';
};

export const useLocalEditorStore = defineStore('editor', () => {
    const openFiles = ref([]);
    const activeFileId = ref('');
    const monacoInstance = ref(monaco);
    // 非响应式Map存储Model（避免Vue劫持）
    const modelMap = new Map(); // key: fileId, value: model

    // 计算属性
    const activeFile = computed(() => {
        if (!activeFileId.value) return null;
        return openFiles.value.find(file => file.id === activeFileId.value);
    });

    const isFileOpened = computed(() => {
        return (path) => {
            const id = generateFileId(path);
            return openFiles.value.some(file => file.id === id);
        };
    });

    const setMonacoInstance = (monaco) => {
        monacoInstance.value = monaco;
    };

    const extractFileName = (filePath) => {
        return filePath.split(/[\\/]/).pop() || filePath;
    }

    const openFile = (fileInfo) => {
        if (!monacoInstance.value) {
            console.error('Monaco实例未初始化！');
            return null;
        }

        const {
            path,
            content = '',
        } = fileInfo;

        const fileId = generateFileId(path);
        const existingFile = openFiles.value.find(file => file.id === fileId);

        // 已打开则激活
        if (existingFile) {
            activeFileId.value = fileId;
            return existingFile;
        }

        let filename = extractFileName(path);

        // 添加文件
        const newFile = {
            id: fileId,
            path,
            filename,
            isDirty: false,
            content,
            model: null, // 初始为null，激活时创建
            modelUri: path
                ? monacoInstance.value.Uri.file(path)
                : monacoInstance.value.Uri.parse(`inmemory://${path}`)
        };
        openFiles.value.push(newFile);
        activeFileId.value = fileId;
        return newFile;
    };


    // 打开文件的时候，编辑器异步添加model，避免界面卡顿
    const createModelAsync = async (fileId) => {
        if (modelMap.has(fileId)) return modelMap.get(fileId);
        const file = openFiles.value.find(f => f.id === fileId);
        if (!file) return null;

        return new Promise((resolve) => {
            setTimeout(() => {
                const language = getLanguageByFileName(file.path);
                const model = monacoInstance.value.editor.createModel(
                    file.content,
                    language,
                    file.modelUri
                );
                modelMap.set(fileId, markRaw(model));
                // 监听内容变化（直接操作Map，不触发响应式）
                model.onDidChangeContent(() => {
                    queueMicrotask(() => {
                        const file = openFiles.value.find(f => f.id === fileId);
                        if (file) file.isDirty = true;
                    });
                });
                resolve(model);
            }, 0);
        });
    };

    const closeFile = (fileId, forceClose = false) => {
        const fileIndex = openFiles.value.findIndex(file => file.id === fileId);
        if (fileIndex === -1) return false;

        const file = openFiles.value[fileIndex];
        if (file.isDirty && !forceClose) return false;

        // 清理Model
        if (modelMap.has(fileId)) {
            const model = modelMap.get(fileId);
            if (!model.isDisposed()) model.dispose();
            modelMap.delete(fileId);
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
        createModelAsync,
        setMonacoInstance,
        openFile,
        closeFile,
        saveFile,
        switchActiveFile,
        closeAllFiles
    };
});