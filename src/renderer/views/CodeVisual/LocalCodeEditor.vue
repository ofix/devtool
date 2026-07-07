<template>
  <div class="code-editor-container">
    <!-- 标签页头部 -->
    <div class="tabs-header">
      <div
        v-for="file in editorStore.openFiles"
        :key="file.id"
        class="tab-item"
        :class="{
          active: file.id === editorStore.activeFileId,
          dirty: file.isDirty,
        }"
        @click="onTabClick(file.id)"
      >
        <span>{{ file.filename }}</span>
        <span class="close-btn" @click.stop="onCloseFile(file.id)">×</span>
      </div>
    </div>

    <!-- 添加loading状态 + 强制渲染容器 -->
    <div
      ref="editorContainer"
      class="editor-content"
      v-if="editorStore.activeFile"
      style="position: relative; z-index: 1"
    >
      <div v-if="isLoading" class="editor-loading">加载中...</div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick, markRaw } from "vue";
import { useLocalEditorStore } from "@/stores/StoreLocalEditor.js";
import * as monaco from "monaco-editor";
import { useTheme } from "@/theme/ThemeManager.js";
const { theme, toggleTheme } = useTheme();

const editorStore = useLocalEditorStore();
// 标记Monaco为原始对象，避免Vue响应式劫持导致卡顿
editorStore.setMonacoInstance(markRaw(monaco));

const editorContainer = ref(null);
const isLoading = ref(false);
let editor = null;
let editorResizeObserver = null;
let stopThemeWatch = null; // 应用主题监听

// 防抖函数
const debounce = (fn, delay) => {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

// 节流触发布局
const throttle = (fn, delay) => {
  let lastCall = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      fn(...args);
      lastCall = now;
    }
  };
};

// 绑定容器Resize监听
function bindEditorResizeObserver() {
  if (editorResizeObserver) {
    editorResizeObserver.disconnect();
    editorResizeObserver = null;
  }
  const dom = editorContainer.value;
  if (!dom) return;
  editorResizeObserver = new ResizeObserver(() => {
    onResize();
  });
  editorResizeObserver.observe(dom);
}

