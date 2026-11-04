<!-- ==== FILE: src/renderer/views/DataClean/components/common/JsonViewer.vue ==== -->
<template>
  <div ref="editorRef" class="json-viewer-host" :style="{ height }"></div>
</template>

<script setup>
  import { ref, onMounted, onBeforeUnmount, watch, nextTick } from "vue"
  import { EditorView, lineNumbers } from "@codemirror/view"
  import { EditorState } from "@codemirror/state"
  import { json } from "@codemirror/lang-json"

  const props = defineProps({
    value: { type: String, default: "" },
    height: { type: String, default: "auto" }, // auto 时根据行数撑开
    maxHeight: { type: String, default: "250px" },
  })

  const editorRef = ref(null)
  let cmView = null

  function createEditor() {
    if (!editorRef.value) return
    if (cmView) {
      cmView.destroy()
    }

    const state = EditorState.create({
      doc: props.value,
      extensions: [
        lineNumbers(),
        json(),
        EditorView.editable.of(false),
        EditorView.theme({
          "&": {
            height: "100%",
            maxHeight: props.maxHeight,
            fontSize: "12px",
            backgroundColor: "transparent",
            border: "none",
          },
          ".cm-content": { fontFamily: "Consolas, monospace", padding: "4px 0" },
          ".cm-line": { padding: "0 8px" },
          ".cm-scroller": { overflow: "auto" },
          "&.cm-focused": { outline: "none" },
          ".cm-gutters": {
            backgroundColor: "transparent",
            color: "#94a3b8",
            borderRight: "1px solid var(--dc-border)",
          },
        }),
      ],
    })

    cmView = new EditorView({
      state,
      parent: editorRef.value,
    })
  }

  onMounted(() => {
    nextTick(() => createEditor())
  })

  onBeforeUnmount(() => {
    if (cmView) cmView.destroy()
  })

  // 核心修复：监听变化，如果内容变了，直接重新初始化（因为只读模式，直接重建最快且不会丢失高亮）
  watch(
    () => props.value,
    () => {
      nextTick(() => createEditor())
    },
  )
</script>

<style scoped>
  .json-viewer-host {
    width: 100%;
    overflow: hidden;
    /* 不要边框，不要背景，融入外层 */
    background: transparent;
  }
</style>
