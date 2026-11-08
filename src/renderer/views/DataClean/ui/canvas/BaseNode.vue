<!-- 修复底栏：数据源显示 Source，未连线显示 --，输出类型未定显示 -- -->
<template>
  <div
    class="base-node"
    :class="{ 'is-selected': selected, 'is-stale': metaState.stale }"
    :style="nodeStyle"
  >
    <div class="node-header" :style="headerStyle">
      <div class="blender-dot" @dblclick="toggleCollapse" title="双击折叠/展开">
        <div class="dot-inner" :style="{ background: opMeta.color }" />
      </div>
      <span class="node-title">{{ opMeta.label || node.type }}</span>
      <span v-if="metaState.stale" class="node-badge warn" title="数据已过期">stale</span>
      <span v-if="metaState.error" class="node-badge error" :title="metaState.error">!</span>

      <span class="node-action-btn" @click.stop="$emit('preview')">预览</span>
    </div>

    <div class="node-body" v-show="!collapsed">
      <slot />

      <div class="node-footer">
        <div class="shape-info">
          <!-- 输入类型 -->
          <span class="shape-text" :class="inputTypeClass">
            {{ inputTypeLabel }}
          </span>
          <span class="shape-arrow">➜</span>
          <!-- 输出类型 -->
          <span class="shape-text" :class="outputTypeClass">
            {{ outputTypeLabel }}
          </span>
        </div>

        <!-- 底部字段变化展示 -->
        <div v-if="lineageOp" class="lineage-op-bar">
          <span class="lineage-tag" :class="lineageOp.action">
            {{ lineageOp.action === "pass" ? "直传" : "转换" }}:
            {{ lineageOp.field }}
          </span>
        </div>

        <div class="stats-info">
          <template v-if="metaState.rowCount !== null && metaState.dataCategory">
            <template v-if="metaState.dataCategory === 'table'">
              {{ metaState.rowCount }} 行 / {{ metaState.columns.length }} 列
            </template>
            <template v-else-if="metaState.dataCategory === 'json'">
              {{ metaState.rowCount !== null ? metaState.rowCount + " 个对象" : "--" }}
            </template>
          </template>
          <template v-else>
            <span class="stats-placeholder">-- / --</span>
          </template>
        </div>
      </div>
    </div>

    <Handle
      v-for="idx in inputCount"
      :key="'in-' + idx"
      :id="'in-' + (idx - 1)"
      type="target"
      :position="Position.Left"
      :style="portStyle(idx, inputCount, 'input')"
    />
    <Handle
      v-for="idx in outputCount"
      :key="'out-' + idx"
      :id="'out-' + (idx - 1)"
      type="source"
      :position="Position.Right"
      :style="portStyle(idx, outputCount, 'output')"
    />
  </div>
</template>

<script setup>
  import { computed, ref } from "vue"
  import { Handle, Position } from "@vue-flow/core"
  import { useStoreDataCleanMeta } from "../../stores/StoreDataCleanMeta.js"
  import { useStoreDataCleanGraph } from "../../stores/StoreDataCleanGraph.js"
  import { getOperatorMeta } from "../operators/index.js"
  import { getPortColor } from "../../constants/PortTypes.js"

  const props = defineProps({
    node: { type: Object, required: true },
    selected: { type: Boolean, default: false },
  })
  defineEmits(["preview"])

  const collapsed = ref(false)
  function toggleCollapse() {
    collapsed.value = !collapsed.value
  }

  const metaStore = useStoreDataCleanMeta()
  const graphStore = useStoreDataCleanGraph()

  // 查找当前节点在当前血缘链路里的记录
  const lineageOp = computed(() => {
    if (!graphStore.activeLineageGraph) return null
    // 找到当前节点的记录
    const ops = graphStore.activeLineageGraph.filter(item => item.nodeId === props.node.id)
    if (ops.length === 0) return null
    // 目前一个节点在该链路里只会有一条对应记录（因为每次只追一个字段）
    return ops[0]
  })

  const isInLineage = computed(() => {
    return !!lineageOp.value
  })

  const opMeta = computed(() => {
    const op = getOperatorMeta(props.node.type)
    return op && op.meta
      ? op.meta
      : { label: props.node.type, color: "#3b82f6", inputs: 1, outputs: 1 }
  })

  const inputCount = computed(() => Math.max(0, opMeta.value.inputs || 0))
  const outputCount = computed(() => Math.max(0, opMeta.value.outputs || 0))
  const metaState = computed(() => metaStore.getMeta(props.node.id))

  // --- 底栏输入类型推断 ---
  const inputTypeLabel = computed(() => {
    if (opMeta.value.inputs === 0) return "SOURCE" // 数据源
    const edges = graphStore.getIncomingEdges(props.node.id)
    if (edges.length === 0) return "--" // 未连线
    return metaStore.getMeta(edges[0].source).dataCategory?.toUpperCase() || "--"
  })
  const inputTypeClass = computed(() => {
    if (inputTypeLabel.value === "--" || inputTypeLabel.value === "SOURCE") return "unknown"
    return inputTypeLabel.value.toLowerCase()
  })

  // --- 底栏输出类型推断 ---
  const outputTypeLabel = computed(() => {
    // 优先取运行后存下的 dataCategory
    if (metaState.value.dataCategory) return metaState.value.dataCategory.toUpperCase()
    // 其次取算子的静态声明
    if (opMeta.value.outputCategory && opMeta.value.outputCategory !== "dynamic") {
      return opMeta.value.outputCategory.toUpperCase()
    }
    // 如果是动态输出且未运行
    return "--"
  })
  const outputTypeClass = computed(() => {
    if (outputTypeLabel.value === "--") return "unknown"
    return outputTypeLabel.value.toLowerCase()
  })

  const nodeStyle = computed(() => {
    if (!props.selected) return {}
    const baseColor = opMeta.value.color || "#3b82f6"
    return {
      borderColor: baseColor,
      boxShadow: `0 0 0 2px ${baseColor}50, 0 4px 12px rgba(0, 0, 0, 0.1)`,
    }
  })

  const headerStyle = computed(() => {
    const baseColor = opMeta.value.color || "#3b82f6"
    const isDark = document.documentElement.getAttribute("data-theme") === "dark"
    const opacityStart = isDark ? "40" : "25"
    const opacityEnd = isDark ? "10" : "05"
    return {
      background: `linear-gradient(to bottom, ${baseColor}${opacityStart} 0%, ${baseColor}${opacityEnd} 100%)`,
      borderBottom: `1px solid ${baseColor}${isDark ? "50" : "30"}`,
    }
  })

  function portStyle(idx, total, kind) {
    const top = total === 1 ? "50%" : `${(idx / (total + 1)) * 100}%`
    const colorKey = kind === "input" ? opMeta.value.inputPortType : opMeta.value.outputPortType
    const offset = "-7px"
    return {
      top,
      width: "14px",
      height: "14px",
      background: getPortColor(colorKey || "table"),
      border: "2px solid var(--dc-node-bg, #ffffff)",
      left: kind === "input" ? offset : "auto",
      right: kind === "output" ? offset : "auto",
      transform: "translateY(-50%)",
      zIndex: 10,
    }
  }
