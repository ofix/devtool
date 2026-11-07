<!-- 空状态占位：预览面板无数据时显示 -->
<template>
  <div class="empty-state">
    <div class="empty-text">{{ text }}</div>
  </div>
</template>

<script setup>
  defineProps({
    text: { type: String, default: "暂无数据" },
  })
</script>

<style scoped>
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--dc-text-secondary, #94a3b8);
    font-size: 12px;
    text-align: center;
    padding: 12px;
  }
</style>
