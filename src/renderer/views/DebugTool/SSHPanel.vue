<template>
  <div class="debug-left-panel">
    <el-collapse
      expand-icon-position="left"
      class="dt-collapse"
      v-model="activeNames"
    >
      <ServerList />
      <FileTree />
      <el-collapse-item title="OUTLINE" name="3"> </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup>
import { ref } from "vue";
import FileTree from "@/views/DebugTool/FileTree.vue";
import ServerList from "@/views/DebugTool/ServerList.vue";

const activeNames = ref(["1", "2"]);
</script>
<style scoped>
.debug-left-panel {
  height: calc(100vh - var(--dt-titlebar-height));
  overflow: hidden !important;
}
:deep(.dt-collapse) {
  overflow: hidden !important;
}
/* 折叠面板样式：自适应内容高度，无滚动 */
:deep(.sidebar-collapse) {
  height: auto !important;
  max-height: none !important;
  overflow: visible !important;
}
.flex {
  display: flex;
}
.items-center {
  align-items: center;
}
.mb-4 {
  margin-bottom: 16px;
}
.mr-4 {
  margin-right: 16px;
}
</style>
