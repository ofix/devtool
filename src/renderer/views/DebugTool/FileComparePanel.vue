<template>
  <div class="file-compare-panel">
    <el-collapse
      expand-icon-position="left"
      class="dt-collapse"
      v-model="activeNames"
    >
      <el-collapse-item title="SEARCH" name="1">
        文件不对拉拉拉啊
      </el-collapse-item>
    </el-collapse>
  </div>
</template>
<script setup>
import { ref, watch, onMounted } from "vue";
import SearchReplacePanel from "@/components/SearchReplacePanel.vue";
const activeNames = ref(["1"]);
</script>
<style scoped></style>
