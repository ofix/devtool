<template>
  <div class="search-bar">
    <!-- 搜索框 -->
    <input type="text" class="search-input" placeholder="搜索..." />

    <!-- 功能按钮 -->
    <div class="btn-group">
      <IconHelp class="icon-btn" @click="onHelp" />
      <IconShortcut class="icon-btn icon-shortcut" @click="onShortcut" />
    </div>
  </div>
</template>

<script setup>
import { defineEmits } from "vue";
import { inject } from "vue";
import IconHelp from "@/icons/IconHelp.vue";
import IconShortcut from "@/icons/IconShortcut.vue";
const handleHelpClick = inject("helpClickEvent");
const handleShortcutClick = inject("shortcutClickEvent");
// 定义组件要触发的事件（替代原有的emits选项）
const emit = defineEmits(["help-click", "shortcut-click"]);

// 处理帮助按钮点击（替代原有的methods）
const onHelp = () => {
  handleHelpClick();
};

// 处理快捷键按钮点击
const onShortcut = () => {
  handleShortcutClick();
};
</script>

<style scoped>
.search-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  padding: 8px 12px;
  gap: 10px;
  margin-bottom: 10px;
}

.search-input {
  flex: 1;
  height: 28px;
  padding: 0 12px;
  border: 1px solid #ccc;
  background-color: #111;
  border-radius: 4px;
  outline: none;
  font-size: 14px;
}

.search-input:focus {
  border-color: #409eff;
}

.btn-group {
  display: flex;
  gap: 8px;
}

.icon-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  color: #ccc;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease;
}

.icon-shortcut {
  margin-top: 2px;
  width: 20px;
  height: 20px;
}

.icon-btn:hover {
  color: #fff;
}
</style>
