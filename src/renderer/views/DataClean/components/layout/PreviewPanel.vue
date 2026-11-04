<template>
  <div class="preview-panel">
    <div class="preview-header">
      <div class="preview-title">
        <span class="title-text">{{ title }}</span>
        <span v-if="hasData && meta.dataCategory === 'table'" class="title-meta">
          {{ meta.rowCount }} 行 · {{ meta.columns.length }} 列
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
        <el-button v-if="!isMessageNode" size="small" text @click="$emit('refresh')"
          >刷新</el-button
        >
      </div>
    </div>

    <div class="preview-body" ref="previewBodyRef" @mousedown="handleGlobalMouseDown">
      <EmptyState
        v-if="!isMessageNode && !hasData && meta.dataCategory !== 'empty'"
        :text="emptyText"
      />

      <!-- 表格视图 -->
      <el-table-v2
        v-else-if="meta.dataCategory === 'table'"
        ref="tableRef"
        :columns="tableColumns"
        :data="visibleRows"
        :width="tableWidth"
        :height="tableHeight"
        :row-height="32"
        :header-height="36"
        fixed
      >
        <template #header-cell="{ column }">
          <div class="custom-header-cell" :data-key="column.key">
            <span class="header-title">{{ column.title }}</span>
            <div class="col-resizer"></div>
          </div>
        </template>
      </el-table-v2>

      <!-- JSON 视图 -->
      <JsonPreview
        v-else-if="meta.dataCategory === 'json' && dataset"
        :dataset="dataset"
        :json-schema-tree="meta.jsonSchemaTree"
      />

      <!-- 其他/未知状态 -->
      <div v-else class="log-viewer">
        <div class="empty-logs">无有效数据格式展示。</div>
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
  import { useStoreDataCleanDatasets } from "../../stores/StoreDataCleanDatasets.js"
  import { topoSort } from "../../engine/Scheduler.js"

  defineEmits(["refresh"])

  const graphStore = useStoreDataCleanGraph()
  const metaStore = useStoreDataCleanMeta()
  const datasetStore = useStoreDataCleanDatasets()

  const previewBodyRef = ref(null)
  const tableRef = ref(null)
  const tableWidth = ref(800)
  const tableHeight = ref(300)

  const isResizing = ref(false)
  const resizeLineX = ref(0)
  const currentColKey = ref(null)
  const startX = ref(0)
  const startWidth = ref(0)
  const columnWidths = ref({})

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
    return datasetStore.getDataset(selected.value.id)
  })

  const title = computed(() => {
    if (!selected.value) return "未选中节点"
    return `${selected.value.type} · ${selected.value.id.slice(0, 12)}`
  })

  const hasData = computed(() => {
    if (!meta.value.dataCategory) return false
    if (meta.value.dataCategory === "table") {
      return Boolean(dataset.value && dataset.value.rows.length > 0)
    }
    if (meta.value.dataCategory === "json") {
      return Boolean(dataset.value && dataset.value.json !== null)
    }
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

  const visibleRows = computed(() => {
    if (!dataset.value || !dataset.value.rows) return []
    return dataset.value.rows.slice(0, 200).map((row, idx) => ({ ...row, __idx: idx }))
  })

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

  watch(
    () => dataset.value,
    () => {
      nextTick(() => measure())
    },
    { deep: false },
  )

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

  function handleGlobalMouseDown(e) {
    const resizer = e.target.closest(".col-resizer")
    if (!resizer) return
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
    resizeLineX.value = e.clientX - bodyRect.left + scrollLeft

    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"

    let rafId = null
    let finalWidth = startWidth.value

    function onMouseMove(ev) {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const deltaX = ev.clientX - startX.value
        finalWidth = Math.max(80, startWidth.value + deltaX)
        const sl = tableRef.value?.scrollLeft ?? 0
        resizeLineX.value = ev.clientX - bodyRect.left + sl
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
</script>

<style scoped>
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
  .header-title {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 600;
    width: 100%;
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
  .resize-line {
    position: absolute;
    top: 32px;
    bottom: 0;
    width: 2px;
    background-color: var(--dc-edge-selected, #3b82f6);
    z-index: 9999;
    pointer-events: none;
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
</style>
