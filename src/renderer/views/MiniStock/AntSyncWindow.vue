<template>
    <TitleBar title="DevTool" wndKey="AntSyncWnd" />
    <div class="app-container">
      <el-container class="layout">
        <!-- 左侧菜单 -->
        <el-aside width="100px" class="sidebar">
          <el-menu :active-menu="activeMenu" @select="handleMenuSelect" class="menu">
            <el-menu-item v-for="item in menuList" :key="item.index" :index="item.index">
              {{ item.label }}
            </el-menu-item>
          </el-menu>
        </el-aside>
        <!-- 右侧内容 -->
        <div class="content">
          <AntSyncBk v-if="activeMenu === 'bk'" />
          <AntSyncSettings v-else-if="activeMenu === 'settings'" />
          <div class="empty" v-else>待实现</div>
        </div>
      </el-container>
    </div>
  </template>
  
  <script setup>
  import { ref, watch } from "vue";
  import TitleBar from "@/components/TitleBar.vue";
  import AntSyncBk from "./AntSyncBk.vue";
  import AntSyncSettings from "./AntSyncSettings/index.vue";
  
  // 菜单配置
  const menuList = [
    { index: "bk", label: "板块" },
    { index: "market", label: "行情" },
    { index: "finance", label: "财务" },
    { index: "settings", label: "设置" },
  ];
  
  // 激活的菜单
  const activeMenu = ref(localStorage.getItem("ant_sync_active_menu") || "bk");
  
  // 切换菜单
  const handleMenuSelect = (index) => {
    activeMenu.value = index;
  };
  
  // 持久化
  watch(
    activeMenu,
    (val) => {
      localStorage.setItem("ant_sync_active_menu", val);
    },
    { immediate: true }
  );
  </script>
  
  <style scoped>
  .app-container {
    height: calc(100vh - var(--dt-titlebar-height));
    overflow: hidden;
  }
  .layout {
    height: 100%;
    display: flex;
  }
  
  /* 左侧 */
  .sidebar {
    background: #304156;
    height: 100%;
    overflow: hidden;
  }
  .menu {
    height: 100%;
    border-right: none;
    background: #304156;
    text-align: center;
  }
  
  /* 右侧 */
  .content {
    flex: 1;
    background:#F2F2F2;
    overflow-y: auto;
  }
  .empty {
    padding: 40px;
    text-align: center;
    color: #999;
  }
  
  /* 菜单样式 */
  :deep(.el-menu-item) { color: #bfcbd9; }
  :deep(.el-menu-item:hover) { color: #fff; background: #263445; }
  :deep(.el-menu-item.is-active) { color: #409eff; background: #263445; }
  </style>
  
  <!-- 滚动条美化 -->
  <style>
  .content::-webkit-scrollbar { width: 6px }
  .content::-webkit-scrollbar-thumb { background: #c0c4cc; border-radius: 3px }
  .content::-webkit-scrollbar-thumb:hover { background: #909399 }
  </style>