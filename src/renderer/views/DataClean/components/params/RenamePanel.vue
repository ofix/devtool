<!-- 重写：下拉列表式重命名，与 ColumnPicker 体验一致 -->
<template>
  <el-popover
    placement="bottom-start"
    :width="300"
    trigger="click"
    popper-class="column-picker-popover"
    :show-arrow="false"
  >
    <template #reference>
      <div class="picker-trigger">
        <el-input
          size="small"
          readonly
          :model-value="hasRename ? `已重命名 ${renamedCount} 列` : '无重命名'"
        >
          <template #suffix>
            <el-icon>
              <ArrowDown />
            </el-icon>
          </template>
        </el-input>
      </div>
    </template>

    <div class="picker-content">
      <!-- 顶部说明 -->
      <div class="rename-top-bar">
        <span class="rename-hint">输入新列名，留空则不改名</span>
      </div>

      <!-- 列表 -->
      <div class="rename-list custom-scrollbar">
        <div v-for="col in availableColumns" :key="col.name" class="rename-row">
          <span class="old-name" :title="col.name">{{ col.name }}</span>
          <el-input
            size="small"
            :model-value="getRenameValue(col.name)"
            @update:model-value="v => setRenameValue(col.name, v)"
            placeholder="新列名"
          />
        </div>
      </div>
    </div>
  </el-popover>
</template>

<script setup>
  import { ref, computed, watch } from "vue"
  import { ArrowDown } from "@element-plus/icons-vue"

  const props = defineProps({
    modelValue: { type: String, default: "" },
    columns: { type: Array, default: () => [] },
  })
  const emit = defineEmits(["update:modelValue"])

  // 内部维护一个响应式对象，而不是每次修改都解析字符串
  const renameMap = ref({})

  // 初始化解析
  function parseMap(str) {
    const map = {}
    if (str && str.trim()) {
      str.split(",").forEach(pair => {
        const [oldName, newName] = pair.split(":").map(s => s.trim())
        if (oldName && newName) map[oldName] = newName
      })
    }
    return map
  }

  // 监听外部值变化
  watch(
    () => props.modelValue,
    val => {
      renameMap.value = parseMap(val)
    },
    { immediate: true },
  )

  const availableColumns = computed(() => props.columns)
  const hasRename = computed(() => Object.keys(renameMap.value).length > 0)
  const renamedCount = computed(() => Object.keys(renameMap.value).length)

  function getRenameValue(oldName) {
    return renameMap.value[oldName] || ""
  }

  function setRenameValue(oldName, newName) {
    if (newName.trim()) {
      renameMap.value[oldName] = newName.trim()
    } else {
      delete renameMap.value[oldName]
    }
    // 同步出去
    const str = Object.entries(renameMap.value)
      .map(([k, v]) => `${k}:${v}`)
      .join(",")
    emit("update:modelValue", str)
  }
</script>

<style scoped>
  .picker-trigger {
    width: 100%;
  }

  .picker-content {
    display: flex;
    flex-direction: column;
    width: 100%;
    box-sizing: border-box;
  }

  .rename-top-bar {
    padding-bottom: 8px;
    border-bottom: 1px solid var(--dc-border, #e2e8f0);
    margin-bottom: 8px;
  }

  .rename-hint {
    font-size: 11px;
    color: var(--dc-text-secondary, #64748b);
  }

  .rename-list {
    max-height: 200px;
    overflow-y: auto;
    padding-right: 4px;
  }

  .rename-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .rename-row .old-name {
    width: 100px;
    font-size: 12px;
    color: var(--dc-text-primary, #1e293b);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rename-row .el-input {
    flex: 1;
  }

  /* 极简滚动条 */
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }

  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: transparent;
    border-radius: 3px;
  }

  .custom-scrollbar:hover::-webkit-scrollbar-thumb {
    background-color: rgba(150, 150, 150, 0.4);
  }

  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: rgba(150, 150, 150, 0.8);
  }
</style>
