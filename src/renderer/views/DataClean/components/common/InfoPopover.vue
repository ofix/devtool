<template>
  <el-popover placement="right" :width="320" trigger="hover" popper-class="help-popover">
    <template #reference>
      <el-icon class="help-icon"><QuestionFilled /></el-icon>
    </template>
    <div class="help-content">
      <h4 v-if="title" class="help-title">{{ title }}</h4>
      <div class="help-body"><slot /></div>
    </div>
  </el-popover>
</template>

<script setup>
  import { QuestionFilled } from "@element-plus/icons-vue"
  defineProps({ title: String })
</script>

<style scoped>
  .help-icon {
    margin-left: 4px;
    color: var(--dc-text-secondary, #94a3b8);
    cursor: help;
    font-size: 14px;
    transition: color 0.2s;
  }
  .help-icon:hover {
    color: var(--dc-edge-selected, #3b82f6);
  }
</style>

<style>
  /* 全局样式，用于渲染 Markdown 样式的提示 */
  .help-popover {
    padding: 12px !important;
    background: var(--dc-node-bg, #ffffff) !important;
    border: 1px solid var(--dc-border, #e2e8f0) !important;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
  }
  .help-content {
    font-size: 12px;
    line-height: 1.6;
    color: var(--dc-text-primary);
  }
  .help-title {
    font-weight: 600;
    margin-bottom: 8px;
    font-size: 13px;
    border-bottom: 1px solid var(--dc-border);
    padding-bottom: 4px;
  }
  .help-body ul {
    padding-left: 16px;
    margin-bottom: 8px;
  }
  .help-body code {
    background: var(--dc-canvas-bg);
    padding: 2px 4px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 11px;
  }
</style>
