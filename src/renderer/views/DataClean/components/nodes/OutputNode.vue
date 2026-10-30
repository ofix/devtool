<!-- Output 节点：输出文件路径 + 格式 -->
<!-- 批次 1 只透传数据，落盘由 DataCleanApp 的运行流程统一处理 -->
<template>
    <BaseNode :node="node" :selected="selected">
        <ParamRow label="输出">
            <div class="file-row">
                <el-input
                    :model-value="node.params.filePath || ''"
                    size="small"
                    readonly
                    placeholder="选择输出路径"
                />
                <el-button size="small" @click="onPickPath">选择</el-button>
            </div>
        </ParamRow>
        <ParamRow label="格式">
            <el-select
                :model-value="node.params.format || 'csv'"
                size="small"
                style="width: 100%"
                @update:model-value="onFormatChange"
            >
                <el-option label="CSV" value="csv" />
                <el-option label="JSON" value="json" />
            </el-select>
        </ParamRow>
    </BaseNode>
</template>

<script setup>
import BaseNode from "./BaseNode.vue";
import ParamRow from "../params/ParamRow.vue";
import { useStoreDataCleanGraph } from "../../stores/StoreDataCleanGraph.js";

const props = defineProps({
    node: { type: Object, required: true },
    selected: { type: Boolean, default: false },
});

const graphStore = useStoreDataCleanGraph();

/**
 * 选择输出文件路径
 */
async function onPickPath() {
    const format = props.node.params.format || "csv";
    const filters =
        format === "json"
            ? [{ name: "JSON", extensions: ["json"] }]
            : [{ name: "CSV", extensions: ["csv"] }];
    const filePath = await window.api.dataClean.dialog.saveFile({ filters });
    if (!filePath) return;
    graphStore.updateNodeParams(props.node.id, { filePath });
}

/**
 * 切换格式
 * @param {string} format
 */
function onFormatChange(format) {
    graphStore.updateNodeParams(props.node.id, { format });
}
</script>

<style scoped>
.file-row {
    display: flex;
    gap: 4px;
    width: 100%;
}

.file-row .el-input {
    flex: 1;
    min-width: 0;
}
</style>
