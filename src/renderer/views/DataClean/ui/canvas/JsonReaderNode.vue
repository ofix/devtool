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
        <el-button size="small" :loading="loading" @click="onPickFile">选择</el-button>
      </div>
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

  const props = defineProps({
    node: { type: Object, required: true },
    selected: { type: Boolean, default: false },
  })

  const graphStore = useStoreDataCleanGraph()
  const logStore = useStoreDataCleanLog()
  const loading = ref(false)
  const emit = defineEmits(["trigger-run"])

  async function onPickFile() {
    const filePath = await window.api.dataClean.dialog.openFile({
      filters: [{ name: "JSON", extensions: ["json"] }],
    })
    if (!filePath) return

    // 只更新路径，清空旧的 rawText 缓存
    graphStore.updateNodeParams(props.node.id, { filePath, rawText: "" })
    logStore.push(`[JSON Reader] 已选择文件: ${filePath}`)

    // 选完文件，直接触发预览（可选）
    handlePreview()
  }

  async function handlePreview() {
    // 👇 核心：UI 层不再自己去读文件、去清空 Dataset。
    // 所有数据生命周期（清理、流控、截断、缓存）全部交由 Engine + Scheduler 接管。
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