// 异步切换Model的防抖方法
const switchEditorModel = debounce(async (newFileId) => {
  if (!newFileId || !editorStore.activeFile) {
    if (editor) {
      editor.dispose();
      editor = null;
    }
    // 销毁监听
    if (editorResizeObserver) {
      editorResizeObserver.disconnect();
      editorResizeObserver = null;
    }
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  await nextTick();
  if (!editorContainer.value) {
    isLoading.value = false;
    return;
  }

  try {
    if (!editor) {
      editor = monaco.editor.create(editorContainer.value, {
        theme: theme.value === "dark" ? "vs-dark" : "vs",
        minimap: {
          enabled: true, // 启用迷你地图
          position: "right", // 位置（right/bottom）
          side: "right", // 侧边（匹配VS Code）
          size: "proportional", // 大小（proportional/fill）
          scale: 1, // 缩放比例
          showSlider: "always", // 滑块显示时机
          maxColumn: 80, // 迷你地图最大列数
        },
        fontSize: 14,
        automaticLayout: false, // 关闭自动布局，手动触发
        scrollBeyondLastLine: false,
        readOnly: true,
        scrollbar: { vertical: "visible", horizontal: "auto" },
        hover: { enabled: false },
        suggest: { enabled: false },
        tabSize: 2,
        insertSpaces: true,
        // 禁用所有语言服务，彻底避免Worker阻塞
        disableLayerHinting: true,
        hideCursorInOverviewRuler: true,
        overviewRulerLanes: 0,
      });
      // 创建编辑器后绑定尺寸监听
      bindEditorResizeObserver();
      // 编辑器创建完成同步一次主题
      syncEditorTheme(theme.value);
    }

    // 异步创建Model（避免同步阻塞）
    const model = await editorStore.createModelAsync(newFileId);
    if (model && !model.isDisposed()) {
      editor.setModel(model);
      editor.updateOptions({ readOnly: false });
      // 手动触发布局（仅一次）
      editor.layout();
    }
    isLoading.value = false;
  } catch (error) {
    console.error("编辑器操作失败:", error);
    isLoading.value = false;
  }
}, 100); // 100ms防抖，避免快速切换

// 改造监听逻辑
const unwatchActiveFile = watch(
  () => editorStore.activeFileId,
  (newFileId) => switchEditorModel(newFileId), // 调用防抖方法
  { immediate: true, flush: "post", deep: false }
);

stopThemeWatch = watch(theme, (newThemeVal) => {
  syncEditorTheme(newThemeVal);
});

const onResize = throttle(() => {
  if (editor) editor.layout();
}, 200); // 200ms节流

// 同步monaco主题
const syncEditorTheme = (appTheme) => {
  if (!editor) return;
  const monacoTheme = appTheme === "dark" ? "vs-dark" : "vs";
  // 全局设置主题，会重新Token染色、更新所有编辑器实例高亮
  monaco.editor.setTheme(monacoTheme);
  // 同步更新当前editor配置，兜底UI面板（可选）
  editor.updateOptions({ theme: monacoTheme });
};

// 切换标签页,防抖处理
const onTabClick = (fileId) => {
  if (!fileId) return;
  clearTimeout(window.tabClickTimer);
  window.tabClickTimer = setTimeout(() => {
    editorStore.switchActiveFile(fileId);
  }, 50);
};

// 关闭文件
const onCloseFile = (fileId) => {
  if (!fileId) return;
  if (editorStore.isFileDirty(fileId)) {
    const success = editorStore.closeFile(
      fileId,
      confirm("文件可能未保存，确定关闭？")
    );
    if (success) {
      editorStore.saveFile(fileId);
    }
  }
  if (editorStore.openFiles.length === 0 && editor) {
    editor.dispose();
    editor = null;
  }
};

// 保存当前文件
const handleSaveFile = async () => {
  const activeFile = editorStore.activeFile;
  if (!activeFile) return;

  try {
    // 从编辑器获取最新内容
    await editorStore.saveFile(
      activeFile.path,
      editor?.getValue() ?? activeFile.content
    );
  } catch (error) {
    console.error("保存异常:", error);
  }
};

// 键盘快捷键：Ctrl+S
const onKeyDown = (event) => {
  // Ctrl+S (Windows/Linux) 或 Cmd+S (Mac)
  if ((event.ctrlKey || event.metaKey) && event.key === "s") {
    event.preventDefault();
    handleSaveFile();
  }
};

onMounted(() => {
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", onKeyDown);
});

onUnmounted(() => {
  window.removeEventListener("resize", onResize);
  window.removeEventListener("keydown", onKeyDown);
  clearTimeout(window.tabClickTimer);
  unwatchActiveFile();
  // 销毁容器尺寸变化监听器
  if (editorResizeObserver) {
    editorResizeObserver.disconnect();
    editorResizeObserver = null;
  }
  if (editor) {
    editor.dispose();
    editor = null;
  }
  // 销毁主题监听，释放资源
  if (stopThemeWatch) {
    stopThemeWatch();
    stopThemeWatch = null;
  }
  // 清理所有Model，避免内存泄漏
  monaco.editor.getModels().forEach((model) => {
    if (!model.isDisposed()) model.dispose();
  });
  editorStore.closeAllFiles(true);
});
</script>

<style scoped>
.code-editor-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 200px;
  background: var(--dt-primary-bg-color);
  /* 关键：禁用过渡动画，避免卡顿 */
  transition: none !important;
}
.editor-content {
  flex: 1;
  background: #1e1e1e;
  min-height: 170px;
  width: 100%;
  height: 100%;
}

/* 加载状态样式 */
.editor-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #fff;
  font-size: 14px;
}

/* 关键：穿透Monaco样式，强制显示 */
:deep(.monaco-editor) {
  width: 100% !important;
  height: 100% !important;
}
:deep(.monaco-editor .overflow-guard) {
  width: 100% !important;
  height: 100% !important;
}
</style>

<style>
.tabs-header {
  display: flex;
  padding: 4px;
  background: var(--dt-primary-bg-color);
  z-index: 2;
}

.tab-item {
  padding: 6px 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  user-select: none;
  border: 1px solid var(--dt-border-color);
  border-left: none;
}

.tab-item:first-child {
  border-left: 1px solid var(--dt-border-color);
}

.tab-item.active {
  color: var(--dt-primary-text-color);
  border-top: 1px solid var(--dt-hilight-bg-color);
}

.tab-item.dirty::after {
  content: "*";
  color: #ffcc00;
  margin-left: 4px;
}

.close-btn {
  width: 16px;
  height: 16px;
  line-height: 16px;
  text-align: center;
  border-radius: 4px;
  background: var(--dt-primary-bg-color);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s;
}
</style>
