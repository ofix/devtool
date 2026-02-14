<template>
  <TitleBar :title="currentWndTitle" :wndKey="currentWndKey" />
  <div class="vscode-content">
    <el-container>
      <el-aside>
        <VSCodeMenu :default-menu-path="'/'" />
      </el-aside>
      <el-container>
        <el-main>
          <el-splitter direction="horizontal" class="debug-splitter">
            <el-splitter-panel :min="100" :size="300">
              <div class="panel-left">
                <router-view v-slot="{ Component }">
                  <KeepAlive>
                    <component :is="Component" />
                  </KeepAlive>
                </router-view>
              </div>
            </el-splitter-panel>
            <el-splitter-panel>
              <div class="panel-right">
                <CodeEditor />
              </div>
            </el-splitter-panel>
          </el-splitter>
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { useRoute } from "vue-router";
import VSCodeMenu from "@/components/VSCodeMenu.vue";
import TitleBar from "@/components/TitleBar.vue";
import CodeEditor from "@/views/DebugTool/CodeEditor.vue";

const route = useRoute();
const pathToWndKeyMap = {
  "/debug-tool/ssh": "SFTPWnd",
  "/debug-tool/search-replace": "SFTPWnd",
};

const currentWndKey = computed(() => {
  if (pathToWndKeyMap[route.path]) {
    return pathToWndKeyMap[route.path];
  }
  return "UnknownWnd";
});

const pathToWndTitleMap = {
  "/debug-tool/ssh": "SFTP连接管理",
  "/debug-tool/search-replace": "全局搜索替换",
};

const currentWndTitle = computed(() => {
  if (pathToWndTitleMap[route.path]) {
    return pathToWndTitleMap[route.path];
  }
  return "未知应用";
});

// （可选）监听路由/组件变化，手动更新 wndKey（兜底保障）
watch(
  () => route.fullPath, // 监听路由变化（组件变化会触发路由变化）
  () => {
    console.log("当前wndKey:", currentWndKey.value);
  },
  { immediate: true } // 初始化时执行一次
);
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
  width: 60p !important;
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
