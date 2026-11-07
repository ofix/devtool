<template>
  <div class="json-preview-container">
    <div class="json-sidebar" :style="{ width: sidebarWidth + 'px' }">
      <div class="sidebar-toolbar">
        <el-button link size="small" @click="toggleExpandAll">
          {{ isAllExpanded ? "全部折叠" : "全部展开" }}
        </el-button>
        <el-input
          v-model="searchText"
          size="small"
          placeholder="搜索..."
          clearable
          prefix-icon="Search"
          class="search-input"
        />
      </div>
      <div class="schema-tree-wrapper dc-custom-scrollbar">
        <el-tree
          ref="treeRef"
          :data="jsonSchemaTree"
          :props="{ label: 'label', children: 'children' }"
          node-key="path"
          :filter-node-method="filterNode"
          @node-click="onNodeClick"
          highlight-current
          :default-expand-all="isAllExpanded"
          :expand-on-click-node="false"
        >
          <template #default="{ node, data }">
            <span class="custom-tree-node">
              <span class="label">{{ data.label }}</span>
              <span class="type">{{ data.typeLabel }}</span>
              <span v-if="data.countTag" class="count-tag">{{ data.countTag }}</span>
            </span>
          </template>
        </el-tree>
      </div>
    </div>

    <div class="resizer" @mousedown="startResize"></div>

    <div class="json-main">
      <div class="viewer-toolbar">
        <el-switch
          v-model="isRawMode"
          inline-prompt
          active-text="Raw"
          inactive-text="Tree"
          size="small"
        />
      </div>
      <div class="viewer-content dc-custom-scrollbar">
        <div v-if="isRawMode" ref="rawEditorRef" class="raw-editor-host"></div>
        <div v-else class="tree-viewer-wrapper">
          <vue-json-pretty
            :data="dataset.json"
            :deep="2"
            :show-length="true"
            :highlight-selected-node="true"
            :show-icon="true"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { ref, watch, onBeforeUnmount, nextTick, computed } from "vue"
  import VueJsonPretty from "vue-json-pretty"
  import "vue-json-pretty/lib/styles.css"
  import { EditorView, lineNumbers } from "@codemirror/view"
  import { EditorState } from "@codemirror/state"
  import { json } from "@codemirror/lang-json"

  const props = defineProps({
    dataset: { type: Object, required: true },
    jsonSchemaTree: { type: Array, default: () => [] },
  })

  const isRawMode = ref(true)
  const searchText = ref("")
  const isAllExpanded = ref(false)
  const treeRef = ref(null)
  const rawEditorRef = ref(null)
  let cmView = null

  const sidebarWidth = ref(260)
  let startX = 0
  let startWidth = 0

  watch(searchText, val => treeRef.value?.filter(val))
  function filterNode(value, data) {
    if (!value) return true
    return data.label.toLowerCase().includes(value.toLowerCase())
  }

  function toggleExpandAll() {
    isAllExpanded.value = !isAllExpanded.value
    const nodes = treeRef.value?.store.nodesMap
    if (!nodes) return
    for (const key in nodes) nodes[key].expanded = isAllExpanded.value
  }

  function startResize(e) {
    startX = e.clientX
    startWidth = sidebarWidth.value
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
  }
  function onMouseMove(e) {
    sidebarWidth.value = Math.max(180, Math.min(500, startWidth + e.clientX - startX))
  }
  function onMouseUp() {
    document.body.style.cursor = ""
    document.body.style.userSelect = ""
    window.removeEventListener("mousemove", onMouseMove)
    window.removeEventListener("mouseup", onMouseUp)
  }

  const rawFormattedJson = computed(
    () => props.dataset.formattedText || JSON.stringify(props.dataset.json, null, 2),
  )

  function initCodeMirror() {
    if (!rawEditorRef.value) return
    if (cmView) cmView.destroy()

    const customTheme = EditorView.theme({
      "&": { height: "100%", fontSize: "12px", backgroundColor: "transparent" },
      ".cm-content": { fontFamily: "Consolas, monospace", padding: "8px 0" },
      ".cm-line": { padding: "0 8px" },
      "&.cm-focused": { outline: "none" },
      ".cm-gutters": {
        backgroundColor: "transparent",
        color: "#94a3b8",
        borderRight: "1px solid var(--dc-border)",
      },
    })

    const state = EditorState.create({
      doc: rawFormattedJson.value,
      extensions: [lineNumbers(), json(), customTheme, EditorView.editable.of(false)],
    })

    cmView = new EditorView({ state, parent: rawEditorRef.value })
  }

  watch(
    [isRawMode, rawFormattedJson],
    () => {
      if (isRawMode.value) {
        nextTick(() => initCodeMirror())
      }
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    if (cmView) cmView.destroy()
  })

  // 点击左侧节点，右侧滚动
  function onNodeClick(data) {
    if (isRawMode.value && cmView && data.firstLine > 0) {
      const lineCount = cmView.state.doc.lines
      const targetLine = Math.min(data.firstLine, lineCount)
      const line = cmView.state.doc.line(targetLine)
      cmView.dispatch({
        selection: { anchor: line.from },
        effects: EditorView.scrollIntoView(line.from, { y: "center" }),
      })
    }
  }
