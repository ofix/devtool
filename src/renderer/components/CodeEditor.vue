<!-- src/renderer/components/CodeEditor.vue -->
<template>
  <div ref="editorRef" style="width: 100%; height: 100%"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import loader from '@monaco-editor/loader';

// 配置Monaco CDN（避免打包体积过大）
loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });

const props = defineProps({
  content: { type: String, default: '' },
  language: { type: String, default: 'javascript' } // 接收文件树传递的语言标识
});

const emit = defineEmits(['content-change']);

const editorRef = ref(null);
let editor = null;

onMounted(async () => {
  const monaco = await loader.init();

  // 创建编辑器实例（自动根据language高亮）
  editor = monaco.editor.create(editorRef.value, {
    value: props.content,
    language: props.language, // 关键：传递文件对应的语言
    theme: 'vs-dark',
    automaticLayout: true, // 自适应布局
    minimap: { enabled: true },
    fontSize: 14,
    tabSize: 2
  });

  // 监听内容变化
  editor.onDidChangeModelContent(() => {
    emit('content-change', editor.getValue());
  });
});

// 监听语言/内容变化（切换文件时更新）
watch([() => props.content, () => props.language], ([newContent, newLang]) => {
  if (editor) {
    if (editor.getValue() !== newContent) {
      editor.setValue(newContent);
    }
    editor.getModel().setLanguage(newLang); // 切换语言，自动重新高亮
  }
});

onUnmounted(() => {
  editor?.dispose();
});
</script>
