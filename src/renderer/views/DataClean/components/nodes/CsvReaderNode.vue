<template>
  <BaseNode :node="node" :selected="selected" @preview="handlePreview">
    <ParamRow label="文件">
      <div class="file-row">
        <el-input
          :model-value="node.params.filePath || ''"
          size="small"
          readonly
          placeholder="选择 CSV 文件"
        />
        <el-button size="small" @click="onPickFile">选择</el-button>
      </div>
    </ParamRow>
    <ParamRow label="编码">
      <el-select
        :model-value="node.params.encoding || 'utf-8'"
        size="small"
        style="width: 100%"
        @update:model-value="v => updateParam('encoding', v)"
      >
        <el-option label="UTF-8" value="utf-8" />
        <el-option label="GBK" value="gbk" />
      </el-select>
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
      filters: [{ name: "CSV", extensions: ["csv"] }],
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
      logStore.push(`[CSV Reader] 已读取 ${filePath}`)
    } catch (err) {
      ElMessage.error(`读取失败：${err.message}`)
      logStore.push(`[CSV Reader] 读取失败：${err.message}`, "error")
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