</script>

<style scoped>
  .json-preview-container {
    display: flex;
    height: 100%;
    width: 100%;
    overflow: hidden;
    background: var(--dc-preview-bg);
  }
  .json-sidebar {
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--dc-border);
    background: var(--dc-preview-header-bg);
    min-width: 180px;
    max-width: 500px;
  }
  .sidebar-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border-bottom: 1px solid var(--dc-border);
  }
  .search-input {
    flex: 1;
  }
  .schema-tree-wrapper {
    flex: 1;
    overflow: auto;
    padding: 8px;
  }
  .json-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }
  .viewer-toolbar {
    display: flex;
    justify-content: flex-end;
    padding: 4px 12px;
    border-bottom: 1px solid var(--dc-border);
    background: var(--dc-preview-header-bg);
    flex-shrink: 0;
  }
  .viewer-content {
    flex: 1;
    overflow: auto;
    position: relative;
  }
  .resizer {
    width: 4px;
    cursor: col-resize;
    background: transparent;
    transition: background 0.2s;
    z-index: 10;
    flex-shrink: 0;
  }
  .resizer:hover,
  .resizer:active {
    background: var(--dc-edge-selected, #3b82f6);
  }
  .raw-editor-host {
    height: 100%;
    width: 100%;
    min-width: 0;
  }
  .tree-viewer-wrapper {
    padding: 16px;
    font-size: 12px;
    min-width: 0;
  }
  .custom-tree-node {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    white-space: nowrap;
  }
  .custom-tree-node .label {
    color: var(--dc-text-primary);
  }
  .custom-tree-node .type {
    color: var(--dc-text-secondary);
    font-size: 10px;
    opacity: 0.7;
  }
  .count-tag {
    background: rgba(139, 92, 246, 0.1);
    color: #8b5cf6;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 4px;
    font-family: monospace;
  }
</style>

<style>
  .schema-tree-wrapper .el-tree {
    min-width: max-content !important;
  }
  .schema-tree-wrapper .el-tree-node__content {
    padding-right: 16px;
  }
  .vjs-tree {
    font-family: "SF Mono", Consolas, monospace !important;
    background-color: transparent !important;
    font-size: 13px;
  }
  .vjs-tree-node .vjs-tree-node-arrow {
    color: #64748b !important;
    font-size: 12px;
  }
  .vjs-tree-node.is-highlight {
    background-color: rgba(59, 130, 246, 0.1) !important;
  }
  .vjs-key {
    color: #64748b !important;
  }
  .vjs-value__string {
    color: #10b981 !important;
  }
  .vjs-value__number {
    color: #8b5cf6 !important;
  }
  .vjs-value__boolean {
    color: #f59e0b !important;
  }
  .vjs-value__null {
    color: #94a3b8 !important;
  }
  .vjs-tree-node .vjs-tree-node-text {
    color: #94a3b8;
  }
  [data-theme="dark"] .vjs-key {
    color: #94a3b8 !important;
  }
  [data-theme="dark"] .vjs-tree-node .vjs-tree-node-text {
    color: #64748b;
  }
  [data-theme="dark"] .vjs-value__string {
    color: #34d399 !important;
  }
  [data-theme="dark"] .vjs-value__number {
    color: #c084fc !important;
  }
  [data-theme="dark"] .vjs-value__boolean {
    color: #fbbf24 !important;
  }
  [data-theme="dark"] .vjs-value__null {
    color: #64748b !important;
  }
  .viewer-content .cm-scroller {
    overflow: auto !important;
  }
  .cm-content .tok-propertyName {
    color: #3b82f6;
  }
  .cm-content .tok-string {
    color: #10b981;
  }
  .cm-content .tok-number {
    color: #8b5cf6;
  }
  .cm-content .tok-bool {
    color: #f59e0b;
  }
  .cm-content .tok-null {
    color: #94a3b8;
  }
  .cm-content .tok-punctuation {
    color: #64748b;
  }
  [data-theme="dark"] .cm-content .tok-propertyName {
    color: #60a5fa;
  }
  [data-theme="dark"] .cm-content .tok-string {
    color: #34d399;
  }
  [data-theme="dark"] .cm-content .tok-number {
    color: #c084fc;
  }
  [data-theme="dark"] .cm-content .tok-bool {
    color: #fbbf24;
  }
  [data-theme="dark"] .cm-content .tok-null {
    color: #64748b;
  }
</style>
