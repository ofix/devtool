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
import VSCodeTitleBar from "@/components/VScodeTitleBar.vue";
</script>

<style type="scss" scoped>
.vscode-content {
  display: flex;
  height: calc(100% - var(--titlebar-height));
  overflow-y: hidden;
  background: #1a1a1a;
}
.el-container {
  height: 100%;
}
.el-aside {
  background-color: #252526;
}

@media screen and (resolution: 1.5dppx) {
  .el-aside {
    width: 48px;
  }
}
@media screen and (resolution: 2dppx) {
  .el-aside {
    width: 32px;
  }
}

.el-main {
  background-color: #1e1e1e;
  color: #ffffff;
  padding: 0;
}
</style>
