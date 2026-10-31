<!-- 修复：强制覆盖暗黑模式下的文字颜色，确保标题栏和行数清晰可见 -->
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
        </div>

        <div class="node-body" v-show="!collapsed">
            <slot />
            <div class="node-meta">
                <span>{{ metaState.rowCount }} 行</span>
                <span>{{ metaState.columns.length }} 列</span>
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
import { computed, ref } from "vue";
import { Handle, Position } from "@vue-flow/core";
import { useStoreDataCleanMeta } from "../../stores/StoreDataCleanMeta.js";
import { getOperator } from "../../engine/operators/index.js";
import { getPortColor } from "../../constants/PortTypes.js";

const props = defineProps({
    node: { type: Object, required: true },
    selected: { type: Boolean, default: false },
});

const collapsed = ref(false);
function toggleCollapse() { collapsed.value = !collapsed.value; }

const metaStore = useStoreDataCleanMeta();
const opMeta = computed(() => {
    const op = getOperator(props.node.type);
    return op && op.meta ? op.meta : { label: props.node.type, color: "#3b82f6", inputs: 1, outputs: 1 };
});

const inputCount = computed(() => Math.max(0, opMeta.value.inputs || 0));
const outputCount = computed(() => Math.max(0, opMeta.value.outputs || 0));
const metaState = computed(() => metaStore.getMeta(props.node.id));

const nodeStyle = computed(() => {
    if (!props.selected) return {};
    const baseColor = opMeta.value.color || "#3b82f6";
    return {
        borderColor: baseColor,
        boxShadow: `0 0 0 2px ${baseColor}50, 0 4px 12px rgba(0, 0, 0, 0.1)`
    };
});

const headerStyle = computed(() => {
    const baseColor = opMeta.value.color || "#3b82f6";
    // 在暗黑模式下，标题栏渐变颜色调暗，避免刺眼
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const opacityStart = isDark ? "40" : "25";
    const opacityEnd = isDark ? "10" : "05";
    return {
        background: `linear-gradient(to bottom, ${baseColor}${opacityStart} 0%, ${baseColor}${opacityEnd} 100%)`,
        borderBottom: `1px solid ${baseColor}${isDark ? '50' : '30'}`
    };
});

function portStyle(idx, total, kind) {
    const top = total === 1 ? "50%" : `${(idx / (total + 1)) * 100}%`;
    const colorKey = kind === "input" ? opMeta.value.inputPortType : opMeta.value.outputPortType;
    const offset = "-7px"; 
    return {
        top,
        width: "14px",
        height: "14px",
        background: getPortColor(colorKey || "table"),
        border: "2px solid var(--dc-node-bg, #ffffff)", 
        left: kind === "input" ? offset : "auto",
        right: kind === "output" ? offset : "auto",
        transform: "translateY(-50%)",
        zIndex: 10
    };
}
</script>

<style scoped>
.base-node {
    min-width: 200px;
    max-width: 320px;
    background: var(--dc-node-bg, #ffffff); 
    border: 1px solid var(--dc-node-border, #cbd5e1);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    font-size: 12px;
    /* 强制继承全局主题文字色 */
    color: var(--dc-text-primary, #1e293b);
    transition: box-shadow 0.15s, border-color 0.15s;
    position: relative;
}
.base-node.is-stale { opacity: 0.6; border-style: dashed; }

.node-header {
    display: flex;
    align-items: center;
    padding: 6px 10px;
    border-radius: 8px 8px 0 0;
    font-weight: 600;
    user-select: none;
    cursor: grab;
    gap: 8px;
    /* 标题栏强制继承主题色 */
    color: var(--dc-text-primary, #1e293b);
}
.node-header:active { cursor: grabbing; }

/* Blender 圆点 */
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
.blender-dot:hover { background: var(--dc-text-secondary, #94a3b8); }
.dot-inner { width: 8px; height: 8px; border-radius: 50%; }

.node-title { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.node-badge { font-size: 10px; padding: 1px 4px; border-radius: 3px; font-weight: 500; }
.node-badge.warn { background: #fef3c7; color: #92400e; }
.node-badge.error { background: #fee2e2; color: #991b1b; }

.node-body {
    padding: 10px;
    border-radius: 0 0 8px 8px;
    max-height: 320px;
    overflow-y: auto;
}
.node-meta {
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px dashed var(--dc-border, #e2e8f0);
    font-size: 11px;
    /* 强制继承次级文字色 */
    color: var(--dc-text-secondary, #64748b);
    display: flex;
    justify-content: space-between;
}
</style>
