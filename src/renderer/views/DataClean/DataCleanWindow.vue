<!-- 增强全局调度的防抖与并发控制，避免异步竞态 -->
<template>
    <div class="data-clean-app">
        <TopMenu @fit="onFit" @save="onSave" @load="onLoad" />
        <div class="preview-area">
            <PreviewPanel @refresh="onRefreshPreview" />
        </div>
        <div class="canvas-area">
            <NodeEditor ref="editorRef" @trigger-run="onAutoRun" />
        </div>
        <div class="log-bar">
            <div class="log-header">
                <span>日志（{{ logStore.logs.length }}）</span>
                <el-button size="small" text @click="logStore.clear()">清空</el-button>
            </div>
            <div class="log-list">
                <div v-for="entry in reversedLogs" :key="entry.id" class="log-row" :class="'level-' + entry.level">
                    <span class="log-time">{{ entry.time }}</span>
                    <span class="log-msg">{{ entry.message }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed } from "vue";
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
const reversedLogs = computed(() => logStore.logs.slice().reverse());

let runTimer = null;
let isRunning = false; // 增加并发锁，防止调度器自己打断自己

function onAutoRun() {
    if (runTimer) clearTimeout(runTimer);
    runTimer = setTimeout(() => {
        if (!isRunning) {
            executeGraph();
        } else {
            // 如果当前正在跑，等 500ms 再试，确保最后一次修改被应用
            setTimeout(onAutoRun, 500);
        }
    }, 300);
}

async function executeGraph() {
    if (graphStore.nodes.length === 0) return;
    
    isRunning = true;
    try {
        // 使用 Scheduler 重新跑一遍拓扑
        await scheduler.runAll(graphStore.nodes, graphStore.edges, {
            log: (msg, level) => logStore.push(msg, level),
            onProgress: (cur, total, file) => {
                if (total > 0) logStore.push(`[Progress] 读取文件 ${cur}/${total}: ${file.split(/[/\\]/).pop()}`);
            }
        });
        
        await writeOutputs();
    } catch (err) {
        logStore.push(`运行异常：${err.message}`, "error");
    } finally {
        isRunning = false;
    }
}

async function writeOutputs() {
    for (const node of graphStore.nodes) {
        if (node.type === "output") {
            await writeSingleFile(node);
        } else if (node.type === "folderOutput") {
            await writeFolder(node);
        }
    }
}

async function writeSingleFile(node) {
    const data = datasetStore.getDataset(node.id);
    if (!data || !node.params || !node.params.filePath) return;
    try {
        const content = serializeData(data, node.params.format || "csv");
        await window.api.dataClean.fs.writeFile(node.params.filePath, content);
        logStore.push(`[Output] 已写入 ${node.params.filePath}`);
    } catch (err) {
        logStore.push(`[Output] 写入失败：${err.message}`, "error");
    }
}

async function writeFolder(node) {
    const data = datasetStore.getDataset(node.id);
    const { outputDir, fileNameField, format = "csv" } = node.params || {};
    if (!data || !outputDir || !fileNameField) return;

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
            logStore.push(`[FolderOutput] 已写入 ${targetPath}（${rows.length} 行）`);
        } catch (err) {
            logStore.push(`[FolderOutput] 写入失败：${err.message}`, "error");
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
    await engine.runNode(id, { log: (msg, level) => logStore.push(msg, level) });
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
    logStore.push(`[Pipeline] 已保存到 ${path}`);
}

async function onLoad() {
    const path = await window.api.dataClean.dialog.openFile({ filters: [{ name: "Pipeline", extensions: ["json"] }] });
    if (!path) return;
    try {
        const json = await window.api.dataClean.pipeline.load(path);
        const result = deserializePipeline(json, graphStore);
        if (result.ok) {
            ElMessage.success("管线已加载");
            logStore.push(`[Pipeline] 已加载 ${path}`);
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
    display: grid;
    grid-template-rows: 108px minmax(150px, 1fr) minmax(200px, 1fr) 120px;
    height: 100vh;
    background: var(--dc-app-bg, #ffffff);
    color: var(--dc-text-primary, #1e293b);
    overflow: hidden;
}
.preview-area { overflow: hidden; border-bottom: 1px solid var(--dc-border, #e2e8f0); z-index: 1; }
.canvas-area { overflow: hidden; border-bottom: 1px solid var(--dc-border, #e2e8f0); }
.log-bar {
    display: flex; flex-direction: column;
    background: var(--dc-log-bg, #0f172a); color: var(--dc-log-text, #e2e8f0);
    font-size: 11px; font-family: "SF Mono", Consolas, monospace;
}
.log-header { display: flex; justify-content: space-between; padding: 2px 12px; font-weight: 600; }
.log-list { flex: 1; overflow-y: auto; padding: 4px 12px; }
.log-row { display: flex; gap: 8px; line-height: 1.5; }
.log-time { color: var(--dc-log-time, #64748b); flex-shrink: 0; }
.level-warn .log-msg { color: #fbbf24; }
.level-error .log-msg { color: #f87171; }
</style>
