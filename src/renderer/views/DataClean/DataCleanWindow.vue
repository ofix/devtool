<!-- 使用 Element Plus 原生 splitter 重构上下布局，完美适配 Retina 屏幕 -->
<template>
    <div class="data-clean-app">
        <TopMenu @fit="onFit" @save="onSave" @load="onLoad" />
        
        <!-- 剩余空间全部交给 Splitter -->
        <div class="main-content">
            <el-splitter layout="vertical" style="height: 100%; width: 100%;">
                <!-- 上半部分：预览区 -->
                <el-splitter-panel size="45%" min="15%" max="80%">
                    <PreviewPanel @refresh="onRefreshPreview" />
                </el-splitter-panel>
                
                <!-- 下半部分：画布区 -->
                <el-splitter-panel>
                    <NodeEditor ref="editorRef" @trigger-run="onAutoRun" />
                </el-splitter-panel>
            </el-splitter>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { ElMessage } from "element-plus";
import TopMenu from "./components/layout/TopMenu.vue";
import PreviewPanel from "./components/layout/PreviewPanel.vue";
import NodeEditor from "./components/canvas/NodeEditor.vue";
import Engine from "./engine/Engine.js";
import Scheduler from "./engine/Scheduler.js";
import { serializePipeline } from "./pipeline/Serialize.js";
import { deserializePipeline } from "./pipeline/Deserialize.js";
import { useStoreDataCleanGraph } from "./stores/StoreDataCleanGraph.js";
import { useStoreDataCleanMeta } from "./stores/StoreDataCleanMeta.js";
import { useStoreDataCleanDatasets } from "./stores/StoreDataCleanDatasets.js";
import { useStoreDataCleanLog } from "./stores/StoreDataCleanLog.js";

const graphStore = useStoreDataCleanGraph();
const metaStore = useStoreDataCleanMeta();
const datasetStore = useStoreDataCleanDatasets();
const logStore = useStoreDataCleanLog();

const editorRef = ref(null);
const engine = new Engine({ metaStore, datasetStore, graphStore });
const scheduler = new Scheduler(engine);

// 自动运行
let runTimer = null;
let isRunning = false;

function onAutoRun() {
    if (runTimer) clearTimeout(runTimer);
    runTimer = setTimeout(() => {
        if (!isRunning) executeGraph();
        else setTimeout(onAutoRun, 500);
    }, 300);
}

async function executeGraph() {
    if (graphStore.nodes.length === 0) return;
    isRunning = true;
    try {
        await scheduler.runAll(graphStore.nodes, graphStore.edges, {
            log: (msg, level, nodeId) => logStore.push(msg, level, nodeId)
        });
        await writeOutputs();
    } catch (err) {
        logStore.push(`运行异常：${err.message}`, "error", null);
    } finally {
        isRunning = false;
    }
}

async function writeOutputs() {
    for (const node of graphStore.nodes) {
        if (node.type === "output") {
            const data = datasetStore.getDataset(node.id);
            if (!data || !node.params || !node.params.filePath) continue;
            try {
                const content = serializeData(data, node.params.format || "csv");
                await window.api.dataClean.fs.writeFile(node.params.filePath, content);
                logStore.push(`[Output] 已写入 ${node.params.filePath}`, "info", node.id);
            } catch (err) {
                logStore.push(`[Output] 写入失败：${err.message}`, "error", node.id);
            }
        } else if (node.type === "folderOutput") {
            const data = datasetStore.getDataset(node.id);
            const { outputDir, fileNameField, format = "csv" } = node.params || {};
            if (!data || !outputDir || !fileNameField) continue;

            const groups = new Map();
            for (const row of data.rows) {
                const fileName = String(row[fileNameField] || "unnamed");
                if (!groups.has(fileName)) groups.set(fileName, []);
                groups.get(fileName).push(row);
            }
            const ext = format === "json" ? ".json" : ".csv";
            for (const [fileName, rows] of groups.entries()) {
                const safeName = fileName.replace(/[\\/:*?"<>|]/g, "_");
                const targetPath = `${outputDir}/${safeName}${ext}`;
                try {
                    const content = serializeData({ rows, columns: data.columns }, format);
                    await window.api.dataClean.fs.writeFile(targetPath, content);
                    logStore.push(`[FolderOutput] 已写入 ${targetPath}（${rows.length} 行）`, "info", node.id);
                } catch (err) {
                    logStore.push(`[FolderOutput] 写入失败：${err.message}`, "error", node.id);
                }
            }
        }
    }
}

function serializeData(data, format) {
    if (format === "json") return JSON.stringify(data.rows, null, 2);
    const cols = data.columns.map((c) => c.name);
    const lines = [cols.map(c => escapeCsv(c)).join(",")];
    for (const row of data.rows) {
        lines.push(cols.map((c) => escapeCsv(row[c])).join(","));
    }
    return lines.join("\n");
}

function escapeCsv(v) {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function onRefreshPreview() {
    const id = graphStore.selectedNodeId;
    if (!id) return;
    await engine.runNode(id, { 
        log: (msg, level, nodeId) => logStore.push(msg, level, nodeId)
    });
}

function onFit() {
    const el = document.querySelector(".node-editor");
    if (el) el.dispatchEvent(new CustomEvent("dc-fit-view"));
}

async function onSave() {
    const json = JSON.stringify(serializePipeline(graphStore), null, 2);
    const path = await window.api.dataClean.dialog.saveFile({ filters: [{ name: "Pipeline", extensions: ["json"] }] });
    if (!path) return;
    await window.api.dataClean.pipeline.save(path, json);
    ElMessage.success("管线已保存");
    logStore.push(`[Pipeline] 已保存到 ${path}`, "info", null);
}

async function onLoad() {
    const path = await window.api.dataClean.dialog.openFile({ filters: [{ name: "Pipeline", extensions: ["json"] }] });
    if (!path) return;
    try {
        const json = await window.api.dataClean.pipeline.load(path);
        const result = deserializePipeline(json, graphStore);
        if (result.ok) {
            ElMessage.success("管线已加载");
            logStore.push(`[Pipeline] 已加载 ${path}`, "info", null);
            onAutoRun();
        } else {
            ElMessage.error(`加载失败：${result.error}`);
        }
    } catch (err) {
        ElMessage.error(`加载失败：${err.message}`);
    }
}
</script>

<style scoped>
.data-clean-app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--dc-app-bg, #ffffff);
    color: var(--dc-text-primary, #1e293b);
    overflow: hidden;
}

.main-content {
    flex: 1;
    min-height: 0; /* 关键：解决 flex 子项无法收缩的问题 */
    background: var(--dc-canvas-bg, #f8fafc);
}

/* 覆盖 Element Plus Splitter 的默认样式，让其融入我们的暗黑主题 */
:deep(.el-splitter-bar) {
    background-color: var(--dc-border, #e2e8f0);
    border: 1px solid var(--dc-app-bg, #ffffff);
}
:deep(.el-splitter-bar:hover) {
    background-color: var(--dc-edge-selected, #3b82f6);
}
</style>
