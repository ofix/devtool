<template>
  <BaseNode :node="node" :selected="selected" @preview="handlePreview">
    <template v-for="row in schema" :key="row.field">
      <ParamRow v-if="shouldShow(row)" :label="row.label">
        <!-- 1. 表达式 -->
        <div v-if="row.component === 'expression'" class="expr-container">
          <div class="expr-main">
            <ExpressionEditor
              :model-value="node.params[row.field] || ''"
              @update:model-value="v => updateParam(row.field, v)"
            />
          </div>
          <div class="expr-side">
            <FieldListPanel
              :columns="getColumnsForRow(row)"
              @select="f => insertField(row.field, f)"
            />
          </div>
        </div>

        <!-- 2. 文件/文件夹 -->
        <FilePicker
          v-else-if="
            row.component === 'file' || row.component === 'folder' || row.component === 'saveFile'
          "
          :model-value="node.params[row.field]"
          :is-folder="row.component === 'folder'"
          :extensions="row.extensions"
          @update:model-value="v => updateParam(row.field, v)"
        />

        <!-- 3. XLSX 选取数据按钮 -->
        <div v-else-if="row.component === 'xlsxConfigDialog'" class="xlsx-config-area">
          <el-button
            size="small"
            type="primary"
            plain
            :disabled="!node.params.filePath"
            @click.stop="showXlsxDialog = true"
          >
            设置范围
          </el-button>
        </div>

        <!-- 4. XLSX 数据范围展示 -->
        <div v-else-if="row.component === 'xlsxMetaInfo'" class="xlsx-meta-area">
          <el-popover
            placement="bottom-start"
            :width="240"
            trigger="click"
            popper-class="sheet-meta-popover"
          >
            <template #reference>
              <el-input
                size="small"
                readonly
                :model-value="xlsxSummaryText"
                class="xlsx-summary-input"
              >
                <template #suffix
                  ><el-icon> <ArrowDown /> </el-icon
                ></template>
              </el-input>
            </template>
            <div class="meta-list-popover">
              <div class="meta-header">已选 {{ (node.params.tasks || []).length }} 个 Sheet</div>
              <div class="meta-scroll custom-scrollbar">
                <div v-for="task in node.params.tasks" :key="task.sheetName" class="meta-item">
                  <div class="meta-sheet-name">{{ task.sheetName }}</div>
                  <div class="meta-details">
                    <div v-for="(reg, idx) in task.regions || []" :key="idx" class="meta-region">
                      <span class="reg-range">{{ reg }}</span>
                      <span class="reg-size">{{ getRegionSize(reg) }}</span>
                    </div>
                    <div v-if="(task.regions || []).length === 0" class="meta-region">
                      <span class="reg-range">全表</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </el-popover>
        </div>

        <!-- 5. 列选择器 -->
        <ColumnPicker
          v-else-if="row.component === 'columnPicker'"
          :model-value="node.params[row.field] || []"
          :columns="getColumnsForRow(row)"
          @update:model-value="v => updateParam(row.field, v)"
        />

        <!-- 6. 重命名 -->
        <RenamePanel
          v-else-if="row.component === 'renamePanel'"
          :model-value="node.params[row.field] || ''"
          :columns="getColumnsForRow(row)"
          @update:model-value="v => updateParam(row.field, v)"
        />

        <!-- 7. 字段单选/多选 -->
        <el-select
          v-else-if="row.component === 'fieldSelect'"
          :model-value="node.params[row.field] || (row.multiple ? [] : '')"
          size="small"
          style="width: 100%"
          :multiple="!!row.multiple"
          filterable
          @update:model-value="v => updateParam(row.field, v)"
        >
          <el-option
            v-for="col in getColumnsForRow(row)"
            :key="col.name"
            :label="`${col.name} (${col.type})`"
            :value="col.name"
          />
        </el-select>

        <!-- 8. 普通枚举 -->
        <el-select
          v-else-if="row.component === 'select'"
          :model-value="node.params[row.field] || ''"
          size="small"
          style="width: 100%"
          @update:model-value="v => updateParam(row.field, v)"
        >
          <el-option
            v-for="opt in row.options"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>

        <!-- 9. 开关 -->
        <el-switch
          v-else-if="row.component === 'switch'"
          :model-value="node.params[row.field] !== false"
          size="small"
          @update:model-value="v => updateParam(row.field, v)"
        />

        <!-- 10. 普通输入 -->
        <el-input
          v-else
          :model-value="node.params[row.field] || ''"
          size="small"
          :placeholder="row.defaultValue || ''"
          @update:model-value="v => updateParam(row.field, v)"
        />
      </ParamRow>
    </template>

    <!-- Xlsx 弹窗 -->
    <XlsxConfigDialog
      v-if="node.type === 'xlsxInput'"
      v-model:visible="showXlsxDialog"
      :model-value="node.params"
      :available-sheets="excelSheets"
      @update:model-value="onXlsxConfigUpdate"
      @trigger-run="handlePreview"
    />
  </BaseNode>
