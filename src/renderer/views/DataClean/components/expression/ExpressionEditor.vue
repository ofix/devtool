<!-- 基于 CodeMirror 6 的表达式编辑器 -->
<!-- 提供了简单的高亮和占位符，未引入完整的 SQL 语言包以保持轻量 -->
<template>
  <div class="expr-editor-wrap">
    <div ref="editorRef" class="cm-host"></div>
    <div v-if="error" class="expr-error">{{ error }}</div>
  </div>
</template>

<script setup>
  import { ref, onMounted, onBeforeUnmount, watch } from "vue"
  import { EditorView, keymap, placeholder } from "@codemirror/view"
  import { EditorState } from "@codemirror/state"
  import { defaultKeymap } from "@codemirror/commands"
  import { StreamLanguage } from "@codemirror/language"
  import { javascript } from "@codemirror/lang-javascript" // 暂借 JS 语法高亮，后面可替换自定义

  const props = defineProps({
    modelValue: { type: String, default: "" },
    error: { type: String, default: "" },
  })
  const emit = defineEmits(["update:modelValue"])

  const editorRef = ref(null)
  let view = null

  onMounted(() => {
    const state = EditorState.create({
      doc: props.modelValue,
      extensions: [
        keymap.of(defaultKeymap),
        javascript(), // 简单的语法高亮
        placeholder('输入条件，例如：sel_level = "Major" AND sel_para > 0'),
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            emit("update:modelValue", update.state.doc.toString())
          }
        }),
        EditorView.theme({
          "&": { height: "100%", fontSize: "12px" },
          ".cm-content": { fontFamily: "Consolas, monospace" },
          "&.cm-focused": { outline: "none" },
        }),
      ],
    })

    view = new EditorView({ state, parent: editorRef.value })
  })

  onBeforeUnmount(() => {
    if (view) view.destroy()
  })

  // 外部值改变时同步（例如切换可视化模式）
  watch(
    () => props.modelValue,
    newVal => {
      if (!view) return
      const current = view.state.doc.toString()
      if (newVal !== current) {
        view.dispatch({
          changes: { from: 0, to: current.length, insert: newVal },
        })
      }
    },
  )
</script>

<style scoped>
  .expr-editor-wrap {
    border: 1px solid var(--dc-border, #e2e8f0);
    border-radius: 4px;
    overflow: hidden;
    background: var(--dc-node-bg, #fff);
    display: flex;
    flex-direction: column;
  }
  .cm-host {
    height: 60px;
    overflow-y: auto;
  }
  .cm-host:focus-within {
    border-color: var(--dc-edge-selected, #3b82f6);
  }
  .expr-error {
    font-size: 11px;
    color: #ef4444;
    padding: 4px 8px;
    background: #fef2f2;
    border-top: 1px solid #fee2e2;
  }
</style>
