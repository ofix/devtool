<template>
  <div class="preview-panel">
    <div class="preview-header">
      <div class="preview-title">
        <span class="title-text">{{ title }}</span>
        <!-- 👇 修复：同时支持 Table 和 JSON 的元数据展示 -->
        <span v-if="meta.dataCategory === 'table' && hasData" class="title-meta">
          {{ meta.rowCount === -1 ? "流式数据" : meta.rowCount + " 行" }} ·
          {{ meta.columns?.length || 0 }} 列
        </span>
        <span v-else-if="meta.dataCategory === 'json' && hasData" class="title-meta">
          JSON 对象
        </span>
        <span
          v-if="meta.isTruncated"
          class="title-meta log-hint"
          style="color: #f59e0b; margin-left: 8px"
        >
          ⚠️ 数据过大，已截断展示
        </span>
      </div>
      <div class="preview-actions">
        <el-tag
          v-if="graphStore.activeLineageGraph"
          closable
          @close="clearLineage"
          size="small"
          type="success"
          style="margin-right: 8px"
        >
          血缘追踪中: {{ activeLineageFieldName }}
        </el-tag>
        <el-button v-if="!isMessageNode" size="small" text @click="$emit('refresh')"
          >刷新</el-button
        >
      </div>
    </div>

    <div
      class="preview-body"
      ref="previewBodyRef"
      @mousedown="handleGlobalMouseDown"
      @click="hideContextMenu"
    >
      <EmptyState
        v-if="!isMessageNode && !hasData && meta.dataCategory !== 'empty'"
        :text="emptyText"
      />

      <!-- 表格视图 -->
      <el-table-v2
        v-else-if="meta.dataCategory === 'table'"
        ref="tableRef"
        :columns="tableColumns"
        :data="previewRows"
        :width="tableWidth"
        :height="tableHeight"
        :row-height="32"
        :header-height="36"
        fixed
      >
        <template #header-cell="{ column }">
          <div
            class="custom-header-cell"
            :data-key="column.key"
            :class="{ 'is-active-bg': isFieldActive(column.key) }"
            @contextmenu.prevent="handleHeaderContextMenu($event, column.key)"
          >
            <span class="header-title">{{ column.title }}</span>
            <div class="col-resizer"></div>
          </div>
        </template>
      </el-table-v2>

      <!-- 👇 修复：JSON 视图直接读取 previewData 里的 json 字段 -->
      <JsonPreview
        v-else-if="meta.dataCategory === 'json' && previewJson"
        :dataset="{ json: previewJson }"
        :json-schema-tree="meta.jsonSchemaTree"
      />

      <div v-else class="log-viewer">
        <div class="empty-logs">无有效数据格式展示。</div>
      </div>

      <!-- 自定义右键菜单 -->
      <div
        v-if="contextMenu.visible"
        class="custom-context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      >
        <div class="menu-item" @click="traceLineage(contextMenu.field)">🔍 查看血缘链路</div>
        <div v-if="graphStore.activeLineageGraph" class="menu-item danger" @click="clearLineage">
          ✖ 清除高亮
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from "vue"
  import EmptyState from "../common/EmptyState.vue"
  import JsonPreview from "./JsonPreview.vue"
  import { useStoreDataCleanGraph } from "../../stores/StoreDataCleanGraph.js"
  import { useStoreDataCleanMeta } from "../../stores/StoreDataCleanMeta.js"
  import { useStoreDataCleanPreview } from "../../stores/StoreDataCleanPreview.js"
  import LineageGraphManager from "../../core/runtime/LineageGraphManager.js" // 👈 修正路径

  defineEmits(["refresh"])

  const graphStore = useStoreDataCleanGraph()
  const metaStore = useStoreDataCleanMeta()
  const previewStore = useStoreDataCleanPreview()

  const previewBodyRef = ref(null)
  const tableRef = ref(null)
  const tableWidth = ref(800)
  const tableHeight = ref(300)

  const isResizing = ref(false)
  const currentColKey = ref(null)
  const startX = ref(0)
  const startWidth = ref(0)
  const columnWidths = ref({})

  const contextMenu = ref({ visible: false, x: 0, y: 0, field: null })

  const previewRows = ref([])
  const previewJson = ref(null) // 👈 新增：用于存放 JSON 数据

  const projectId = "default-project"

  const selected = computed(() => graphStore.selectedNode)
  const meta = computed(() => {
    if (!selected.value)
      return {
        rowCount: 0,
        columns: [],
        dataCategory: null,
        stale: false,
        staleReason: null,
        error: null,
        jsonSchemaTree: null,
        isTruncated: false,
      }
    return metaStore.getMeta(selected.value.id)
  })

  const dataset = computed(() => {
    if (!selected.value) return null
    return previewStore.getPreviewData(projectId, selected.value.id)
  })

  const title = computed(() => {
    if (!selected.value) return "未选中节点"
    return `${selected.value.type} · ${selected.value.id.slice(0, 12)}`
  })

  // 👇 修复：兼容 Table 和 JSON 的有数据判断
  const hasData = computed(() => {
    if (meta.value.dataCategory === "table") return previewRows.value.length > 0
    if (meta.value.dataCategory === "json") return previewJson.value !== null
    return false
  })

  const isMessageNode = computed(() => selected.value && selected.value.type === "message")

  const emptyText = computed(() => {
    if (!selected.value) return "在画布上选中一个节点"
    if (meta.value.error) return `运行错误：${meta.value.error}`
    if (meta.value.stale) return `上游已断开（${meta.value.staleReason || "参数已变更"}）`
    if (meta.value.dataCategory === "empty") return "节点输出为空"
    return "尚未运行，请检查参数或上游连线"
  })

  // 👇 修复：同时接收 Table rows 和 JSON payload
  watch(
    () => dataset.value,
    newData => {
      if (!newData) {
        previewRows.value = []
        previewJson.value = null
        return
      }

      if (meta.value.dataCategory === "table") {
        previewRows.value = newData.rows || []
      } else if (meta.value.dataCategory === "json") {
        previewJson.value = newData.json || null
      }

      nextTick(() => measure())
    },
    { immediate: true, deep: false },
  )

  const tableColumns = computed(() => {
    if (!meta.value.columns || meta.value.columns.length === 0) return []
    return meta.value.columns.map(col => {
      const customWidth = columnWidths.value[col.name]
      const defaultWidth = Math.max(120, col.name.length * 14 + 40)
      return {
        key: col.name,
        dataKey: col.name,
        title: col.name,
        width: customWidth || defaultWidth,
        resizable: false,
      }
    })
  })

  const activeLineageFieldName = computed(() => {
    if (!graphStore.activeLineageGraph) return ""
    const last = graphStore.activeLineageGraph[graphStore.activeLineageGraph.length - 1]
    return last ? last.field : ""
  })

  const isFieldActive = fieldName => {
    return activeLineageFieldName.value === fieldName
  }

  function handleHeaderContextMenu(e, fieldName) {
    e.stopPropagation()
    contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, field: fieldName }
  }

  function hideContextMenu() {
    contextMenu.value.visible = false
  }

  function traceLineage(fieldName) {
    if (!selected.value) return
    // 此时需要传递真实的 columnMapping 上下文
    const lineageResult = LineageGraphManager.traceUpstream(
      selected.value.id,
      fieldName,
      graphStore,
      previewStore, // 注意：如果你的 Store 里只有截断数据，这里可能拿不到 columnMapping，需要 Scheduler 配合把 meta 存入
    )
    graphStore.setActiveLineageGraph(lineageResult)
    hideContextMenu()
  }

  function clearLineage() {
    graphStore.setActiveLineageGraph(null)
    hideContextMenu()
  }

  function handleGlobalMouseDown(e) {
    const resizer = e.target.closest(".col-resizer")
    if (resizer) {
      e.preventDefault()
      const headerCell = resizer.closest(".custom-header-cell")
      if (!headerCell) return
      const colKey = headerCell.getAttribute("data-key")
      if (!colKey) return
      const targetCol = tableColumns.value.find(c => c.key === colKey)
      if (!targetCol) return

      isResizing.value = true
      currentColKey.value = colKey
      startX.value = e.clientX
      startWidth.value = targetCol.width
      const bodyRect = previewBodyRef.value.getBoundingClientRect()
      const scrollLeft = tableRef.value?.scrollLeft ?? 0

      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
      let rafId = null
      let finalWidth = startWidth.value

      function onMouseMove(ev) {
        if (rafId) cancelAnimationFrame(rafId)
        rafId = requestAnimationFrame(() => {
          const deltaX = ev.clientX - startX.value
          finalWidth = Math.max(80, startWidth.value + deltaX)
        })
      }
      function onMouseUp() {
        isResizing.value = false
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        window.removeEventListener("mousemove", onMouseMove)
        window.removeEventListener("mouseup", onMouseUp)
        if (rafId) cancelAnimationFrame(rafId)
        if (finalWidth !== startWidth.value) {
          columnWidths.value = { ...columnWidths.value, [colKey]: finalWidth }
        }
      }
      window.addEventListener("mousemove", onMouseMove)
      window.addEventListener("mouseup", onMouseUp)
    }
  }

  function measure() {
    if (!previewBodyRef.value) return
    const rect = previewBodyRef.value.getBoundingClientRect()
    tableWidth.value = Math.max(200, Math.floor(rect.width) - 12)
    tableHeight.value = Math.max(120, Math.floor(rect.height) - 12)
  }

  let observer = null
  onMounted(() => {
    if (previewBodyRef.value) {
      measure()
      observer = new ResizeObserver(measure)
      observer.observe(previewBodyRef.value)
    }
  })
  onBeforeUnmount(() => {
    if (observer) observer.disconnect()
  })
