<template>
  <div class="page-debug">
    <el-splitter>
      <el-splitter-panel :min="100" :size="300">
        <div class="panel-left">
          <DebugLeftPanel />
        </div>
      </el-splitter-panel>
      <el-splitter-panel>
        <div class="panel-right"></div>
      </el-splitter-panel>
    </el-splitter>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watchEffect, toValue } from "vue";
import DebugLeftPanel from "./DebugLeftPanel.vue";

onMounted(() => {
  window.channel.on("download-dir-progress", (data) => {
    console.log("接收消息 download-dir-progress", data);
  });
  window.channel.on("upload-dir-progress", (data) => {
    console.log("接收消息 upload-dir-progress", data);
  });
});
</script>

<style scoped>
.page-debug {
  height: 100%;
}
</style>
