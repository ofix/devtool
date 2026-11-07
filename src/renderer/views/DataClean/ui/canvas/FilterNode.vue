<template>
  <BaseNode :node="node" :selected="selected" @preview="$emit('trigger-run')">
    <div class="filter-container">
      <div class="filter-header-tabs">
        <el-radio-group v-model="mode" size="small">
          <el-radio-button value="visual">可视化</el-radio-button>
          <el-radio-button value="expr">表达式</el-radio-button>
        </el-radio-group>
      </div>

      <!-- 可视化模式 -->
      <div v-if="mode === 'visual'" class="visual-mode">
        <div class="cond-row" v-for="(cond, index) in conditions" :key="index">
          <el-select
            v-if="index > 0"
            v-model="cond.logic"
            size="small"
            class="w-logic"
            @change="emitVisualExpr"
          >
            <el-option label="AND" value="AND" />
            <el-option label="OR" value="OR" />
          </el-select>
          <div v-else class="w-logic placeholder"></div>

          <!-- 字段 -->
          <el-select
            v-model="cond.field"
            size="small"
            filterable
            class="w-field"
            @change="emitVisualExpr"
          >
            <el-option
              v-for="col in upstreamColumns"
              :key="col.name"
              :label="col.name"
              :value="col.name"
            />
          </el-select>

          <!-- 操作符 -->
          <el-select v-model="cond.operator" size="small" class="w-op" @change="emitVisualExpr">
            <el-option
              v-for="op in allowedOperators(cond.field)"
              :key="op.value"
              :label="op.label"
              :value="op.value"
            />
          </el-select>

          <!-- 值 -->
          <el-input
            v-if="!isNullOp(cond.operator)"
            v-model="cond.value"
            size="small"
            class="w-value"
            placeholder="值"
            @input="emitVisualExpr"
          />

          <el-button size="small" text type="danger" class="w-del" @click="removeCondition(index)"
            >×</el-button
          >
        </div>
        <el-button size="small" text type="primary" @click="addCondition">+ 添加条件</el-button>
      </div>

      <!-- 表达式模式 -->
      <div v-else class="expr-mode">
        <div class="expr-toolbar">
          <el-popover
            placement="bottom-start"
            :width="200"
            trigger="click"
            v-model:visible="showFieldPopover"
          >
            <template #reference>
              <el-button size="small">字段</el-button>
            </template>
            <div class="field-popover-content">
              <el-input v-model="fieldSearch" size="small" placeholder="搜索..." clearable />
              <div class="field-list custom-scrollbar">
                <div
                  v-for="col in filteredFields"
                  :key="col.name"
                  class="field-item"
                  @click="insertField(col.name)"
                >
                  {{ col.name }}
                </div>
              </div>
            </div>
          </el-popover>
        </div>
        <div class="editor-wrap">
          <ExpressionEditor
            v-model="node.params.expression"
            :columns="upstreamColumns"
            @update:model-value="onExprUpdate"
          />
        </div>
      </div>
    </div>
  </BaseNode>
</template>

<script setup>
  import { ref, computed } from "vue"
  import BaseNode from "./BaseNode.vue"
  import ExpressionEditor from "../expression/ExpressionEditor.vue"
  import { useStoreDataCleanGraph } from "../../stores/StoreDataCleanGraph.js"
  import { useStoreDataCleanMeta } from "../../stores/StoreDataCleanMeta.js"

  const props = defineProps({
    node: { type: Object, required: true },
    selected: { type: Boolean, default: false },
  })
  const emit = defineEmits(["trigger-run"])
  const graphStore = useStoreDataCleanGraph()
  const metaStore = useStoreDataCleanMeta()

  const mode = ref("visual")
  const showFieldPopover = ref(false)
  const fieldSearch = ref("")
  const conditions = ref([])

  const upstreamColumns = computed(() => {
    const incoming = graphStore.getIncomingEdges(props.node.id)
    if (incoming.length === 0) return []
    return metaStore.getMeta(incoming[0].source).columns || []
  })

  const filteredFields = computed(() => {
    if (!fieldSearch.value) return upstreamColumns.value
    const lower = fieldSearch.value.toLowerCase()
    return upstreamColumns.value.filter(c => c.name.toLowerCase().includes(lower))
  })

  function isNullOp(op) {
    return op === "IS NULL" || op === "IS NOT NULL"
  }

  function allowedOperators(fieldName) {
    const opList = [
      { label: "=", value: "=" },
      { label: "!=", value: "!=" },
      { label: ">", value: ">" },
      { label: "<", value: "<" },
      { label: ">=", value: ">=" },
      { label: "<=", value: "<=" },
      { label: "CONTAINS", value: "CONTAINS" },
      { label: "STARTSWITH", value: "STARTSWITH" },
      { label: "ENDSWITH", value: "ENDSWITH" },
      { label: "IS NULL", value: "IS NULL" },
      { label: "IS NOT NULL", value: "IS NOT NULL" },
    ]
    const col = upstreamColumns.value.find(c => c.name === fieldName)
    if (!col) return opList
    if (col.type === "number" || col.type === "date")
      return opList.filter(op => !["CONTAINS", "STARTSWITH", "ENDSWITH"].includes(op.value))
    if (col.type === "string")
      return opList.filter(op => !["<", ">", "<=", ">="].includes(op.value))
    return opList
  }

  function onExprUpdate(val) {
    graphStore.updateNodeParams(props.node.id, { expression: val })
  }

  function addCondition() {
    conditions.value.push({
      logic: "AND",
      field: upstreamColumns.value[0]?.name || "",
      operator: "=",
      value: "",
    })
    emitVisualExpr()
  }

  function removeCondition(index) {
    conditions.value.splice(index, 1)
    emitVisualExpr()
  }

  function emitVisualExpr() {
    const expr = conditions.value
      .map((c, i) => {
        let str = i > 0 ? ` ${c.logic} ` : ""
        if (isNullOp(c.operator)) {
          str += `${c.field} ${c.operator}`
        } else {
          str += `${c.field} ${c.operator} "${c.value}"`
        }
        return str
      })
      .join("")
    graphStore.updateNodeParams(props.node.id, { expression: expr })
  }

  function insertField(fieldName) {
    const expr = props.node.params.expression || ""
    graphStore.updateNodeParams(props.node.id, { expression: expr + fieldName })
    showFieldPopover.value = false // 插入后隐藏悬浮框
  }
</script>

<style scoped>
  /* 固定面板宽度，防止切换时跳动 */
  .filter-container {
    width: 280px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .filter-header-tabs {
    display: flex;
    justify-content: center;
  }

  /* 可视化行，宽度严格按比例分配 */
  .visual-mode {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .cond-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .w-logic {
    width: 56px;
    flex-shrink: 0;
  }
  .w-logic.placeholder {
    visibility: hidden;
  }
  .w-field {
    flex: 1;
    min-width: 0;
  }
  .w-op {
    width: 64px;
    flex-shrink: 0;
  }
  .w-value {
    flex: 1;
    min-width: 0;
  }
  .w-del {
    flex-shrink: 0;
    padding: 0 4px;
  }

  /* 表达式模式 */
  .expr-toolbar {
    margin-bottom: 4px;
  }
  .editor-wrap {
    width: 100%;
  }

  /* 悬浮字段面板 */
  .field-popover-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .field-list {
    max-height: 150px;
    overflow-y: auto;
    border: 1px solid var(--dc-border);
    border-radius: 4px;
  }
  .field-item {
    padding: 4px 8px;
    font-size: 12px;
    cursor: pointer;
  }
  .field-item:hover {
    background: var(--dc-preview-header-bg);
  }
</style>
