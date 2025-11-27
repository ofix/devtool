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
  window.channel.send("sftp-download-dir", {
    host: "192.168.43.132",
    port: 22,
    username: "ofix",
    password: "123",
    remotePath: "/usr/share/www",
  });

  window.channel.on("sftp-download-dir-progress", (data) => {
    console.log("接收消息 sftp-download-dir-progress", data);
  });
  window.channel.on("sftp-download-file-progress", (data) => {
    console.log("接收消息 sftp-download-file-progress", data);
  });
});
</script>

<style scoped>
.page-debug {
  height: 100%;
}
</style>
