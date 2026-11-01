<!-- 增强了文件类型过滤 -->
<template>
  <div class="file-picker">
    <el-tooltip :content="modelValue || '未选择'" placement="top" :show-after="500">
      <el-input :model-value="modelValue || ''" size="small" readonly placeholder="未选择" />
    </el-tooltip>
    <el-button size="small" @click="onPick">{{ isFolder ? "选目录" : "选文件" }}</el-button>
  </div>
</template>

<script setup>
  const props = defineProps({
    modelValue: { type: String, default: "" },
    isFolder: { type: Boolean, default: false },
    extensions: { type: Array, default: () => [] }, // 支持扩展名过滤
  })
  const emit = defineEmits(["update:modelValue"])

  async function onPick() {
    if (props.isFolder) {
      const dir = await window.api.dataClean.dialog.openDirectory()
      if (dir) emit("update:modelValue", dir)
    } else {
      const filters =
        props.extensions.length > 0 ? [{ name: "Files", extensions: props.extensions }] : []
      const file = await window.api.dataClean.dialog.openFile({ filters })
      if (file) emit("update:modelValue", file)
    }
  }
</script>

<style scoped>
  .file-picker {
    display: flex;
    gap: 4px;
    width: 100%;
  }

  .file-picker .el-input {
    flex: 1;
    min-width: 0;
  }

  .file-picker :deep(.el-tooltip__trigger) {
    flex: 1;
    min-width: 0;
    display: block;
  }
</style>
