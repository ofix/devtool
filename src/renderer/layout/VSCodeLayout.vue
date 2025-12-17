<template>
  <VSCodeTitleBar title="DevTool" />
  <div class="vscode-content">
    <el-container>
      <el-aside>
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
import VSCodeTitleBar from "@/components/VSCodeTitleBar.vue";
</script>

<style type="scss" scoped>
.vscode-content {
  display: flex;
  height: calc(100% - var(--dt-titlebar-height));
  overflow-y: hidden;
  background: var(--dt-primary-bg-color);
}

.el-container {
  height: 100%;
}

.el-aside {
  background-color: var(--dt-primary-bg-color);
  border-right: 1px solid var(--dt-border-color);
}

.el-main {
  background-color: var(--dt-primary-bg-color);
  color: var(--dt-primary-text-color);
  padding: 0;
  overflow-y: hidden;
}
</style>
