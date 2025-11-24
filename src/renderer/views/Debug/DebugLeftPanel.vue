<template>
  <div class="debug-left-panel">
    <el-collapse :expand-icon-position="position" class="dt-collapse">
      <el-collapse-item title="SERVER LIST" name="1"> </el-collapse-item>
      <el-collapse-item title="CODE" name="2">
        <FileTree />
      </el-collapse-item>
      <el-collapse-item title="OUTLINE" name="3"> </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup>
import { ref } from "vue";
import FileTree from "@/views/Debug/FileTree.vue";

// 控制展开图标位置：left/right
const position = ref("left");
</script>

<!-- 可选：补充样式，确保 flex 布局生效（如果项目未全局引入 flex 工具类） -->
<style scoped>
.debug-left-panel {
  overflow: visible !important; /* 清除默认 overflow: auto */
}
::v-deep .dt-collapse {
  overflow: hidden !important;
}
/* 3. 展开内容区域：清除高度限制 */
::v-deep .dt-collapse .el-collapse-item__content {
  max-height: none !important; /* 取消内容区域最大高度限制 */
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
