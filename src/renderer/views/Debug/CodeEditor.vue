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
// 延迟导入Monaco，避免首屏卡顿
import * as monaco from "monaco-editor";

// 初始化Store
const editorStore = useEditorStore();
// 标记Monaco为原始对象，避免Vue响应式劫持导致卡顿
editorStore.setMonacoInstance(markRaw(monaco));

// 编辑器相关引用
const editorContainer = ref(null);
let editor = null;
const isLoading = ref(false); // 加载状态

// 监听激活文件变化，按需创建/更新编辑器
const unwatchActiveFile = watch(
  () => editorStore.activeFileId,
  async (newFileId) => {
    // 1. 无激活文件：销毁编辑器
    if (!newFileId || !editorStore.activeFile) {
      if (editor) {
        editor.dispose();
        editor = null;
      }
      isLoading.value = false;
      return;
    }

    isLoading.value = true;
    // 2. 容器不存在：等待DOM渲染完成
    if (!editorContainer.value) {
      await nextTick();
      if (!editorContainer.value) {
        isLoading.value = false;
        return;
      }
    }

    try {
      // 3. 首次创建：初始化编辑器实例（优化配置）
      if (!editor) {
        // 禁用Monaco不必要的功能，减少卡顿
        monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
          noSemanticValidation: true,
          noSyntaxValidation: true,
        });
        monaco.languages.javascript.javascriptDefaults.setDiagnosticsOptions({
          noSemanticValidation: true,
          noSyntaxValidation: true,
        });

        editor = monaco.editor.create(editorContainer.value, {
          theme: "vs-dark",
          minimap: { enabled: false },
          fontSize: 14,
          automaticLayout: true,
          scrollBeyondLastLine: false,
          readOnly: true, // 先设为只读，避免编辑卡顿
          scrollbar: {
            vertical: "visible",
            horizontal: "auto",
          },
          // 禁用冗余功能
          hover: { enabled: false },
          suggest: { enabled: false },
        });
        // 强制触发编辑器布局
        editor.layout();
      }

      // 4. 异步更新Model，避免阻塞UI
      await nextTick();
      if (editorStore.activeFile?.model) {
        console.log("显示文本内容...", editorStore.openFiles.length);
        // 标记Model为原始对象，避免Vue劫持
        const model = markRaw(editorStore.activeFile.model);
        editor.setModel(model);
        // 强制刷新布局
        editor.layout();
        // 恢复可编辑（可选）
        editor.updateOptions({ readOnly: false });
      }
      isLoading.value = false;
    } catch (error) {
      console.error("编辑器操作失败:", error);
      isLoading.value = false;
    }
  },
  {
    immediate: true,
    flush: "post", // 延迟到DOM更新后执行，避免卡顿
    deep: false, // 关闭深度监听，提升性能
  }
);

// 切换标签页（防抖处理）
const handleTabClick = (fileId) => {
  if (!fileId) return;
  // 防抖：避免快速点击导致卡顿
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

// 窗口大小变化时强制更新布局
const handleResize = () => {
  if (editor) editor.layout();
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
