<template>
  <div class="search-bar">
    <!-- 搜索框：绑定响应式关键词，添加输入事件 -->
    <input
      type="text"
      class="search-input"
      placeholder="搜索应用名称/类别..."
      v-model="searchKeyword"
      @input="handleSearchInput"
    />

    <!-- 功能按钮 -->
    <div class="btn-group">
      <IconHelp class="icon-btn" @click="onHelp" />
      <IconShortcut class="icon-btn icon-shortcut" @click="onShortcut" />
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { inject } from "vue";
import IconHelp from "@/icons/IconHelp.vue";
import IconShortcut from "@/icons/IconShortcut.vue";

// 1. 响应式搜索关键词
const searchKeyword = ref("");

// 2. 定义自定义事件：向父组件传递搜索关键词
const emit = defineEmits(["search"]);

// 3. 输入事件：实时传递搜索关键词
const handleSearchInput = () => {
  emit("search", searchKeyword.value.trim().toLowerCase());
};

// 原有功能：帮助按钮
const handleHelpClick = inject("helpClickEvent");
const onHelp = () => {
  handleHelpClick();
};

// 原有功能：快捷键按钮
const handleShortcutClick = inject("shortcutClickEvent");
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
  background: rgba(0, 0, 0, 0.8);
}

.search-input {
  flex: 1;
  height: 28px;
  padding: 0 12px;
  border: 1px solid #ccc;
  background-color: #111;
  color: #f2f2f2;
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
