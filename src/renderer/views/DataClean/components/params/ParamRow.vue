<!-- 缩小左侧标签宽度和间距 -->
<template>
  <div class="param-row">
    <label class="param-label" :title="label">{{ label }}</label>
    <div class="param-control">
      <slot />
    </div>
  </div>
</template>

<script setup>
  defineProps({
    label: { type: String, default: "" },
  })
</script>

<style scoped>
  .param-row {
    display: grid;
    grid-template-columns: 64px 1fr;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .param-label {
    text-align: left;
    font-size: 12px;
    line-height: 1.2;
    color: var(--dc-text-secondary, #64748b);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .param-control {
    min-width: 0;
    display: flex;
    align-items: center;
  }
</style>
