<template>
    <div class="vscode-top-menu-bar" @click.self="closeAllPanel">
      <div
        v-for="rootNode in menuList"
        :key="getMenuKey(rootNode)"
        class="menu-root"
        @mouseenter="handleRootEnter(rootNode)"
        @mouseleave="handleRootLeave(rootNode)"
      >
        <span class="root-label">{{ rootNode.label }}</span>
        <div
          v-if="activeLabel === rootNode.label"
          class="sub-panel"
          @mouseenter="panelHover = true"
          @mouseleave="panelHover = false"
        >
          <el-menu mode="vertical" :cmd-state="cmdState">
            <template v-for="child in rootNode.subMenuList" :key="getMenuKey(child)">
              <RecursiveMenuItem
                :menu-item="child"
                :cmd-state="cmdState"
                @item-click="onItemClick"
              />
            </template>
          </el-menu>
        </div>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref } from "vue";
  import RecursiveMenuItem from "./RecursiveMenuItem.vue";
  
  const props = defineProps(["menuList", "cmdState"]);
  const emit = defineEmits(["menu-click"]);
  
  const activeLabel = ref("");
  const panelHover = ref(false);
  let leaveTimer = null;
  
  const getMenuKey = (menu) => {
    if (menu.type === "divider") return `divider_${menu.label ?? "static"}`;
    return menu.cmd || menu.label;
  };
  
  const handleRootEnter = (node) => {
    clearTimeout(leaveTimer);
    activeLabel.value = node.label;
  };
  const handleRootLeave = () => {
    leaveTimer = setTimeout(() => {
      if (!panelHover.value) activeLabel.value = "";
    }, 120);
  };
  const closeAllPanel = () => {
    activeLabel.value = "";
  };
  
  // 【核心修复】判断是否需要关闭面板
  const onItemClick = ({ cmd, closeAfterClick }) => {
    emit("menu-click", cmd);
    // 普通菜单项点击，关闭所有下拉
    if (closeAfterClick) {
      closeAllPanel();
    }
  };
  </script>
  
  <style scoped>
  .vscode-top-menu-bar {
    display: flex;
    align-items: center;
    height: 30px;
    position: relative;
    background: #f3f3f3;
    font-size: 13px;
    user-select: none;
    -webkit-app-region: drag;
  }
  .menu-root {
    position: relative;
    height: 30px;
    line-height: 30px;
    padding: 0 10px;
    cursor: default;
    -webkit-app-region: no-drag;
  }
  .menu-root:hover {
    background: #e1e1e1;
  }
  .sub-panel {
    position: absolute;
    top: 30px;
    left: 0;
    z-index: 9999;
    background: #fff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    border: 1px solid #ddd;
    padding: 4px 0;
    min-width: 140px;
  }
  </style>
  
  <style>
  .sub-panel .el-menu {
    border: none;
  }
  .sub-panel .el-menu-item {
    height: 26px;
    line-height: 26px;
    padding: 0 14px;
    font-size: 13px;
  }
  .sub-panel .el-sub-menu__title {
    height: 26px;
    line-height: 26px;
    padding: 0 14px;
    font-size: 13px;
  }
  </style>