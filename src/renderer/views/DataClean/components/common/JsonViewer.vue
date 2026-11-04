<template>
  <div ref="editorRef" class="json-viewer-host dc-custom-scrollbar"></div>
</template>

<script setup>
  import { ref, onMounted, onBeforeUnmount, watch } from "vue"
  import { EditorView, lineNumbers } from "@codemirror/view"
  import { EditorState } from "@codemirror/state"
  import { json } from "@codemirror/lang-json"

  const props = defineProps({
    value: { type: String, default: "" },
    maxHeight: { type: String, default: "250px" },
  })

  const editorRef = ref(null)
  let cmView = null

  function initEditor() {
    if (!editorRef.value) return
    if (cmView) cmView.destroy()

    const state = EditorState.create({
      doc: props.value,
      extensions: [
        lineNumbers(),
        json(),
        EditorView.editable.of(false), // 只读
        EditorView.theme({
          "&": {
            height: "100%",
            maxHeight: props.maxHeight,
            fontSize: "12px",
            backgroundColor: "transparent",
          },
          ".cm-content": { fontFamily: "Consolas, monospace", padding: "8px 0" },
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

  onMounted(() => initEditor())
  onBeforeUnmount(() => {
    if (cmView) cmView.destroy()
  })

  watch(
    () => props.value,
    newVal => {
      if (cmView && newVal !== cmView.state.doc.toString()) {
        cmView.dispatch({
          changes: { from: 0, to: cmView.state.doc.length, insert: newVal },
        })
      }
    },
  )
</script>

<style scoped>
  .json-viewer-host {
    width: 100%;
    overflow: hidden;
    border: 1px solid var(--dc-border);
    border-radius: 4px;
    background: var(--dc-canvas-bg);
  }
</style>
