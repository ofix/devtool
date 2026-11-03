<template>
  <div class="json-preview-container">
    <!-- 左侧：Schema 导航树 -->
    <div class="json-sidebar" :style="{ width: sidebarWidth + 'px' }">
      <div class="sidebar-toolbar">
        <div class="toolbar-left">
          <el-button link size="small" @click="toggleExpandAll">
            {{ isAllExpanded ? "全部折叠" : "全部展开" }}
          </el-button>
        </div>
        <el-input
          v-model="searchText"
          size="small"
          placeholder="搜索字段..."
          clearable
          prefix-icon="Search"
          class="search-input"
        />
      </div>

      <div class="schema-tree-wrapper dc-custom-scrollbar">
        <el-tree
          ref="treeRef"
          :data="schemaTree"
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
              <span v-if="data.depth > 0" class="depth-badge">[+{{ data.depth }}]</span>
            </span>
          </template>
        </el-tree>
      </div>
    </div>

    <!-- 拖拽分割线 -->
    <div class="resizer" @mousedown="startResize"></div>

    <!-- 右侧：数据视图 -->
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
        <!-- Raw 模式 -->
        <div v-if="isRawMode" ref="rawEditorRef" class="raw-editor-host"></div>

        <!-- Tree 模式 -->
        <div v-else class="tree-viewer-wrapper">
          <vue-json-pretty
            :data="rawData"
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
  import { ref, computed, watch, onBeforeUnmount, nextTick } from "vue"
  import VueJsonPretty from "vue-json-pretty"
  import "vue-json-pretty/lib/styles.css"
  import { EditorView, lineNumbers } from "@codemirror/view"
  import { EditorState } from "@codemirror/state"
  import { json } from "@codemirror/lang-json"

  const props = defineProps({
    dataset: { type: Object, required: true },
    rawData: { type: Array, default: () => [] },
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

  // 过滤与树操作
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

  // 拖拽
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

  // 核心：CodeMirror 初始化
  const rawFormattedJson = computed(() => {
    try {
      return JSON.stringify(props.rawData, null, 2)
    } catch (e) {
      return "// JSON 格式化失败"
    }
  })

  function initCodeMirror() {
    if (!rawEditorRef.value) return
    if (cmView) cmView.destroy()

    // 使用原生轻量级主题，不引入任何高阶高亮扩展，确保绝对不会报错
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
      extensions: [
        lineNumbers(),
        json(), // 借助 lang-json 自带的 token 类名，用 CSS 上色
        customTheme,
        EditorView.editable.of(false),
      ],
    })

    cmView = new EditorView({
      state,
      parent: rawEditorRef.value,
    })
  }

  watch(
    [isRawMode, rawFormattedJson],
    () => {
      if (isRawMode.value) {
        nextTick(() => {
          initCodeMirror()
        })
      }
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    if (cmView) cmView.destroy()
  })

  // Schema 提取
  const schemaTree = computed(() => {
    if (!props.rawData || props.rawData.length === 0) return []
    const root = { label: "root", typeLabel: "{}", path: "root", depth: 0, children: new Map() }
    const sample = props.rawData.slice(0, 100)
    for (const item of sample) traverse(item, root.children, "root")

    function mapToArray(childrenMap) {
      const arr = []
      for (const [key, node] of childrenMap.entries()) {
        let typeLabel = "string"
        let depth = 0
        if (Array.isArray(node.value)) {
          typeLabel = "[]"
          let current = node.value
          while (Array.isArray(current) && current.length > 0) {
            depth++
            current = current[0]
          }
        } else if (typeof node.value === "object" && node.value !== null) {
          typeLabel = "{}"
        } else {
          typeLabel = typeof node.value
        }
        arr.push({
          label: node.key,
          typeLabel,
          depth,
          path: node.path,
          children: mapToArray(node.children),
        })
      }
      return arr
    }
    return mapToArray(root.children)
  })

  function traverse(obj, childrenMap, parentPath) {
    if (obj === null || obj === undefined) return
    if (Array.isArray(obj)) {
      for (const item of obj) traverse(item, childrenMap, parentPath)
    } else if (typeof obj === "object") {
      for (const [key, val] of Object.entries(obj)) {
        const currentPath = parentPath === "root" ? key : `${parentPath}.${key}`
        if (!childrenMap.has(key)) {
          childrenMap.set(key, { key, value: val, path: currentPath, children: new Map() })
        }
        traverse(val, childrenMap.get(key).children, currentPath)
      }
    }
  }

  function onNodeClick(data) {
    console.log("点击了 Schema 路径:", data.path)
  }
</script>

<style scoped>
  /* 局部布局样式 */
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
  .toolbar-left {
    flex-shrink: 0;
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
  .custom-tree-node .depth-badge {
    background: rgba(139, 92, 246, 0.1);
    color: #8b5cf6;
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 3px;
  }
</style>

<style>
  /* 全局穿透样式 */
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

  /* CodeMirror 滚动条接管 */
  .viewer-content .cm-scroller {
    overflow: auto !important;
  }

  /* 原生 CSS 语法高亮 */
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
