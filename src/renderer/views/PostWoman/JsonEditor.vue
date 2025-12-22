<template>
  <div ref="editorContainer" class="json-editor-container"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick, shallowRef } from "vue";
import Delete from "@/components/icons/IconDelete.vue";

// 定义组件 Props
const props = defineProps({
  // 绑定的 JSON 数据
  modelValue: {
    type: [Object, Array, String],
    default: () => "",
  },
  // 是否只读
  readOnly: {
    type: Boolean,
    default: false,
  },
  // JSON 缩进数
  indent: {
    type: Number,
    default: 2,
  },
  // 主题（vs-light/vs-dark）
  validator: (val) => ["vs-light", "vs-dark"].includes(val),
  theme: {
    type: String,
    default: "vs-light",
  },
  // 是否显示行号
  showLineNumbers: {
    type: Boolean,
    default: true,
  },
  // 是否隐藏小地图
  disableMinimap: {
    type: Boolean,
    default: true,
  },
  // 是否自动换行
  autoWrap: {
    type: Boolean,
    default: true,
  },
  // 是否启用 JSON 校验
  enableValidation: {
    type: Boolean,
    default: true,
  },
});

// 定义组件 Emits
const emit = defineEmits(["update:modelValue", "change"]);

// 编辑器容器 Ref
const editorContainer = ref(null);
// 编辑器实例 Ref（使用 shallowRef 避免深度响应式开销）
const editor = shallowRef(null);
// 格式化锁：避免初始化期间重复触发更新
const initLock = ref(false);
// Monaco 实例（无需提前赋值，异步导入后赋值）
let monaco = null;

// 格式化 JSON 数据
const formatJson = (jsonData) => {
  try {
    // 空值处理优化
    if (!jsonData || (typeof jsonData === "string" && jsonData.trim() === "")) {
      return "{}";
    }
    // 兼容字符串类型的 JSON
    const parsedData =
      typeof jsonData === "string" ? JSON.parse(jsonData) : jsonData;
    return JSON.stringify(parsedData, null, props.indent);
  } catch (error) {
    console.error("JSON 格式化失败：", error);
    return "{}";
  }
};

// 初始化 Monaco Editor（异步非阻塞优化，修正导入问题）
const initEditor = async () => {
  if (initLock.value || editor.value) return;
  initLock.value = true;

  try {
    // 修正：动态导入 Monaco（具名导出，无需 .default）
    const monacoModule = await import("monaco-editor");
    monaco = monacoModule; // 直接赋值模块对象，保留所有具名导出
    await nextTick(); // 确保容器已挂载并渲染完成

    // 使用 requestIdleCallback 或 setTimeout 让浏览器先完成UI渲染
    await new Promise((resolve) => {
      if (window.requestIdleCallback) {
        requestIdleCallback(resolve, { timeout: 100 });
      } else {
        setTimeout(resolve, 0); // 降级兼容
      }
    });

    if (!editorContainer.value) return;

    // 创建编辑器实例（此时 monaco 已存在，可正常访问 monaco.editor）
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
      // 关闭不必要的功能，减少初始化压力
      scrollbar: {
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
      },
      renderLineHighlight: "none",
      automaticLayout: false,
    });

    // 给容器添加初始化完成类，显示编辑器
    editorContainer.value.classList.add("initialized");

    // 延迟绑定事件，避免初始化期间的额外开销
    setTimeout(() => {
      if (!editor.value) return;
      editor.value.onDidChangeModelContent(() => {
        if (props.readOnly || initLock.value) return;
        try {
          const jsonStr = editor.value.getValue();
          const jsonData = JSON.parse(jsonStr);
          emit("update:modelValue", jsonData);
          emit("change", jsonData);
        } catch (error) {
          console.error("JSON 解析失败：", error);
        }
      });
    }, 0);
  } catch (error) {
    console.error("编辑器初始化失败：", error);
  } finally {
    initLock.value = false;
  }
};

// 窗口 resize 自适应（防抖优化）
let resizeTimer = null;
const handleResize = () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (editor.value) {
      editor.value.layout();
    }
  }, 100);
};

// 监听 Props 变化，更新编辑器
watch(
  () => [props.modelValue, props.indent, props.theme],
  async ([newModelValue, newIndent, newTheme]) => {
    if (!editor.value || initLock.value || !monaco) return;

    // 主题变化时更新主题
    if (editor.value.getTheme() !== newTheme) {
      monaco.editor.setTheme(newTheme);
    }

    // 数据或缩进变化时更新内容（仅只读模式下更新）
    if (!props.readOnly) return;

    await nextTick();
    const formattedJson = formatJson(newModelValue);
    if (editor.value.getValue().trim() !== formattedJson.trim()) {
      setTimeout(() => {
        if (editor.value) {
          editor.value.setValue(formattedJson);
        }
      }, 0);
    }
  },
  { deep: true, flush: "post" }
);

// 组件挂载时初始化
onMounted(() => {
  // 延迟初始化，优先渲染页面其他内容
  setTimeout(() => {
    initEditor();
  }, 100);
  window.addEventListener("resize", handleResize);
});

// 组件卸载时销毁编辑器
onUnmounted(() => {
  clearTimeout(resizeTimer);
  if (editor.value) {
    editor.value.dispose();
    editor.value = null;
  }
  monaco = null;
  window.removeEventListener("resize", handleResize);
});

// 暴露组件方法
defineExpose({
  updateJson: async (newData) => {
    if (!editor.value || initLock.value || !monaco) return;
    await nextTick();
    const formattedJson = formatJson(newData);
    setTimeout(() => {
      if (editor.value) {
        editor.value.setValue(formattedJson);
      }
    }, 0);
  },
  getJsonData: () => {
    if (!editor.value) return null;
    try {
      const jsonStr = editor.value.getValue();
      return JSON.parse(jsonStr);
    } catch (error) {
      console.error("JSON 解析失败：", error);
      return null;
    }
  },
  destroy: () => {
    clearTimeout(resizeTimer);
    if (editor.value) {
      editor.value.dispose();
      editor.value = null;
    }
    monaco = null;
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
  /* 初始化前隐藏，避免闪烁 */
  visibility: hidden;
  opacity: 0;
  transition: opacity 0.2s ease;
}

/* 初始化完成后显示 */
.json-editor-container.initialized {
  visibility: visible;
  opacity: 1;
}
</style>
