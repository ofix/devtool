<template>
  <div ref="editorContainer" class="json-editor-container"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick, shallowRef } from "vue";
import * as monaco from "monaco-editor";

const props = defineProps({
  modelValue: {
    type: [Object, Array, String],
    default: () => "",
  },
  readOnly: {
    type: Boolean,
    default: false,
  },
  indent: {
    type: Number,
    default: 4,
  },
  theme: {
    type: String,
    validator: (val) => ["vs-light", "vs-dark"].includes(val),
    default: "vs-light",
  },
  showLineNumbers: {
    type: Boolean,
    default: true,
  },
  disableMinimap: {
    type: Boolean,
    default: true,
  },
  autoWrap: {
    type: Boolean,
    default: true,
  },
  enableValidation: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(["update:modelValue", "change"]);
const editorContainer = ref(null);
const editor = shallowRef(null);
const initLock = ref(false);
const editorReady = ref(false);

const formatJson = (jsonData) => {
  try {
    if (!jsonData || (typeof jsonData === "string" && jsonData.trim() === "")) {
      return "{}";
    }
    const parsedData =
      typeof jsonData === "string" ? JSON.parse(jsonData) : jsonData;
    return JSON.stringify(parsedData, null, props.indent);
  } catch (error) {
    console.error("JSON 格式化失败：", error);
    return jsonData;
  }
};

// 初始化使用 requestIdleCallback 确保不阻塞 UI
const initEditor = async () => {
  if (initLock.value || editor.value || !editorContainer.value) return;
  initLock.value = true;

  try {
    // 等待浏览器空闲时初始化，优先保证 UI 渲染
    await new Promise((resolve) => {
      if (window.requestIdleCallback) {
        requestIdleCallback(resolve, { timeout: 200 });
      } else {
        // 降级为微任务，避免阻塞
        queueMicrotask(resolve);
      }
    });
    await nextTick();
    // 创建编辑器实例
    editor.value = monaco.editor.create(editorContainer.value, {
      value: formatJson(props.modelValue),
      language: "json",
      readOnly: props.readOnly,
      lineNumbers: props.showLineNumbers ? "on" : "off",
      minimap: { enabled: !props.disableMinimap },
      wordWrap: props.autoWrap ? "on" : "off",
      theme: props.theme,
      fontSize: 14,
      scrollBeyondLastLine: false,
      json: {
        validate: props.enableValidation,
      },
      scrollbar: {
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
      },
      renderLineHighlight: "none",
      automaticLayout: true, // 开启自动布局，无需手动监听 resize
    });

    editorContainer.value.classList.add("initialized");
    // 实例创建完成后，标记为就绪
    editorReady.value = true;
  } catch (error) {
    editorReady.value = false;
    console.error("编辑器初始化失败：", error);
  } finally {
    initLock.value = false;
  }
};

//  移除手动 resize 监听，使用 automaticLayout: true 替代
let resizeTimer = null;
const handleResize = () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (editor.value) {
      editor.value.layout();
    }
  }, 100);
};

// 监听 Props 变化
watch(
  () => [
    editorReady, // 依赖实例就绪标识
    props.modelValue,
    props.indent,
    props.theme,
  ],
  async ([isReady, newModelValue, newIndent, newTheme]) => {
    if (
      !isReady ||
      !editor.value ||
      initLock.value ||
      typeof editor.value.getTheme !== "function"
    )
      return;

    if (editor.value.getTheme() !== newTheme) {
      monaco.editor.setTheme(newTheme);
    }

    if (!props.readOnly) return;

    await nextTick();
    const formattedJson = formatJson(newModelValue);
    if (editor.value.getValue().trim() !== formattedJson.trim()) {
      queueMicrotask(() => {
        if (editor.value) {
          editor.value.setValue(formattedJson);
        }
      });
    }
  },
  {
    deep: true,
    flush: "post",
    immediate: false, // 显式声明不立即执行回调，避免组件初始化时触发
  }
);

onMounted(() => {
  // 手动配置 Monaco 环境，指定 Worker 加载路径（带 .js 后缀）
  self.MonacoEnvironment = {
    getWorkerUrl: (moduleId, label) => {
      // 明确指定 Worker 脚本的完整路径（带 .js 后缀）
      switch (label) {
        case "json":
          return new URL(
            "monaco-editor/esm/vs/language/json/json.worker.js",
            import.meta.url
          ).href;
        default:
          return new URL(
            "monaco-editor/esm/vs/editor/editor.worker.js",
            import.meta.url
          ).href;
      }
    },
  };
  // 延迟初始化，优先渲染其他组件
  setTimeout(() => {
    initEditor();
  }, 100);
  // 仅在 automaticLayout 失效时保留 resize 监听
  window.addEventListener("resize", handleResize);
});

// 组件卸载时销毁编辑器
onUnmounted(() => {
  clearTimeout(resizeTimer);
  if (editor.value) {
    editor.value.dispose();
    editor.value = null;
  }
  window.removeEventListener("resize", handleResize);
});

defineExpose({
  updateJson: async (newData) => {
    if (!editor.value || initLock.value) return;
    await nextTick();
    const formattedJson = formatJson(newData);
    queueMicrotask(() => {
      if (editor.value) {
        editor.value.setValue(formattedJson);
      }
    });
  },
  getJson: () => {
    if (!editor.value) return null;
    try {
      return editor.value.getValue();
    } catch (error) {
      console.log("getJson error: ", error);
      return "";
    }
  },
  destroy: () => {
    clearTimeout(resizeTimer);
    if (editor.value) {
      editor.value.dispose();
      editor.value = null;
    }
  },
});
</script>

<style scoped>
.json-editor-container {
  width: 100%;
  height: 100%;
  min-height: 400px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  visibility: hidden;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.json-editor-container.initialized {
  visibility: visible;
  opacity: 1;
}
</style>
