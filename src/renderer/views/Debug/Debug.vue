<template>
  <div class="page-debug">
    <el-splitter>
      <el-splitter-panel :min="100" :size="300">
        <div class="panel-left">
          <FileTreePanel />
        </div>
      </el-splitter-panel>
      <el-splitter-panel>
        <div class="panel-right"></div>
      </el-splitter-panel>
    </el-splitter>
  </div>
</template>

<script setup>
import { ref } from "vue";
import FileTreePanel from "@/views/Debug/FileTreePanel.vue";
</script>

<style scoped>
.page-debug {
  height: 100%;
}
</style>
