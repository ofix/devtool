<!-- 修复：选中节点预览同步，同时增加更友好的空状态提示 -->
<template>
    <div class="preview-panel">
        <div class="preview-header">
            <div class="preview-title">
                <span class="title-text">{{ title }}</span>
                <span v-if="meta.rowCount > 0" class="title-meta">
                    {{ meta.rowCount }} 行 · {{ meta.columns.length }} 列
                </span>
            </div>
            <div class="preview-actions">
                <el-button size="small" text @click="$emit('refresh')">刷新</el-button>
            </div>
        </div>

        <div class="preview-body">
            <EmptyState
                v-if="!hasData"
                :text="emptyText"
            />
            <el-table-v2
                v-else
                :columns="tableColumns"
                :data="visibleRows"
                :width="tableWidth"
                :height="tableHeight"
                :row-height="32"
                :header-height="36"
                fixed
            />
        </div>
    </div>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount, watch } from "vue";
import EmptyState from "../common/EmptyState.vue";
import { useStoreDataCleanGraph } from "../../stores/StoreDataCleanGraph.js";
import { useStoreDataCleanMeta } from "../../stores/StoreDataCleanMeta.js";
import { useStoreDataCleanDatasets } from "../../stores/StoreDataCleanDatasets.js";

defineEmits(["refresh"]);

const graphStore = useStoreDataCleanGraph();
const metaStore = useStoreDataCleanMeta();
const datasetStore = useStoreDataCleanDatasets();

const container = ref(null);
const tableWidth = ref(800);
const tableHeight = ref(300);

// 依赖 Pinia 的响应式选中状态
const selected = computed(() => graphStore.selectedNode);
const meta = computed(() => {
    if (!selected.value) return { rowCount: 0, columns: [], stale: false, staleReason: null, error: null };
    return metaStore.getMeta(selected.value.id);
});

const dataset = computed(() => {
    if (!selected.value) return null;
    return datasetStore.getDataset(selected.value.id);
});

const title = computed(() => {
    if (!selected.value) return "未选中节点";
    const op = selected.value.type;
    return `${op} · ${selected.value.id.slice(0, 12)}`;
});

const hasData = computed(() => Boolean(dataset.value && dataset.value.rows.length > 0));

const emptyText = computed(() => {
    if (!selected.value) return "在画布上选中一个节点";
    if (meta.value.error) return `运行错误：${meta.value.error}`;
    if (meta.value.stale) return `上游已断开（${meta.value.staleReason || "参数已变更"}）`;
    if (dataset.value && dataset.value.rows.length === 0) return "节点输出为空";
    return "尚未运行，请检查参数或上游连线";
});

const visibleRows = computed(() => {
    if (!dataset.value) return [];
    return dataset.value.rows.slice(0, 200).map((row, idx) => ({ ...row, __idx: idx }));
});

const tableColumns = computed(() => {
    if (!meta.value.columns || meta.value.columns.length === 0) return [];
    return meta.value.columns.map((col) => ({
        key: col.name,
        dataKey: col.name,
        title: `${col.name} (${col.type})`,
        width: 140,
        resizable: true,
    }));
});

function measure() {
    if (!container.value) return;
    const rect = container.value.getBoundingClientRect();
    tableWidth.value = Math.max(200, rect.width - 8);
    tableHeight.value = Math.max(120, rect.height - 8);
}

let observer = null;

onMounted(() => {
    const el = document.querySelector(".preview-panel .preview-body");
    if (el) {
        container.value = el;
        measure();
        observer = new ResizeObserver(measure);
        observer.observe(el);
    }
});

onBeforeUnmount(() => {
    if (observer) observer.disconnect();
});
</script>

<style scoped>
.preview-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--dc-preview-bg, #ffffff);
    border-bottom: 1px solid var(--dc-border, #e2e8f0);
}
.preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 32px;
    padding: 0 12px;
    border-bottom: 1px solid var(--dc-border, #e2e8f0);
    background: var(--dc-preview-header-bg, #f8fafc);
}
.preview-title { display: flex; align-items: baseline; gap: 8px; font-size: 12px; }
.title-text { font-weight: 600; color: var(--dc-text-primary, #1e293b); }
.title-meta { color: var(--dc-text-secondary, #64748b); }
.preview-body { flex: 1; overflow: hidden; padding: 4px; }
</style>
