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
import { ref,onMounted,onUnmounted ,watchEffect,toValue} from "vue";
import DebugLeftPanel from "./DebugLeftPanel.vue";


onMounted(()=>{

});


</script>

<style scoped>
.page-debug {
  height: 100%;
}
</style>
