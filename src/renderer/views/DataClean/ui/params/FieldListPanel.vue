<!-- 字段常驻列表，方便点击插入编辑器 -->
<template>
  <div class="field-list-panel">
    <div class="field-list-header">字段列表</div>
    <div class="field-search">
      <el-input size="small" v-model="search" placeholder="搜索字段..." clearable />
    </div>
    <div class="field-items">
      <div
        v-for="col in filteredColumns"
        :key="col.name"
        class="field-item"
        @click="$emit('select', col.name)"
      >
        <span class="col-name">{{ col.name }}</span>
        <span class="col-type">{{ col.type }}</span>
      </div>
      <div v-if="filteredColumns.length === 0" class="field-empty">无字段</div>
    </div>
  </div>
</template>

<script setup>
  import { ref, computed } from "vue"

  const props = defineProps({
    columns: { type: Array, default: () => [] },
  })
  defineEmits(["select"])

  const search = ref("")
  const filteredColumns = computed(() => {
    if (!search.value) return props.columns
    const lower = search.value.toLowerCase()
    return props.columns.filter(c => c.name.toLowerCase().includes(lower))
  })
</script>

<style scoped>
  .field-list-panel {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--dc-border, #e2e8f0);
    border-radius: 4px;
    background: var(--dc-node-bg, #ffffff);
    height: 100%;
    min-height: 120px;
  }

  .field-list-header {
    font-size: 11px;
    font-weight: 600;
    padding: 4px 8px;
    background: var(--dc-preview-header-bg, #f8fafc);
    border-bottom: 1px solid var(--dc-border, #e2e8f0);
    color: var(--dc-text-primary);
  }

  .field-search {
    padding: 4px;
    border-bottom: 1px solid var(--dc-border, #e2e8f0);
  }

  .field-items {
    flex: 1;
    overflow-y: auto;
  }

  .field-item {
    display: flex;
    justify-content: space-between;
    padding: 4px 8px;
    font-size: 11px;
    cursor: pointer;
    border-bottom: 1px dashed var(--dc-border, #f1f5f9);
  }

  .field-item:hover {
    background: var(--dc-preview-header-bg, #f8fafc);
  }

  .col-name {
    color: var(--dc-text-primary);
    font-weight: 500;
  }

  .col-type {
    color: var(--dc-text-secondary);
    opacity: 0.7;
  }

  .field-empty {
    padding: 8px;
    text-align: center;
    font-size: 11px;
    color: var(--dc-text-secondary);
  }
</style>
