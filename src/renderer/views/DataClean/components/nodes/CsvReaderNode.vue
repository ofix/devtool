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
  const emit = defineEmits(["trigger-run"])

  // 只读取文件路径，不读取文件内容，数据读取交给底层的流式算子
  async function onPickFile() {
    const filePath = await window.api.dataClean.dialog.openFile({
      filters: [{ name: "CSV", extensions: ["csv"] }],
    })
    if (!filePath) return

    // 只更新路径，不读文件内容
    graphStore.updateNodeParams(props.node.id, { filePath })
    logStore.push(`[CSV Reader] 已选择文件: ${filePath}`)
  }

  function updateParam(field, value) {
    graphStore.updateNodeParams(props.node.id, { [field]: value })
  }

  async function handlePreview() {
    // 触发上层调度，由 Scheduler 去执行流式读取
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
