<!-- 缩小节点卡片的基础尺寸 -->
<template>
  <div
    class="base-node"
    :class="{ 'is-selected': selected, 'is-stale': metaState.stale }"
    :style="nodeStyle"
  >
    <div class="node-header" :style="headerStyle" @dblclick="toggleCollapse">
      <span class="node-title">{{ opMeta.label || node.type }}</span>
      <span v-if="metaState.stale" class="node-badge warn" title="数据已过期">stale</span>
      <span v-if="metaState.error" class="node-badge error" :title="metaState.error">!</span>

      <!-- 预览按钮 -->
      <span class="node-action-btn" @click.stop="$emit('preview')">预览</span>
    </div>

    <div class="node-body" v-show="!collapsed">
      <slot />

      <div class="node-footer">
        <slot name="footer">
          <div class="node-meta">
            <span>{{ metaState.rowCount }} 行</span>
            <span>{{ metaState.columns.length }} 列</span>
          </div>
        </slot>
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
  import { getOperator } from "../../engine/operators/index.js"
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
  const opMeta = computed(() => {
    const op = getOperator(props.node.type)
    return op && op.meta
      ? op.meta
      : { label: props.node.type, color: "#3b82f6", inputs: 1, outputs: 1 }
  })

  const inputCount = computed(() => Math.max(0, opMeta.value.inputs || 0))
  const outputCount = computed(() => Math.max(0, opMeta.value.outputs || 0))
  const metaState = computed(() => metaStore.getMeta(props.node.id))

  const nodeStyle = computed(() => {
    if (!props.selected) return {}
    const baseColor = opMeta.value.color || "#3b82f6"
    return {
      borderColor: baseColor,
      boxShadow: `0 0 0 1px ${baseColor}50, 0 2px 6px rgba(0, 0, 0, 0.1)`,
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
    const offset = "-5px" // 缩小端口偏移量
    return {
      top,
      width: "10px", // 缩小端口尺寸
      height: "10px",
      background: getPortColor(colorKey || "table"),
      border: "1.5px solid var(--dc-node-bg, #ffffff)",
      left: kind === "input" ? offset : "auto",
      right: kind === "output" ? offset : "auto",
      transform: "translateY(-50%)",
      zIndex: 10,
    }
  }
</script>

<style scoped>
  /* 减小节点最小宽度和内边距 */
  .base-node {
    min-width: 160px;
    max-width: 280px;
    background: var(--dc-node-bg, #ffffff);
    border: 1px solid var(--dc-node-border, #cbd5e1);
    border-radius: 6px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
    font-size: 12px;
    /* 字体缩小 */
    color: var(--dc-text-primary, #1e293b);
    transition:
      box-shadow 0.15s,
      border-color 0.15s;
    position: relative;
  }

  .base-node.is-stale {
    opacity: 0.8;
    border-style: dashed;
  }

  .node-header {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    border-radius: 6px 6px 0 0;
    font-weight: 600;
    user-select: none;
    cursor: grab;
    gap: 6px;
    color: var(--dc-text-primary, #1e293b);
  }

  .node-header:active {
    cursor: grabbing;
  }

  .blender-dot {
    width: 12px;
    height: 12px;
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
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .node-title {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 12px;
  }

  .node-badge {
    font-size: 10px;
    padding: 1px 3px;
    border-radius: 2px;
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

  /* 预览按钮 */
  .node-action-btn {
    font-size: 11px;
    color: var(--dc-edge-selected, #3b82f6);
    cursor: pointer;
    padding: 1px 4px;
    border-radius: 3px;
    transition: background 0.2s;
  }

  .node-action-btn:hover {
    background: rgba(59, 130, 246, 0.1);
  }

  .node-body {
    padding: 8px;
    border-radius: 0 0 6px 6px;
    max-height: 320px;
    overflow-y: auto;
  }

  .node-footer {
    margin-top: 6px;
    padding-top: 4px;
    border-top: 1px dashed var(--dc-border, #e2e8f0);
  }

  .node-meta {
    font-size: 12px;
    color: var(--dc-text-secondary, #64748b);
    display: flex;
    justify-content: space-between;
  }
</style>
