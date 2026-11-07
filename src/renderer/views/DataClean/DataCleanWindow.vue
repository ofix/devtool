<template>
  <div class="data-clean-app">
    <TopMenu @fit="onFit" @save="onSave" @load="onLoad" @run="executeGraph" />

    <div class="main-content">
      <el-splitter layout="vertical" style="height: 100%; width: 100%">
        <el-splitter-panel size="45%" min="15%" max="85%">
          <PreviewPanel @refresh="onRefreshPreview" />
        </el-splitter-panel>

        <el-splitter-panel size="55%" min="15%" max="85%">
          <NodeEditor ref="editorRef" @trigger-run="onNodePreview" />
        </el-splitter-panel>
      </el-splitter>
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted } from "vue"
  import { ElMessage } from "element-plus"
  import TopMenu from "./ui/panels/TopMenu.vue"
  import PreviewPanel from "./ui/panels/PreviewPanel.vue"
  import NodeEditor from "./ui/canvas/NodeEditor.vue"
  // 👇 只引入 Engine，彻底移除对 Scheduler 的引入
  import Engine from "./core/Engine.js"
  import { serializePipeline } from "./pipeline/Serialize.js"
  import { deserializePipeline } from "./pipeline/Deserialize.js"
  import { useStoreDataCleanGraph } from "./stores/StoreDataCleanGraph.js"
  import { useStoreDataCleanMeta } from "./stores/StoreDataCleanMeta.js"
  import { useStoreDataCleanPreview } from "./stores/StoreDataCleanPreview.js"
  import { useStoreDataCleanLog } from "./stores/StoreDataCleanLog.js"

  const graphStore = useStoreDataCleanGraph()
  const metaStore = useStoreDataCleanMeta()
  const previewStore = useStoreDataCleanPreview()
  const logStore = useStoreDataCleanLog()

  const editorRef = ref(null)

  // 👇 实例化 Engine，默认走 js 模式（后续可以通过 UI 切换为 duckdb）
  const engine = new Engine({
    metaStore,
    previewStore,
    graphStore,
    mode: "js",
  })

  // 当前活跃的 ProjectId (多标签页隔离，默认给一个)
  const projectId = "default-project"

  // 局部预览节点
  async function onNodePreview() {
    const id = graphStore.selectedNodeId
    if (!id) return

    try {
      // 👇 UI 直接调用 Engine，不再经过 Scheduler
      await engine.runTask(projectId, id, "preview", {
        log: (msg, level, nodeId) => logStore.push(msg, level, nodeId || id),
      })
    } catch (err) {
      ElMessage.error(`局部预览失败：${err.message}`)
    }
  }

  // 全量运行整图
  async function executeGraph() {
    if (graphStore.nodes.length === 0) {
      ElMessage.warning("画布为空，无法运行")
      return
    }
    logStore.push("开始运行全图...")
    try {
      // 👇 全量运行，targetNodeId 传 null
      await engine.runTask(projectId, null, "execute", {
        log: (msg, level, nodeId) => logStore.push(msg, level, nodeId),
      })
      ElMessage.success("运行完成")
    } catch (err) {
      logStore.push(`运行异常：${err.message}`, "error", null)
      ElMessage.error(`运行异常：${err.message}`)
    }
  }

  // 刷新预览
  async function onRefreshPreview() {
    const id = graphStore.selectedNodeId
    if (!id) return
    try {
      await engine.runTask(projectId, id, "preview", {
        log: (msg, level, nodeId) => logStore.push(msg, level, id),
      })
    } catch (err) {
      ElMessage.error(`刷新失败：${err.message}`)
    }
  }

  // 适应画布大小
  function onFit() {
    const el = document.querySelector(".node-editor")
    if (el) el.dispatchEvent(new CustomEvent("dc-fit-view"))
  }

  // 保存管线
  async function onSave() {
    const json = JSON.stringify(serializePipeline(graphStore), null, 2)
    const path = await window.api.dataClean.dialog.saveFile({
      filters: [{ name: "Pipeline", extensions: ["json"] }],
    })
    if (!path) return
    await window.api.dataClean.pipeline.save(path, json)
    ElMessage.success("管线已保存")
  }

  // 加载管线
  async function onLoad() {
    const path = await window.api.dataClean.dialog.openFile({
      filters: [{ name: "Pipeline", extensions: ["json"] }],
    })
    if (!path) return
    try {
      const json = await window.api.dataClean.pipeline.load(path)
      const result = deserializePipeline(json, graphStore)
      if (result.ok) {
        ElMessage.success("管线已加载")
      } else {
        ElMessage.error(`加载失败：${result.error}`)
      }
    } catch (err) {
      ElMessage.error(`加载失败：${err.message}`)
    }
  }

  // 生命周期钩子
  onMounted(async () => {
    // 👇 启动时初始化引擎
    await engine.init()
  })
</script>

<style scoped>
  .data-clean-app {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    background: var(--dc-app-bg, #ffffff);
    color: var(--dc-text-primary, #1e293b);
    overflow: hidden;
  }

  .main-content {
    flex: 1;
    min-height: 0;
    background: var(--dc-canvas-bg, #f8fafc);
    position: relative;
  }

  :deep(.el-splitter__panel) {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  :deep(.el-splitter-bar) {
    background-color: var(--dc-border, #e2e8f0);
    border: 1px solid var(--dc-app-bg, #ffffff);
  }

  :deep(.el-splitter-bar:hover) {
    background-color: var(--dc-edge-selected, #3b82f6);
  }
</style>
