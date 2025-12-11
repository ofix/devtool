<template>
  <div class="debug-left-panel">
    <el-collapse expand-icon-position="left" class="dt-collapse">
      <ServerList />
      <FileTree />
      <el-collapse-item title="OUTLINE" name="3"> </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import FileTree from "@/views/Debug/FileTree.vue";
import ServerList from "@/views/Debug/ServerList.vue";
</script>
<style scoped>
.debug-left-panel {
  height: calc(100vh - var(--dt-titlebar-height));
  overflow: hidden !important;
}
::v-deep .dt-collapse {
  overflow: hidden !important;
}
/* 折叠面板样式：自适应内容高度，无滚动 */
::v-deep .sidebar-collapse {
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
