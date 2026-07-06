<template>
  <!-- 子菜单类型：右侧弹出面板 -->
  <template v-if="menuItem.type === 'submenu'">
    <div
      class="submenu-root"
      @mouseenter="openPanel = true"
      @mouseleave="closeDelay()"
    >
      <el-menu-item
        :index="menuItem.label"
        :disabled="cmdState[menuItem.cmd]?.disabled ?? false"
        class="menu-item-full-row"
      >
        <span class="label-text">{{ menuItem.label }}</span>
        <span class="menu-suffix arrow-suffix">›</span>
      </el-menu-item>

      <div
        v-if="openPanel"
        class="right-sub-panel"
        @mouseenter="keepPanel()"
        @mouseleave="closeDelay()"
      >
        <el-menu mode="vertical">
          <template
            v-for="child in menuItem.subMenuList"
            :key="child.cmd || child.label || 'divider'"
          >
            <RecursiveMenuItem
              :menu-item="child"
              :cmd-state="cmdState"
              @item-click="handleItemClick"
            />
          </template>
        </el-menu>
      </div>
    </div>
  </template>

  <!-- 普通可点击命令项 -->
  <template v-else-if="menuItem.type === 'item'">
    <el-menu-item
      v-if="menuItem.cmd"
      :index="menuItem.cmd"
      :disabled="cmdState[menuItem.cmd]?.disabled ?? false"
      @click="handleItemClick(menuItem.cmd, true)"
      class="menu-item-full-row"
    >
      <span class="label-text">{{ menuItem.label }}</span>
      <span class="menu-suffix shortcut-suffix">{{
        menuItem.shortcut || ""
      }}</span>
    </el-menu-item>
  </template>

  <div v-else class="custom-divider"></div>
</template>

<script setup>
import { ref } from "vue";
const props = defineProps(["menuItem", "cmdState"]);
const emit = defineEmits(["item-click"]);

// 第二个参数 closeAfterClick：是否点击后关闭所有下拉
const handleItemClick = (cmd, closeAfterClick = false) => {
  emit("item-click", { cmd, closeAfterClick });
};

const openPanel = ref(false);
let timer = null;
const keepPanel = () => clearTimeout(timer);
const closeDelay = () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    openPanel.value = false;
  }, 120);
};
</script>

<style scoped>
.submenu-root {
  position: relative;
}
.menu-item-full-row {
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
  width: 100%;
}
.label-text {
  flex-shrink: 0;
}
.menu-suffix {
  flex-shrink: 0;
  color: #999;
  margin-left: 12px;
}
.arrow-suffix {
  font-size: 14px;
}
.right-sub-panel {
  position: absolute;
  top: 0;
  left: 100%;
  z-index: 9999;
  background: #fff;
  border: 1px solid #ddd;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  padding: 4px 0;
  min-width: 140px;
}
.custom-divider {
  width: 90%;
  height: 1px;
  background: #ddd;
  margin: 4px auto;
}
</style>

<style>
.right-sub-panel .el-menu {
  border: none;
}
.right-sub-panel .el-menu-item {
  height: 26px;
  line-height: 26px;
  padding: 0 14px;
  font-size: 13px;
}
</style>
