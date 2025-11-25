<!-- components/FileTreeContextMenu.vue -->
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

// 定义接收的 Props：从父组件传递过来的数据
const props = defineProps({
  // 是否显示菜单
  show: {
    type: Boolean,
    default: false,
  },
  // 菜单横坐标
  x: {
    type: Number,
    default: 0,
  },
  // 菜单纵坐标
  y: {
    type: Number,
    default: 0,
  },
  // 右键选中的节点
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

<style scoped>
/* VS Code 风格右键菜单核心样式（迁移原样式） */
.vscode-context-menu {
  position: fixed;
  width: 220px;
  /* VS Code 菜单宽度 */
  background-color: var(--dt-context-menu-bg-color);
  border: 1px solid var(--dt-border-color);
  border-radius: 4px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  /* 深沉阴影，贴近 VS Code */
  z-index: 99999;
  /* 确保在所有组件之上 */
  padding: 4px 0;
  outline: none;
  font-size: 13px;
  /* VS Code 字体大小 */
}

/* 菜单项样式 */
.menu-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 12px;
  cursor: pointer;
  color: var(--dt-context-menu-text-color);
  transition: background-color 0.1s ease;
}

/* hover 高亮（VS Code 浅蓝背景） */
.menu-item:hover:not(.menu-danger) {
  background-color: rgba(66, 133, 244, 0.15);
  color: var(--el-color-primary);
}

/* 危险操作样式（删除） */
.menu-danger {
  color: #ff4d4f;
}

.menu-danger:hover {
  background-color: rgba(255, 77, 79, 0.1) !important;
}

/* 菜单分隔线 */
.menu-separator {
  height: 1px;
  background-color: var(--dt-border-color);
  margin: 4px 0;
}

/* 快捷键提示样式（右对齐、灰色） */
.menu-shortcut {
  color: var(--dt-context-menu-text-color);
  font-size: 11px;
}

.menu-item:hover .menu-shortcut {
  color: var(--dt-hilight-text-color);
}

.menu-item:hover:not(.menu-danger) {
  background-color: var(--dt-hilight-bg-color);
  color: var(--dt-hilight-text-color);
}

.menu-separator {
  background-color: var(--dt-border-color);
}
</style>
