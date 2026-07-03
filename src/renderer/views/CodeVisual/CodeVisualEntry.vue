<template>
  <div class="code-visual-wnd">
    <el-splitter layout="horizontal" class="splitter">
      <el-splitter-panel :min="100" :size="300">
        <div class="panel-left">
          <CodeVisualFileTree />
        </div>
      </el-splitter-panel>
      <el-splitter-panel>
        <el-splitter layout="vertical" class="vertical-splitter">
          <el-splitter-panel>
            <CodeEditor />
          </el-splitter-panel>
          <el-splitter-panel>
            <LinkEditor />
          </el-splitter-panel>
        </el-splitter>
      </el-splitter-panel>
    </el-splitter>
  </div>
</template>

<script setup>
import CodeVisualFileTree from "@/views/CodeVisual/CodeVisualFileTree.vue";
import CodeEditor from "./LocalCodeEditor.vue";
import LinkEditor from "./LinkEditor.vue";
</script>

<style type="scss" scoped>
.code-visual-wnd {
  display: flex;
  height: 100%;
}
.splitter {
  height: 100%; /* 必须给splitter设置高度，否则子面板无法渲染 */
}
</style>
