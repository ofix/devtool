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

    <!-- 编辑器容器：仅当有激活文件且容器存在时显示 -->
    <div
      ref="editorContainer"
      class="editor-content"
      v-if="editorStore.activeFile"
    ></div>
  </div>
</template>

<script setup>
import { ref, watch, onUnmounted, nextTick } from "vue";
import { useEditorStore } from "@/stores/StoreEditor.js";
import * as monaco from "monaco-editor";

// 初始化Store
const editorStore = useEditorStore();
// 注入Monaco实例到Store（关键：让Store创建Model时能用到Monaco）
editorStore.setMonacoInstance(monaco);

// 编辑器相关引用
const editorContainer = ref(null);
let editor = null;

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
      return;
    }

    // 2. 容器不存在：等待DOM渲染完成
    if (!editorContainer.value) {
      await nextTick();
      if (!editorContainer.value) return;
    }

    try {
      // 3. 首次创建：初始化编辑器实例
      if (!editor) {
        editor = monaco.editor.create(editorContainer.value, {
          theme: "vs-dark",
          minimap: { enabled: false },
          fontSize: 14,
          automaticLayout: true, // 自动适配容器大小
          scrollBeyondLastLine: false,
        });
      }

      // 4. 更新Model（关键：activeFile是计算属性，无需.value）
      if (editorStore.activeFile?.model) {
        console.log("显示文本内容...");
        editor.setModel(editorStore.activeFile.model);
      }
    } catch (error) {
      console.error("编辑器操作失败:", error);
    }
  },
  { immediate: true }
);

// 切换标签页
const handleTabClick = (fileId) => {
  if (!fileId) return;
  editorStore.switchActiveFile(fileId);
};

// 关闭文件
const handleCloseFile = (fileId) => {
  if (!fileId) return;
  const success = editorStore.closeFile(
    fileId,
    confirm("文件可能未保存，确定关闭？")
  );
  // 关闭后无文件则销毁编辑器
  if (success && editorStore.openFiles.length === 0 && editor) {
    editor.dispose();
    editor = null;
  }
};

onUnmounted(() => {
  // 取消监听
  unwatchActiveFile();
  // 销毁编辑器实例
  if (editor) {
    editor.dispose();
    editor = null;
  }
  // 清理所有Monaco Model
  monaco.editor.getModels().forEach((model) => {
    if (!model.isDisposed()) model.dispose();
  });
  // 清空Store中的文件
  editorStore.closeAllFiles(true);
});
</script>

<style scoped>
.code-editor-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  /* 确保容器有最小高度，避免DOM渲染异常 */
  min-height: 200px;
}

.tabs-header {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: #252526;
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
}

.close-btn:hover {
  background: #ff4444;
}

.editor-content {
  flex: 1;
  background: #1e1e1e;
  /* 确保编辑器容器有高度 */
  min-height: 170px;
}
</style>
