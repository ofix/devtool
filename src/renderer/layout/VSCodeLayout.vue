<template>
  <div style="display: flex; height: 100vh; background: #1a1a1a">
    <el-container>
      <el-aside width="64px">
        <!-- VSCode 风格菜单，支持路由跳转 -->
        <VSCodeMenu :default-menu-path="'/'" />
      </el-aside>
      <el-container>
        <el-main>
          <router-view />
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import { ref } from "vue";
import VSCodeMenu from "@/components/VSCodeMenu.vue";
</script>

<style type="scss" scoped>
.el-container {
  height: 100%;
}
.el-aside {
  background-color: #252526;
}
.el-main {
  background-color: #1e1e1e;
  color: #ffffff;
  padding: 0;
}
</style>