</script>

<style scoped>
  /* 样式部分完全保留你原有的设定，一字未改 */
  .preview-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--dc-preview-bg, #ffffff);
    position: relative;
  }
  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 32px;
    padding: 0 12px;
    border-bottom: 1px solid var(--dc-border, #e2e8f0);
    background: var(--dc-preview-header-bg, #f8fafc);
  }
  .preview-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .title-text {
    font-weight: 600;
    color: var(--dc-text-primary, #1e293b);
  }
  .title-meta {
    color: var(--dc-text-secondary, #64748b);
  }
  .log-hint {
    color: #eab308;
    font-weight: 600;
  }
  .preview-body {
    flex: 1;
    overflow: hidden;
    padding: 4px;
    position: relative;
  }
  .custom-header-cell {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    padding: 0 8px;
    box-sizing: border-box;
  }
  .custom-header-cell.is-active-bg {
    background-color: rgba(59, 130, 246, 0.15) !important;
  }
  .header-title {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 600;
    width: 100%;
    color: inherit;
  }
  .custom-header-cell.is-active-bg .header-title {
    color: var(--dc-edge-selected, #3b82f6);
  }
  .col-resizer {
    position: absolute;
    right: -16px;
    top: 0;
    bottom: 0;
    width: 12px;
    cursor: col-resize;
    z-index: 10;
  }
  .col-resizer:hover {
    background-color: var(--dc-edge-selected, #3b82f6);
    opacity: 0.1;
  }
  .log-viewer {
    height: 100%;
    overflow-y: auto;
    background: #0f172a;
    color: #e2e8f0;
    font-family: "SF Mono", Consolas, monospace;
    font-size: 11px;
    padding: 8px;
    border-radius: 4px;
  }
  .empty-logs {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #64748b;
  }
  .custom-context-menu {
    position: fixed;
    z-index: 9999;
    background: var(--dc-node-bg, #ffffff);
    border: 1px solid var(--dc-border, #e2e8f0);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    border-radius: 4px;
    padding: 4px 0;
    min-width: 140px;
  }
  .menu-item {
    padding: 6px 12px;
    font-size: 12px;
    color: var(--dc-text-primary, #1e293b);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .menu-item:hover {
    background: var(--dc-preview-header-bg, #f8fafc);
  }
  .menu-item.danger {
    color: #ef4444;
  }
</style>
