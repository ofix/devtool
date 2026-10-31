<!-- 专属 Filter 节点：支持可视化/表达式双模式切换 -->
<template>
    <BaseNode :node="node" :selected="selected">
        <div class="filter-mode-switch">
            <el-radio-group v-model="mode" size="small" @change="onModeChange">
                <el-radio-button label="visual">可视化</el-radio-button>
                <el-radio-button label="expr">表达式</el-radio-button>
            </el-radio-group>
        </div>

        <!-- 可视化模式 -->
        <div v-if="mode === 'visual'" class="filter-visual">
            <ConditionBuilder 
                v-model="node.params.expression" 
                :columns="upstreamColumns" 
                @update:model-value="onExpressionUpdate"
            />
        </div>

        <!-- 表达式模式 -->
        <div v-else class="expr-container">
            <div class="expr-main">
                <ExpressionEditor 
                    :model-value="node.params.expression || ''"
                    @update:model-value="onExpressionUpdate"
                />
            </div>
            <div class="expr-side">
                <FieldListPanel 
                    :columns="upstreamColumns" 
                    @select="(f) => insertField('expression', f)"
                />
            </div>
        </div>
    </BaseNode>
</template>

<script setup>
import { ref, computed } from "vue";
import BaseNode from "./BaseNode.vue";
import ConditionBuilder from "../expression/ConditionBuilder.vue";
import ExpressionEditor from "../expression/ExpressionEditor.vue";
import FieldListPanel from "../params/FieldListPanel.vue";
import { useStoreDataCleanGraph } from "../../stores/StoreDataCleanGraph.js";
import { useStoreDataCleanMeta } from "../../stores/StoreDataCleanMeta.js";

const props = defineProps({
    node: { type: Object, required: true },
    selected: { type: Boolean, default: false },
});

const emit = defineEmits(["trigger-run"]);
const graphStore = useStoreDataCleanGraph();
const metaStore = useStoreDataCleanMeta();

// 状态：visual 或 expr
const mode = ref("visual");

const upstreamColumns = computed(() => {
    const incoming = graphStore.getIncomingEdges(props.node.id);
    if (incoming.length === 0) return [];
    return metaStore.getMeta(incoming[0].source).columns || [];
});

function onModeChange(val) {
    // 从可视化切到表达式无需特殊处理，直接切
    // 从表达式切到可视化：如果表达式很复杂，提示用户
    if (val === "visual" && props.node.params.expression) {
        // 简单判断：如果包含括号，或者不包含我们可视化支持的操作符
        const expr = props.node.params.expression;
        if (expr.includes("(") || expr.includes(")")) {
            // 实际项目中这里可以抛出 ElMessage.warning
            console.warn("表达式较复杂，切换可视化可能会丢失部分信息");
        }
    }
}

function onExpressionUpdate(val) {
    graphStore.updateNodeParams(props.node.id, { expression: val });
    emit("trigger-run");
}

function insertField(rowField, fieldName) {
    const current = props.node.params[rowField] || "";
    const newVal = current + (current ? " " : "") + fieldName;
    onExpressionUpdate(newVal);
}
</script>

<style scoped>
.filter-mode-switch {
    margin-bottom: 8px;
    display: flex;
    justify-content: center;
}
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
</style>
