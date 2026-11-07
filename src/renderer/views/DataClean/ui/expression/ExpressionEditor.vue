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
  import { EditorState, Compartment } from "@codemirror/state"
  import { defaultKeymap } from "@codemirror/commands"
  import { StreamLanguage, syntaxHighlighting, HighlightStyle } from "@codemirror/language"
  import { tags } from "@lezer/highlight"

  const props = defineProps({
    modelValue: { type: String, default: "" },
    columns: { type: Array, default: () => [] },
    error: { type: String, default: "" },
  })
  const emit = defineEmits(["update:modelValue"])

  const editorRef = ref(null)
  let view = null
  const themeCompartment = new Compartment()

  // 自定义词法解析器
  const dataCleanLang = StreamLanguage.define({
    token(stream) {
      if (stream.match(/^"[^"]*"/)) return "string"
      if (stream.match(/^(AND|OR|NOT|CONTAINS|STARTSWITH|ENDSWITH|IS NULL|IS NOT NULL)\b/i))
        return "keyword"
      if (stream.match(/^(=|!=|>=|<=|>|<|&&|\|\|)/)) return "operator"
      if (stream.match(/^\d+(\.\d+)?/)) return "number"
      if (stream.match(/^[a-zA-Z_\u4e00-\u9fa5][\w.\[\]]*/)) {
        const word = stream.current()
        const rootWord = word.split(".")[0].split("[")[0]
        if (props.columns.some(c => c.name === rootWord)) {
          return "variableName.special"
        }
        return "variableName"
      }
      if (stream.match(/^[()]/)) return "bracket"
      stream.next()
      return null
    },
  })

  // 亮色主题高亮映射
  const lightHighlight = HighlightStyle.define([
    { tag: tags.string, color: "#059669" },
    { tag: tags.keyword, color: "#0284c7", fontWeight: "bold" },
    { tag: tags.operator, color: "#ea580c" },
    { tag: tags.number, color: "#9333ea" },
    { tag: tags.variableName, color: "#334155" },
    { tag: tags.special(tags.variableName), color: "#2563eb", fontWeight: "bold" },
    { tag: tags.bracket, color: "#64748b" },
  ])

  // 暗色主题高亮映射
  const darkHighlight = HighlightStyle.define([
    { tag: tags.string, color: "#34d399" },
    { tag: tags.keyword, color: "#38bdf8", fontWeight: "bold" },
    { tag: tags.operator, color: "#fb923c" },
    { tag: tags.number, color: "#c084fc" },
    { tag: tags.variableName, color: "#cbd5e1" },
    { tag: tags.special(tags.variableName), color: "#60a5fa", fontWeight: "bold" },
    { tag: tags.bracket, color: "#94a3b8" },
  ])

  // 基础 UI 样式（背景、字体、行高）
  const baseTheme = EditorView.theme({
    "&": { height: "100%", minHeight: "80px", maxHeight: "200px", fontSize: "12px" },
    ".cm-content": { fontFamily: "Consolas, monospace", padding: "4px 0" },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { overflow: "auto" },
  })

  // 亮色/暗色背景
  const lightTheme = EditorView.theme(
    {
      "&": { backgroundColor: "#ffffff" },
      ".cm-content": { color: "#334155" },
    },
    { dark: false },
  )

  const darkTheme = EditorView.theme(
    {
      "&": { backgroundColor: "#0f172a" },
      ".cm-content": { color: "#f8fafc" },
    },
    { dark: true },
  )

  function getThemeExtension() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark"
    return [
      isDark ? darkTheme : lightTheme,
      syntaxHighlighting(isDark ? darkHighlight : lightHighlight),
    ]
  }

  onMounted(() => {
    const state = EditorState.create({
      doc: props.modelValue,
      extensions: [
        keymap.of(defaultKeymap),
        dataCleanLang, // 解析器
        EditorView.lineWrapping, // 自动换行
        placeholder('例如：sel_level = "Major" AND sel_para > 0'),
        baseTheme,
        themeCompartment.of(getThemeExtension()), // 动态主题区
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            emit("update:modelValue", update.state.doc.toString())
          }
        }),
        EditorView.baseTheme({
          ".cm-placeholder": { color: "#94a3b8" },
        }),
      ],
    })

    view = new EditorView({ state, parent: editorRef.value })
  })

  onBeforeUnmount(() => {
    if (view) view.destroy()
  })

  // 监听外部值变化
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

  // 监听全局暗黑模式变化，实时切换高亮
  const observer = new MutationObserver(() => {
    if (view) {
      view.dispatch({
        effects: themeCompartment.reconfigure(getThemeExtension()),
      })
    }
  })

  onMounted(() => {
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    })
  })

  onBeforeUnmount(() => {
    observer.disconnect()
  })
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
    flex: 1;
    overflow: hidden;
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