</script>

<style scoped>
  /* 保持原有样式，补充底栏状态类 */
  .base-node {
    min-width: 220px;
    max-width: 340px;
    background: var(--dc-node-bg, #ffffff);
    border: 1px solid var(--dc-node-border, #cbd5e1);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    font-size: 12px;
    color: var(--dc-text-primary, #1e293b);
    transition:
      box-shadow 0.15s,
      border-color 0.15s;
    position: relative;
  }
  .base-node.is-stale {
    opacity: 0.6;
    border-style: dashed;
  }
  .node-header {
    display: flex;
    align-items: center;
    padding: 6px 10px;
    border-radius: 8px 8px 0 0;
    font-weight: 600;
    user-select: none;
    cursor: grab;
    gap: 8px;
  }
  .node-header:active {
    cursor: grabbing;
  }
  .blender-dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--dc-border, #e2e8f0);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.2s;
  }
  .blender-dot:hover {
    background: var(--dc-text-secondary, #94a3b8);
  }
  .dot-inner {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .node-title {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .node-badge {
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 3px;
    font-weight: 500;
  }
  .node-badge.warn {
    background: #fef3c7;
    color: #92400e;
  }
  .node-badge.error {
    background: #fee2e2;
    color: #991b1b;
  }
  .node-action-btn {
    font-size: 11px;
    color: var(--dc-edge-selected, #3b82f6);
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    transition: background 0.2s;
  }
  .node-action-btn:hover {
    background: rgba(59, 130, 246, 0.1);
  }
  .node-body {
    padding: 10px;
    border-radius: 0 0 8px 8px;
    max-height: 400px;
    overflow-y: auto;
  }
  .node-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px dashed var(--dc-border, #e2e8f0);
    font-size: 11px;
  }
  .shape-info {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .shape-text {
    font-family: "SF Mono", Consolas, monospace;
    font-weight: 600;
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 3px;
    text-transform: uppercase;
  }
  .shape-text.table {
    color: #3b82f6;
    background: rgba(59, 130, 246, 0.1);
  }
  .shape-text.json {
    color: #8b5cf6;
    background: rgba(139, 92, 246, 0.1);
  }
  .shape-text.unknown {
    color: var(--dc-text-secondary, #94a3b8);
    background: transparent;
    padding: 0;
  }
  .shape-arrow {
    color: var(--dc-text-secondary, #64748b);
    font-size: 10px;
    margin: 0 2px;
  }
  .stats-info {
    color: var(--dc-text-secondary, #64748b);
    font-family: "SF Mono", Consolas, monospace;
  }
  .stats-placeholder {
    opacity: 0.5;
  }

  .lineage-op-bar {
    border-top: 1px dashed var(--dc-border, #e2e8f0);
    padding: 4px 8px;
    font-size: 11px;
    background: var(--dc-node-bg, #ffffff);
  }
  .lineage-tag {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 4px;
    background: #f1f5f9;
    color: #64748b;
  }
  .lineage-tag.rename {
    background: #eff6ff;
    color: #3b82f6;
    border: 1px solid #bfdbfe;
  }
  .lineage-tag.source {
    background: #f0fdf4;
    color: #16a34a;
  }
</style>
