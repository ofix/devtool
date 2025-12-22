<template>
    <div ref="editorContainer" class="json-editor-container"></div>
  </template>
  
  <script setup>
  import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
  
  // 定义组件 Props
  const props = defineProps({
    // 绑定的 JSON 数据
    modelValue: {
      type: [Object, Array, String],
      default: () => ({})
    },
    // 是否只读
    readOnly: {
      type: Boolean,
      default: false
    },
    // JSON 缩进数
    indent: {
      type: Number,
      default: 2
    },
    // 主题（vs-light/vs-dark）
    theme: {
      type: String,
      default: 'vs-light',
      validator: (val) => ['vs-light', 'vs-dark'].includes(val)
    },
    // 是否显示行号
    showLineNumbers: {
      type: Boolean,
      default: true
    },
    // 是否隐藏小地图
    disableMinimap: {
      type: Boolean,
      default: true
    },
    // 是否自动换行
    autoWrap: {
      type: Boolean,
      default: true
    },
    // 是否启用 JSON 校验
    enableValidation: {
      type: Boolean,
      default: true
    }
  });
  
  // 定义组件 Emits
  const emit = defineEmits(['update:modelValue', 'change']);
  
  // 编辑器容器 Ref
  const editorContainer = ref(null);
  // 编辑器实例 Ref
  const editor = ref(null);
  // Monaco 加载状态 Ref
  const monacoLoaded = ref(false);
  
  // 格式化 JSON 数据
  const formatJson = (jsonData) => {
    try {
      return JSON.stringify(jsonData, null, props.indent);
    } catch (error) {
      console.error('JSON 格式化失败：', error);
      return '{}';
    }
  };
  
  // 初始化 Monaco Editor
  const initEditor = async () => {
    // 加载 Monaco Editor
    if (!window.require) {
      const loaderScript = document.createElement('script');
      loaderScript.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs/loader.js';
      document.head.appendChild(loaderScript);
      await new Promise((resolve) => {
        loaderScript.onload = resolve;
      });
    }
  
    // 配置 Monaco 路径
    if (!window.MonacoConfigured) {
      window.require.config({
        paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' }
      });
      window.MonacoConfigured = true;
    }
  
    // 加载编辑器核心模块
    window.require(['vs/editor/editor.main'], () => {
      monacoLoaded.value = true;
      // 创建编辑器实例
      editor.value = window.monaco.editor.create(editorContainer.value, {
        value: formatJson(props.modelValue),
        language: 'json',
        readOnly: props.readOnly,
        lineNumbers: props.showLineNumbers ? 'on' : 'off',
        minimap: { enabled: !props.disableMinimap },
        wordWrap: props.autoWrap ? 'on' : 'off',
        theme: props.theme,
        fontSize: 14,
        scrollBeyondLastLine: false,
        json: {
          validate: props.enableValidation
        }
      });
  
      // 监听编辑器内容变化，同步到父组件
      editor.value.onDidChangeModelContent(() => {
        if (props.readOnly) return;
        try {
          const jsonStr = editor.value.getValue();
          const jsonData = JSON.parse(jsonStr);
          emit('update:modelValue', jsonData);
          emit('change', jsonData);
        } catch (error) {
          console.error('JSON 解析失败：', error);
        }
      });
    });
  };
  
  // 窗口 resize 自适应
  const handleResize = () => {
    if (editor.value) {
      editor.value.layout();
    }
  };
  
  // 监听 Props 变化，更新编辑器
  watch(
    () => [props.modelValue, props.indent, props.theme],
    async ([newModelValue, newIndent, newTheme]) => {
      if (!editor.value) return;
  
      // 主题变化时更新主题
      if (editor.value.getTheme() !== newTheme) {
        window.monaco.editor.setTheme(newTheme);
      }
  
      // 数据或缩进变化时更新内容（避免编辑时重复覆盖）
      if (!props.readOnly) return;
      await nextTick();
      const formattedJson = JSON.stringify(newModelValue, null, newIndent);
      if (editor.value.getValue() !== formattedJson) {
        editor.value.setValue(formattedJson);
      }
    },
    { deep: true }
  );
  
  // 组件挂载时初始化
  onMounted(() => {
    initEditor();
    window.addEventListener('resize', handleResize);
  });
  
  // 组件卸载时销毁编辑器
  onUnmounted(() => {
    if (editor.value) {
      editor.value.dispose();
    }
    window.removeEventListener('resize', handleResize);
  });
  
  // 暴露组件方法（可选）
  defineExpose({
    // 更新 JSON 数据
    updateJson: (newData) => {
      if (editor.value) {
        const formattedJson = formatJson(newData);
        editor.value.setValue(formattedJson);
      }
    },
    // 获取当前 JSON 数据
    getJsonData: () => {
      if (!editor.value) return null;
      try {
        const jsonStr = editor.value.getValue();
        return JSON.parse(jsonStr);
      } catch (error) {
        console.error('JSON 解析失败：', error);
        return null;
      }
    },
    // 销毁编辑器
    destroy: () => {
      if (editor.value) {
        editor.value.dispose();
        editor.value = null;
      }
    }
  });
  </script>
  
  <style scoped>
  .json-editor-container {
    width: 100%;
    height: 100%;
    min-height: 400px;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
  }
  </style>