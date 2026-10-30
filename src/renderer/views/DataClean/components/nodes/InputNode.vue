<!-- 修复：强化参数写入的原子性，确保触发运行前 rawText 已完全落盘 -->
<template>
    <BaseNode :node="node" :selected="selected">
        <ParamRow label="文件">
            <div class="file-row">
                <el-tooltip :content="node.params.filePath || '未选择文件'" placement="top" :show-after="500">
                    <el-input
                        :model-value="node.params.filePath || ''"
                        size="small"
                        readonly
                        placeholder="选择文件"
                        class="truncate-input"
                    />
                </el-tooltip>
                <el-button size="small" :loading="loading" @click="onPickFile">选择</el-button>
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
import { ref } from "vue";
import { ElMessage } from "element-plus";
import BaseNode from "./BaseNode.vue";
import ParamRow from "../params/ParamRow.vue";
import { useStoreDataCleanGraph } from "../../stores/StoreDataCleanGraph.js";
import { useStoreDataCleanLog } from "../../stores/StoreDataCleanLog.js";

const props = defineProps({
    node: { type: Object, required: true },
    selected: { type: Boolean, default: false },
});

const graphStore = useStoreDataCleanGraph();
const logStore = useStoreDataCleanLog();
const loading = ref(false);
const emit = defineEmits(['trigger-run']);

async function onPickFile() {
    const format = props.node.params.format || "csv";
    const filters = format === "json"
        ? [{ name: "JSON", extensions: ["json"] }]
        : [{ name: "CSV", extensions: ["csv"] }];
    
    const filePath = await window.api.dataClean.dialog.openFile({ filters });
    if (!filePath) return;
    
    // 先清空旧数据，避免配置残留
    graphStore.updateNodeParams(props.node.id, { filePath, rawText: "" });
    await autoReadFile(filePath);
}

async function autoReadFile(filePath) {
    loading.value = true;
    try {
        const text = await window.api.dataClean.fs.readFile(filePath);
        // 核心修复：将 rawText 和参数一起更新后，使用 nextTick 稍等片刻再触发运行
        graphStore.updateNodeParams(props.node.id, { rawText: text });
        logStore.push(`[Input] 已读取 ${filePath}`);
        
        // 给 Vue 的响应式系统一帧的时间同步状态，然后再触发重算
        setTimeout(() => {
            emit('trigger-run');
        }, 50);
    } catch (err) {
        ElMessage.error(`读取失败：${err.message}`);
        logStore.push(`[Input] 读取失败：${err.message}`, "error");
    } finally {
        loading.value = false;
    }
}

function onFormatChange(format) {
    graphStore.updateNodeParams(props.node.id, { format, rawText: "" });
    emit('trigger-run');
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
.file-row :deep(.el-tooltip__trigger) {
    flex: 1;
    min-width: 0;
    display: block;
}
</style>
