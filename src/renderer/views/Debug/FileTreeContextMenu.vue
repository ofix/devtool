<template>
  <!-- VS Code 风格原生右键菜单 -->
  <div
    v-if="show"
    class="vscode-context-menu"
    :style="{ left: `${x}px`, top: `${y}px` }"
    @click.stop
    @mouseleave="handleMouseLeave"
    tabindex="0"
    @keydown.esc="emit('close')"
  >
    <!-- 第一组：新建相关（仅文件夹显示） -->
    <template v-if="selectedNode?.type === 'folder'">
      <div class="menu-item" @click="emit('new-folder')">
        <span class="menu-label">新建文件夹</span>
        <span class="menu-shortcut">Ctrl+Shift+N</span>
      </div>
      <div class="menu-item" @click="emit('new-file')">
        <span class="menu-label">新建文件</span>
        <span class="menu-shortcut">Ctrl+N</span>
      </div>
      <div class="menu-separator"></div>
    </template>

    <!-- 第二组：编辑相关（所有节点显示） -->
    <div class="menu-item" @click="emit('rename')">
      <span class="menu-label">重命名</span>
      <span class="menu-shortcut">F2</span>
    </div>
    <div class="menu-item" @click="emit('copy-path')">
      <span class="menu-label">复制路径</span>
      <span class="menu-shortcut">Ctrl+Shift+C</span>
    </div>
    <div class="menu-separator"></div>

    <!-- 第三组：删除相关（所有节点显示） -->
    <div class="menu-item menu-danger" @click="emit('delete')">
      <span class="menu-label">删除</span>
      <span class="menu-shortcut">Delete</span>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from "vue";

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
  "new-folder", // 新建文件夹
  "new-file", // 新建文件
  "rename", // 重命名
  "copy-path", // 复制路径
  "delete", // 删除
]);

// 鼠标离开菜单时关闭（可选，保持原逻辑）
const handleMouseLeave = () => {
  emit("close");
};
</script>

<style>
@import "@/theme/VscodeContextMenu.css";
</style>