</template>

<script setup>
  import { ref, computed, watch } from "vue"
  import { ArrowDown } from "@element-plus/icons-vue"
  import BaseNode from "./BaseNode.vue"
  import ParamRow from "../params/ParamRow.vue"
  import ExpressionEditor from "../expression/ExpressionEditor.vue"
  import FieldListPanel from "../params/FieldListPanel.vue"
  import FilePicker from "../params/FilePicker.vue"
  import ColumnPicker from "../params/ColumnPicker.vue"
  import RenamePanel from "../params/RenamePanel.vue"
  import XlsxConfigDialog from "../params/XlsxConfigDialog.vue"
  import { useStoreDataCleanGraph } from "../../stores/StoreDataCleanGraph.js"
  import { useStoreDataCleanMeta } from "../../stores/StoreDataCleanMeta.js"
  import { getOperator } from "../../engine/operators/index.js"

  const props = defineProps({
    node: { type: Object, required: true },
    selected: { type: Boolean, default: false },
  })
  const graphStore = useStoreDataCleanGraph()
  const metaStore = useStoreDataCleanMeta()

  const op = computed(() => getOperator(props.node.type))
  const incomingEdges = computed(() => graphStore.getIncomingEdges(props.node.id))
  const showXlsxDialog = ref(false)

  const emit = defineEmits(["trigger-run"])

  const schema = computed(() => {
    const baseSchema = op.value ? op.value.schema || [] : []
    if (
      props.node.type === "xlsxInput" &&
      props.node.params.tasks &&
      props.node.params.tasks.length > 0
    ) {
      return [
        ...baseSchema,
        { field: "xlsxMetaInfo", label: "数据范围", component: "xlsxMetaInfo" },
      ]
    }
    return baseSchema
  })

  const excelSheets = ref([])
  watch(
    () => props.node.params.filePath,
    async newPath => {
      if (!newPath) {
        excelSheets.value = []
        return
      }
      try {
        const ExcelJS = (await import("exceljs")).default
        const workbook = new ExcelJS.Workbook()
        const buffer = await window.api.dataClean.fs.readBuffer(newPath)
        await workbook.xlsx.load(buffer)
        excelSheets.value = workbook.worksheets.map(ws => ws.name)
      } catch (err) {
        excelSheets.value = []
      }
    },
    { immediate: true },
  )

  const xlsxSummaryText = computed(() => {
    const tasks = props.node.params.tasks || []
    let totalRegions = 0,
      totalRows = 0
    tasks.forEach(t => {
      totalRegions += (t.regions || []).length
      ;(t.regions || []).forEach(reg => {
        const bounds = parseA1ForSummary(reg)
        if (bounds) totalRows += bounds.endRow - bounds.startRow + 1
      })
    })
    return `共 ${tasks.length} 个 Sheet, ${totalRegions} 个区域, 约 ${totalRows} 行`
  })

  function getRegionSize(reg) {
    const bounds = parseA1ForSummary(reg)
    if (!bounds) return ""
    return `${bounds.endRow - bounds.startRow + 1} 行 × ${bounds.endCol - bounds.startCol + 1} 列`
  }

  function parseA1ForSummary(rangeStr) {
    if (!rangeStr) return null
    const parts = rangeStr.split(":")
    const start = parseCell(parts[0])
    const end = parts[1] ? parseCell(parts[1]) : start
    return { startRow: start.row, startCol: start.col, endRow: end.row, endCol: end.col }
  }

  function parseCell(cellStr) {
    const match = String(cellStr)
      .toUpperCase()
      .match(/^([A-Z]+)(\d+)$/)
    if (!match) return { row: 1, col: 1 }
    return { col: colToNumber(match[1]), row: parseInt(match[2], 10) }
  }
  function colToNumber(colStr) {
    let num = 0
    for (let i = 0; i < colStr.length; i++) num = num * 26 + (colStr.charCodeAt(i) - 64)
    return num
  }

  function shouldShow(row) {
    if (!row.showWhen) return true
    return row.showWhen(props.node.params)
  }

  function getColumnsForRow(row) {
    if (incomingEdges.value.length === 0) return []
    let targetEdge = incomingEdges.value[0]
    if (row.sourcePort !== undefined) {
      const handle = `in-${row.sourcePort}`
      const matched = incomingEdges.value.find(e => e.targetHandle === handle)
      if (matched) targetEdge = matched
      else return []
    }
    return metaStore.getMeta(targetEdge.source).columns || []
  }

  function updateParam(field, value) {
    if (value === null || value === undefined) value = ""
    graphStore.updateNodeParams(props.node.id, { [field]: value })
  }

  function onXlsxConfigUpdate(newParams) {
    graphStore.updateNodeParams(props.node.id, newParams)
  }

  async function handlePreview() {
    emit("trigger-run")
  }

  function insertField(rowField, fieldName) {
    const current = props.node.params[rowField] || ""
    const newVal = current + (current ? " " : "") + fieldName
    updateParam(rowField, newVal)
  }
