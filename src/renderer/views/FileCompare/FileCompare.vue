<template>
  <div class="page-compare">
    <el-splitter>
      <el-splitter-panel :min="100" :size="300">
        <div class="panel-left"></div>
      </el-splitter-panel>
      <el-splitter-panel>
        <div class="panel-right"></div>
      </el-splitter-panel>
    </el-splitter>
  </div>
</template>

<script setup>
import { ref } from "vue";
</script>

<style scoped>
.page-compare {
  height: 100%;
}
</style>
