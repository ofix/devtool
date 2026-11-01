<template>
  <BaseNode :node="node" :selected="selected" @preview="handlePreview">
    <ParamRow label="文件">
      <div class="file-row">
        <el-input
          :model-value="node.params.filePath || ''"
          size="small"
          readonly
          placeholder="选择 JSON 文件"
        />
        <el-button size="small" @click="onPickFile">选择</el-button>
      </div>
    </ParamRow>
    <ParamRow label="根节点">
      <el-input
        :model-value="node.params.rootPath || ''"
        size="small"
        placeholder="如: data.items (留空取最外层)"
        @update:model-value="v => updateParam('rootPath', v)"
      />
    </ParamRow>
  </BaseNode>
</template>

<script setup>
  import { ref } from "vue"
  import { ElMessage } from "element-plus"
  import BaseNode from "./BaseNode.vue"
  import ParamRow from "../params/ParamRow.vue"
  import { useStoreDataCleanGraph } from "../../stores/StoreDataCleanGraph.js"
  import { useStoreDataCleanLog } from "../../stores/StoreDataCleanLog.js"
  import { useStoreDataCleanDatasets } from "../../stores/StoreDataCleanDatasets.js"

  const props = defineProps({
    node: { type: Object, required: true },
    selected: { type: Boolean, default: false },
  })
  const graphStore = useStoreDataCleanGraph()
  const logStore = useStoreDataCleanLog()
  const datasetStore = useStoreDataCleanDatasets()
  const loading = ref(false)
  const emit = defineEmits(["trigger-run"])

  async function onPickFile() {
    const filePath = await window.api.dataClean.dialog.openFile({
      filters: [{ name: "JSON", extensions: ["json"] }],
    })
    if (!filePath) return
    graphStore.updateNodeParams(props.node.id, { filePath })
    await autoReadFile(filePath)
  }

  async function autoReadFile(filePath) {
    loading.value = true
    try {
      const text = await window.api.dataClean.fs.readFile(filePath)
      graphStore.updateNodeParams(props.node.id, { rawText: text })
      logStore.push(`[JSON Reader] 已读取 ${filePath}`)
    } catch (err) {
      ElMessage.error(`读取失败：${err.message}`)
      logStore.push(`[JSON Reader] 读取失败：${err.message}`, "error")
    } finally {
      loading.value = false
    }
  }

  function updateParam(field, value) {
    graphStore.updateNodeParams(props.node.id, { [field]: value })
  }

  async function handlePreview() {
    datasetStore.removeDataset(props.node.id)
    emit("trigger-run")
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
