<template>
  <TitleBar title="DevTool" wndKey="PostWomanWnd" />
  <div class="vscode-content">
    <el-container>
      <el-main>
        <el-splitter direction="horizontal" class="debug-splitter">
          <el-splitter-panel :min="100" :size="300">
            <div class="panel-left">
              <HttpsRequestListPanel />
            </div>
          </el-splitter-panel>
          <el-splitter-panel>
            <div class="panel-right">
              <HttpsRequestBuildPanel />
            </div>
          </el-splitter-panel>
        </el-splitter>
      </el-main>
    </el-container>
  </div>
</template>

<script setup>
import TitleBar from "@/components/TitleBar.vue";
import HttpsRequestListPanel from "../views/PostWoman/HttpsRequestListPanel.vue";
import HttpsRequestBuildPanel from "@/views/PostWoman/HttpsRequestBuildPanel.vue";
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

.page-debug {
  height: 100vh; /* 改为vh确保占满视口，或100%但需父级也有高度 */
  width: 100%;
}
.debug-splitter {
  height: 100%; /* 必须给splitter设置高度，否则子面板无法渲染 */
  width: 100%;
}

.panel-left {
  height: 100%;
}

.panel-right {
  height: 100%;
  width: 100%; /* 补充宽度，避免横向留白 */
  /* 兜底：确保内容溢出时可滚动 */
  overflow: hidden;
}
/* 穿透设置CodeEditor的根容器高度（如果样式隔离） */
:deep(.code-editor-container) {
  height: 100%;
  width: 100%;
}
</style>
