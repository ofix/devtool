<!-- src/renderer/App.vue -->
<template>
  <div id="app">
    <el-container class="app-container">
      <!-- 侧边栏导航 -->
      <el-aside width="240px" class="app-sidebar">
        <div class="logo">
          <el-icon :size="32"><Monitor /></el-icon>
          <span>Crawler Framework</span>
        </div>
        
        <el-menu
          :default-active="activeMenu"
          router
          class="sidebar-menu"
          background-color="#304156"
          text-color="#bfcbd9"
          active-text-color="#409EFF"
        >
          <el-menu-item index="/dashboard">
            <el-icon><Odometer /></el-icon>
            <span>仪表板</span>
          </el-menu-item>
          
          <el-menu-item index="/config">
            <el-icon><Setting /></el-icon>
            <span>配置管理</span>
          </el-menu-item>
          
          <el-menu-item index="/files">
            <el-icon><FolderOpened /></el-icon>
            <span>文件管理</span>
          </el-menu-item>
          
          <el-menu-item index="/logs">
            <el-icon><Document /></el-icon>
            <span>日志查看</span>
          </el-menu-item>
          
          <el-menu-item index="/statistics">
            <el-icon><DataAnalysis /></el-icon>
            <span>统计分析</span>
          </el-menu-item>
        </el-menu>
      </el-aside>
      
      <!-- 主内容区域 -->
      <el-container>
        <el-header class="app-header">
          <div class="header-left">
            <el-breadcrumb separator="/">
              <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
              <el-breadcrumb-item>{{ currentRouteName }}</el-breadcrumb-item>
            </el-breadcrumb>
          </div>
          
          <div class="header-right">
            <el-badge :value="notificationCount" :hidden="notificationCount === 0">
              <el-icon :size="20"><Bell /></el-icon>
            </el-badge>
            
            <el-dropdown @command="handleCommand">
              <span class="user-info">
                <el-avatar :size="32" :src="userAvatar" />
                <span>{{ userName }}</span>
                <el-icon><ArrowDown /></el-icon>
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="settings">系统设置</el-dropdown-item>
                  <el-dropdown-item command="about">关于</el-dropdown-item>
                  <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </el-header>
        
        <el-main class="app-main">
          <router-view />
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';

const route = useRoute();
const activeMenu = ref('/dashboard');
const notificationCount = ref(0);
const userName = ref('Admin');
const userAvatar = ref('');

const currentRouteName = computed(() => {
  const meta = route.meta;
  return meta?.title || route.name || '首页';
});

const handleCommand = (command) => {
  if (command === 'logout') {
    ElMessage.info('退出登录');
  } else if (command === 'settings') {
    ElMessage.info('系统设置');
  } else if (command === 'about') {
    ElMessage.info('Crawler Framework v1.0.0');
  }
};
</script>

<style scoped>
.app-container {
  height: 100vh;
}

.app-sidebar {
  background-color: #304156;
  overflow-y: auto;
}

.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #fff;
  font-size: 18px;
  font-weight: bold;
  background-color: #2b3a4a;
}

.sidebar-menu {
  border-right: none;
}

.app-header {
  background-color: #fff;
  border-bottom: 1px solid #e6e6e6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
}

.header-left {
  display: flex;
  align-items: center;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.app-main {
  background-color: #f0f2f6;
  padding: 20px;
}
</style>