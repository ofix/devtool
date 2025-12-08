<template>
  <div
    v-if="show"
    class="vscode-context-menu"
    :style="{ left: `${x}px`, top: `${y}px` }"
    @click.stop
    @mouseleave="handleMouseLeave"
    tabindex="0"
    @keydown.esc="emit('close')"
  >
    <div class="menu-item" @click="emit('open-connection')">
      <span class="menu-label">打开链接</span>
      <span class="menu-shortcut">Ctrl+Shift+S</span>
    </div>
    <div class="menu-item" @click="emit('close-connection')">
      <span class="menu-label">断开链接</span>
      <span class="menu-shortcut">Ctrl+N</span>
    </div>
    <div class="menu-separator"></div>

    <div class="menu-item" @click="emit('rename-connection')">
      <span class="menu-label">重命名</span>
      <span class="menu-shortcut">F2</span>
    </div>
    <div class="menu-item" @click="emit('edit-connection')">
      <span class="menu-label">编辑链接</span>
      <span class="menu-shortcut">Ctrl+Shift+C</span>
    </div>
    <div class="menu-separator"></div>

    <!-- 第三组：删除相关（所有节点显示） -->
    <div class="menu-item menu-danger" @click="emit('delete-connection')">
      <span class="menu-label">删除链接</span>
      <span class="menu-shortcut">Delete</span>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from "vue";

// 定义接收的 Props：从父组件传递过来的数据
const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  x: {
    type: Number,
    default: 0,
  },
  y: {
    type: Number,
    default: 0,
  },
  selectedNode: {
    type: Object,
    default: null,
  },
});

// 定义触发的 Events：向父组件传递操作指令
const emit = defineEmits([
  "close", // 关闭菜单
  "open-connection", // 打开链接
  "close-connection", // 关闭链接
  "rename-connection", // 重命名链接
  "edit-connection", // 编辑链接
  "delete-connection", // 删除链接
]);

// 鼠标离开菜单时关闭（可选，保持原逻辑）
const handleMouseLeave = () => {
  emit("close");
};
</script>

<style>
@import "@/theme/VscodeContextMenu.css";
</style>
