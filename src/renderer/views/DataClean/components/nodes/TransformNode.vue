<!-- 支持更多 component 类型：folder, saveFile -->
<template>
    <BaseNode :node="node" :selected="selected">
        <template v-for="row in schema" :key="row.field">
            <ParamRow :label="row.label">
                <!-- 表达式 -->
                <div v-if="row.component === 'expression'" class="expr-container">
                    <div class="expr-main">
                        <ExpressionEditor 
                            :model-value="node.params[row.field] || ''"
                            @update:model-value="(v) => updateParam(row.field, v)"
                        />
                    </div>
                    <div class="expr-side">
                        <FieldListPanel 
                            :columns="getColumnsForRow(row)" 
                            @select="(f) => insertField(row.field, f)"
                        />
                    </div>
                </div>

                <!-- 文件夹选择 -->
                <FilePicker 
                    v-else-if="row.component === 'folder'"
                    :model-value="node.params[row.field]"
                    :is-folder="true"
                    @update:model-value="(v) => updateParam(row.field, v)"
                />
                
                <!-- 文件保存 -->
                <FilePicker 
                    v-else-if="row.component === 'saveFile'"
                    :model-value="node.params[row.field]"
                    :is-folder="false"
                    @update:model-value="(v) => updateParam(row.field, v)"
                />

                <!-- 字段下拉 -->
                <el-select
                    v-else-if="row.component === 'fieldSelect'"
                    :model-value="node.params[row.field] || (row.multiple ? [] : '')"
                    size="small"
                    style="width: 100%"
                    :multiple="row.multiple"
                    filterable
                    @update:model-value="(v) => updateParam(row.field, v)"
                >
                    <el-option 
                        v-for="col in getColumnsForRow(row)" 
                        :key="col.name" 
                        :label="`${col.name} (${col.type})`" 
                        :value="col.name" 
                    />
                </el-select>

                <!-- 枚举 -->
                <el-select
                    v-else-if="row.component === 'select'"
                    :model-value="node.params[row.field] || ''"
                    size="small"
                    style="width: 100%"
                    @update:model-value="(v) => updateParam(row.field, v)"
                >
                    <el-option v-for="opt in row.options" :key="opt.value" :label="opt.label" :value="opt.value" />
                </el-select>
                
                <!-- 普通输入 -->
                <el-input 
                    v-else
                    :model-value="node.params[row.field] || ''"
                    size="small"
                    :placeholder="row.defaultValue || ''"
                    @update:model-value="(v) => updateParam(row.field, v)"
                />
            </ParamRow>
        </template>
    </BaseNode>
</template>

<script setup>
import { computed } from "vue";
import BaseNode from "./BaseNode.vue";
import ParamRow from "../params/ParamRow.vue";
import ExpressionEditor from "../expression/ExpressionEditor.vue";
import FieldListPanel from "../params/FieldListPanel.vue";
import FilePicker from "../params/FilePicker.vue";
import { useStoreDataCleanGraph } from "../../stores/StoreDataCleanGraph.js";
import { useStoreDataCleanMeta } from "../../stores/StoreDataCleanMeta.js";
import { getOperator } from "../../engine/operators/index.js";

const props = defineProps({
    node: { type: Object, required: true },
    selected: { type: Boolean, default: false },
});

const emit = defineEmits(["trigger-run"]);
const graphStore = useStoreDataCleanGraph();
const metaStore = useStoreDataCleanMeta();

const op = computed(() => getOperator(props.node.type));
const schema = computed(() => op.value ? op.value.schema || [] : []);
const incomingEdges = computed(() => graphStore.getIncomingEdges(props.node.id));

function getColumnsForRow(row) {
    if (incomingEdges.value.length === 0) return [];
    let targetEdge = incomingEdges.value[0];
    if (row.sourcePort !== undefined) {
        const handle = `in-${row.sourcePort}`;
        const matched = incomingEdges.value.find(e => e.targetHandle === handle);
        if (matched) targetEdge = matched;
        else return [];
    }
    return metaStore.getMeta(targetEdge.source).columns || [];
}

function updateParam(field, value) {
    graphStore.updateNodeParams(props.node.id, { [field]: value });
    emit("trigger-run");
}

function insertField(rowField, fieldName) {
    const current = props.node.params[rowField] || "";
    const newVal = current + (current ? " " : "") + fieldName;
    updateParam(rowField, newVal);
}
</script>

<style scoped>
.expr-container { display: flex; gap: 8px; width: 100%; }
.expr-main { flex: 1; min-width: 0; }
.expr-side { width: 120px; flex-shrink: 0; }
</style>
