<template>
  <TitleBar title="DevTool" wndKey="AntSyncWnd" />
  <div class="app-container">
    <el-container style="height: 100vh">
      <!-- 左侧菜单 -->
      <el-aside width="100px" class="sidebar">
        <el-menu
          :default-active="activeMenu"
          @select="handleMenuSelect"
          style="height: 100%"
        >
          <el-menu-item index="plate">
            <span>板块</span>
          </el-menu-item>
          <el-menu-item index="market">
            <span>行情</span>
          </el-menu-item>
          <el-menu-item index="finance">
            <span>财务</span>
          </el-menu-item>
          <el-menu-item index="settings">
            <span>设置</span>
          </el-menu-item>
        </el-menu>
      </el-aside>

      <!-- 右侧内容 -->
      <AntSyncBk v-if="activeMenu === 'plate'" />
      <AntSyncSettings v-else-if="activeMenu == 'settings'" />
      <div v-else>待实现</div>
    </el-container>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from "vue";
import TitleBar from "@/components/TitleBar.vue";
import AntSyncBk from "./AntSyncBk.vue";
import AntSyncSettings from "./AntSyncSettings/index.vue";
const activeMenu = ref("plate"); // 左侧菜单选中项：plate, market, finance

// 左侧菜单选择
const handleMenuSelect = (index) => {
  activeMenu.value = index;

  // 切换菜单时重置状态
  if (index === "plate") {
    // 切换到板块，加载当前选中的板块类型数据
    currentBkType.value = "concept";
    searchText.value = "";
    currentPage.value = 1;
    expandedRows.value = {};
    loadBkData();
  } else {
    // 切换到行情或财务，清空板块相关数据
    searchText.value = "";
    currentPage.value = 1;
    expandedRows.value = {};
  }
};
</script>

<style scoped>
.app-container {
  height: calc(100% - var(--dt-titlebar-height));
  overflow: hidden;
}

.sidebar {
  background-color: #304156;
  color: #fff;
}

.sidebar :deep(.el-menu) {
  border-right: none;
  background-color: #304156;
}

.sidebar :deep(.el-menu-item) {
  color: #bfcbd9;
}

.sidebar :deep(.el-menu-item:hover) {
  color: #fff;
  background-color: #263445;
}

.sidebar :deep(.el-menu-item.is-active) {
  color: #409eff;
  background-color: #263445;
}
</style>
