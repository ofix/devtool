<template>
  <div class="code-visual-wnd">
    <TitleBar title="代码可视化" wndKey="CodeVisualWnd">
        <template #menu>
            <CodeVisualMenuBar/>
        </template>
        <template #custom-controls>
        <!-- 主题切换按钮 -->
        <ThemeSwitch/>
        </template>
    </TitleBar>
    <el-splitter layout="horizontal" class="splitter">
      <el-splitter-panel :min="100" :size="300">
          <CodeVisualFileTree />
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
import CodeVisualMenuBar from "./CodeVisualMenuBar.vue";
import CodeEditor from "./LocalCodeEditor.vue";
import LinkEditor from "./LinkEditor.vue";
import TitleBar from "@/components/TitleBar.vue";
import ThemeSwitch from "@/components/ThemeSwitch.vue";
</script>

<style type="scss" scoped>
.code-visual-wnd {
  height: 100%;
}
.splitter {
  height: calc(
    100% - var(--dt-titlebar-height)
  ); /* 必须给splitter设置高度，否则子面板无法渲染 */
}
</style>
