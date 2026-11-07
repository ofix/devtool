<template>
  <el-popover
    placement="bottom-start"
    :width="260"
    trigger="click"
    popper-class="column-picker-popover"
    :show-arrow="false"
  >
    <template #reference>
      <div class="picker-trigger">
        <el-input
          size="small"
          readonly
          :model-value="`已选 ${selectedColumns.length} / ${columns.length} 列`"
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
      <!-- 顶部搜索和全选，垂直居中对齐 -->
      <div class="picker-top-bar">
        <el-checkbox
          :model-value="isAllSelected"
          :indeterminate="isIndeterminate"
          @change="toggleAll"
          class="picker-all-check"
        />
        <el-input
          v-model="search"
          size="small"
          placeholder="搜索字段..."
          clearable
          class="picker-search-input"
        />
      </div>

      <!-- 列列表 -->
      <div class="picker-list custom-scrollbar">
        <el-checkbox-group v-model="selectedColumns" @change="onChange">
          <div v-for="col in filteredColumns" :key="col.name" class="picker-item">
            <el-checkbox :label="col.name">
              {{ col.name }} <span class="col-type">({{ col.type }})</span>
            </el-checkbox>
          </div>
        </el-checkbox-group>
        <div v-if="filteredColumns.length === 0" class="picker-empty">无匹配字段</div>
      </div>
    </div>
  </el-popover>
</template>

<script setup>
  import { ref, computed, watch } from "vue"
  import { ArrowDown } from "@element-plus/icons-vue"

  const props = defineProps({
    modelValue: { type: Array, default: () => [] },
    columns: { type: Array, default: () => [] },
  })
  const emit = defineEmits(["update:modelValue"])

  const search = ref("")
  const selectedColumns = ref([...props.modelValue])

  watch(
    () => props.modelValue,
    val => {
      selectedColumns.value = [...val]
    },
  )

  const filteredColumns = computed(() => {
    if (!search.value) return props.columns
    const lower = search.value.toLowerCase()
    return props.columns.filter(c => c.name.toLowerCase().includes(lower))
  })

  const isAllSelected = computed(() => {
    return (
      filteredColumns.value.length > 0 &&
      selectedColumns.value.length === filteredColumns.value.length
    )
  })

  const isIndeterminate = computed(() => {
    return (
      selectedColumns.value.length > 0 &&
      selectedColumns.value.length < filteredColumns.value.length
    )
  })

  function toggleAll(checked) {
    if (checked) {
      const toAdd = filteredColumns.value.map(c => c.name)
      const set = new Set([...selectedColumns.value, ...toAdd])
      selectedColumns.value = Array.from(set)
    } else {
      const toRemove = new Set(filteredColumns.value.map(c => c.name))
      selectedColumns.value = selectedColumns.value.filter(n => !toRemove.has(n))
    }
    onChange()
  }

  function onChange() {
    emit("update:modelValue", selectedColumns.value)
  }
</script>

<style scoped>
  .picker-trigger {
    width: 100%;
  }

  /* 强制填满 width */
  .picker-content {
    display: flex;
    flex-direction: column;
    width: 100%;
    box-sizing: border-box;
  }

  .picker-top-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--dc-border, #e2e8f0);
    margin-bottom: 8px;
  }

  .picker-all-check {
    margin-right: 0;
    height: 24px;
    display: flex;
    align-items: center;
  }

  .picker-search-input {
    flex: 1;
  }

  .picker-list {
    max-height: 200px;
    overflow-y: auto;
    padding-right: 4px;
  }

  .picker-item {
    padding: 2px 4px;
    border-radius: 4px;
  }

  .picker-item:hover {
    background: var(--dc-preview-header-bg, #f8fafc);
  }

  .col-type {
    font-size: 11px;
    color: var(--dc-text-secondary, #64748b);
  }

  .picker-empty {
    text-align: center;
    font-size: 12px;
    color: var(--dc-text-secondary, #64748b);
    padding: 12px 0;
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
