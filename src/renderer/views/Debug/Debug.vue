<template>
  <div class="page-debug">
    <el-splitter direction="horizontal" class="debug-splitter">
      <el-splitter-panel :min="100" :size="300">
        <div class="panel-left">
          <DebugLeftPanel />
        </div>
      </el-splitter-panel>
      <el-splitter-panel>
        <div class="panel-right">
          <CodeEditor />
        </div>
      </el-splitter-panel>
    </el-splitter>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watchEffect, toValue } from "vue";
import DebugLeftPanel from "./DebugLeftPanel.vue";
import CodeEditor from "./CodeEditor.vue";

onMounted(() => {
//   window.channel.on("download-dir-progress", (data) => {
//     console.log("接收消息 download-dir-progress", data);
//   });
//   window.channel.on("upload-dir-progress", (data) => {
//     console.log("接收消息 upload-dir-progress", data);
//   });
});
onUnmounted(() => {
});
</script>

<style scoped>
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
