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
        @click="handleTabClick(file.id)"
      >
        <span>{{ file.extractFileName }}</span>
        <span class="close-btn" @click.stop="handleCloseFile(file.id)">×</span>
      </div>
    </div>

    <!-- 关键：添加loading状态 + 强制渲染容器 -->
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
import { useEditorStore } from "@/stores/StoreEditor.js";
import * as monaco from "monaco-editor";

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

const editorStore = useEditorStore();
// 标记Monaco为原始对象，避免Vue响应式劫持导致卡顿
editorStore.setMonacoInstance(markRaw(monaco));

const editorContainer = ref(null);
let editor = null;
const isLoading = ref(false);

// 异步切换Model的防抖方法
const switchEditorModel = debounce(async (newFileId) => {
  if (!newFileId || !editorStore.activeFile) {
    if (editor) {
      editor.dispose();
      editor = null;
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
        theme: "vs-dark",
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
        // 禁用所有语言服务，彻底避免Worker阻塞
        disableLayerHinting: true,
        hideCursorInOverviewRuler: true,
        overviewRulerLanes: 0,
      });
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

const handleResize = throttle(() => {
  if (editor) editor.layout();
}, 200); // 200ms节流

// 切换标签页,防抖处理
const handleTabClick = (fileId) => {
  if (!fileId) return;
  clearTimeout(window.tabClickTimer);
  window.tabClickTimer = setTimeout(() => {
    editorStore.switchActiveFile(fileId);
  }, 50);
};

// 关闭文件
const handleCloseFile = (fileId) => {
  if (!fileId) return;
  const success = editorStore.closeFile(
    fileId,
    confirm("文件可能未保存，确定关闭？")
  );
  if (success && editorStore.openFiles.length === 0 && editor) {
    editor.dispose();
    editor = null;
  }
};

onMounted(() => {
  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
  clearTimeout(window.tabClickTimer);
  unwatchActiveFile();
  if (editor) {
    editor.dispose();
    editor = null;
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
  /* 关键：禁用过渡动画，避免卡顿 */
  transition: none !important;
}

.tabs-header {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: #252526;
  z-index: 2;
}

.tab-item {
  padding: 6px 12px;
  background: #3c3c3c;
  color: #ccc;
  border-radius: 4px 4px 0 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  user-select: none;
}

.tab-item.active {
  background: #1e1e1e;
  color: #fff;
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
  border-radius: 50%;
  background: #555;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.close-btn:hover {
  background: #ff4444;
}

.editor-content {
  flex: 1;
  background: #1e1e1e;
  min-height: 170px;
  /* 关键：强制容器渲染 */
  display: block !important;
  overflow: hidden;
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
