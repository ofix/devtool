<template>
    <BaseNode :node="node" :selected="selected" @preview="$emit('trigger-run')">
        <div class="json-filter-panel">
            <div class="hint-text" v-if="availableFields.length === 0">
                请连接包含数据的上游 JSON 节点。
            </div>

            <template v-else>
                <ParamRow label="过滤字段">
                    <el-select v-model="localField" size="small" style="width: 100%" filterable @change="onParamChange">
                        <el-option v-for="f in availableFields" :key="f.path" :label="f.label" :value="f.path" />
                    </el-select>
                </ParamRow>

                <ParamRow label="操作符">
                    <el-select v-model="localOperator" size="small" style="width: 100%" @change="onParamChange">
                        <el-option label="等于" value="=" />
                        <el-option label="不等于" value="!=" />
                        <el-option label="大于" value=">" />
                        <el-option label="小于" value="<" />
                        <el-option label="包含" value="CONTAINS" />
                        <el-option label="为空" value="IS NULL" />
                    </el-select>
                </ParamRow>

                <ParamRow label="值" v-if="localOperator !== 'IS NULL'">
                    <el-input v-model="localValue" size="small" placeholder="输入比较值" @change="onParamChange" />
                </ParamRow>
            </template>
        </div>
    </BaseNode>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import BaseNode from "./BaseNode.vue";
import ParamRow from "../params/ParamRow.vue";
import { useStoreDataCleanGraph } from "../../stores/StoreDataCleanGraph.js";
import { useStoreDataCleanMeta } from "../../stores/StoreDataCleanMeta.js";

const props = defineProps({ node: { type: Object, required: true }, selected: { type: Boolean, default: false } });
const emit = defineEmits(["trigger-run"]);
const graphStore = useStoreDataCleanGraph();
const metaStore = useStoreDataCleanMeta();

const localField = ref(props.node.params?.field || "");
const localOperator = ref(props.node.params?.operator || "=");
const localValue = ref(props.node.params?.value || "");

// 获取上游 Schema
const upstreamSchema = computed(() => {
    const edges = graphStore.getIncomingEdges(props.node.id);
    if (edges.length === 0) return [];
    return metaStore.getMeta(edges[0].source).jsonSchemaTree || [];
});

// 提取出所有可选的基础字段，过滤掉数组和对象
const availableFields = computed(() => {
    const fields = [];
    
    function traverse(nodes) {
        for (const node of nodes) {
            if (node.typeLabel && !node.typeLabel.includes("[]") && !node.typeLabel.includes("{}")) {
                // 如果是基础类型（string, number 等），则列入过滤选项
                // 注意：需要拿到完整的 path
                fields.push({
                    label: `${node.label} (${node.typeLabel})`,
                    path: node.path.replace(/^root\.?/, "")
                });
            }
            if (node.children && node.children.length > 0) {
                traverse(node.children);
            }
        }
    }
    
    traverse(upstreamSchema.value);
    return fields;
});

function onParamChange() {
    graphStore.updateNodeParams(props.node.id, {
        field: localField.value,
        operator: localOperator.value,
        value: localValue.value,
    });
    emit("trigger-run");
}
</script>

<style scoped>
.json-filter-panel { width: 100%; max-width: 340px; display: flex; flex-direction: column; gap: 8px; }
.hint-text { font-size: 11px; color: var(--dc-text-secondary); line-height: 1.4; }
</style>
