<template>
  <div class="debug-left-panel">
    <el-collapse expand-icon-position="left" class="dt-collapse">
      <ServerList />
      <FileTree
        :file-tree-data="fileTreeData"
        @update:fileTreeData="updateFileTree" 
      />
      <el-collapse-item title="OUTLINE" name="3"> </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import FileTree from "@/views/Debug/FileTree.vue";
import ServerList from "@/views/Debug/ServerList.vue"; // 引入ServerList组件

const fileTreeData = ref([]);
// 接收子组件的更新通知
const updateFileTree = (newData) => {
  fileTreeData.value = newData;
};

const onSftpDirInfo = (fileTree) => {
  fileTreeData.value = [fileTree];
};
onMounted(() => {
  window.channel.on("sftp-dir-info", onSftpDirInfo);
});

onUnmounted(() => {
  window.channel.off("sftp-dir-info", onSftpDirInfo);
});
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