</script>

<style lang="scss" scoped>
  .expr-container {
    display: flex;
    gap: 8px;
    width: 100%;
  }

  .expr-main {
    flex: 1;
    min-width: 0;
  }

  .expr-side {
    width: 120px;
    flex-shrink: 0;
  }

  .xlsx-config-area {
    width: 100%;
    display: flex;
    justify-content: flex-start;
  }

  .xlsx-meta-area {
    width: 100%;
  }

  .xlsx-summary-input {
    cursor: pointer;
  }

  .meta-list-popover {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 280px;
  }

  .meta-header {
    font-weight: 600;
    font-size: 12px;
    color: var(--dc-text-secondary);
    padding-bottom: 4px;
    border-bottom: 1px solid var(--dc-border);
  }

  .meta-scroll {
    overflow-y: auto;
    padding-right: 4px;
  }

  .meta-item {
    margin-bottom: 12px;
  }

  .meta-sheet-name {
    font-size: 12px;
    color: var(--dc-text-primary);
    margin-bottom: 4px;
    display: flex;
    align-items: center;
  }

  .meta-sheet-name::before {
    content: "";
    display: inline-block;
    width: 6px;
    height: 6px;
    background: var(--dc-edge-selected);
    border-radius: 50%;
    margin-right: 6px;
  }

  .meta-details {
    padding-left: 12px;
  }

  .meta-region {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    margin-bottom: 2px;
    color: var(--dc-text-secondary);
  }

  .reg-range {
    font-family: monospace;
  }

  .reg-size {
    font-style: italic;
    opacity: 0.8;
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }

  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: transparent;
    border-radius: 3px;
  }

  .custom-scrollbar:hover::-webkit-scrollbar-thumb {
    background-color: rgba(150, 150, 150, 0.4);
  }
</style>

<style>
  .sheet-meta-popover {
    padding: 12px !important;
  }
</style>
