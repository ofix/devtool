<template>
  <div class="vscode-title-bar">
    <span>
      <el-icon style="margin: 4px 4px 4px 12px" size="28">
        <RedfishIcon />
      </el-icon>
    </span>
    <span class="title">{{ wndTitle }}</span>
    <div class="title-bar-controls">
      <button
        @click="handleMinimize"
        id="minimize-box"
        class="control-btn"
        aria-label="最小化"
      >
        <IconMinimizeBox />
      </button>
      <button
        @click="handleMaximize"
        id="maximize-box"
        class="control-btn"
        aria-label="最大化/还原"
      >
        <IconMaximizeBox v-if="!isMaximized" />
        <IconRestoreBox v-else />
      </button>
      <button
        @click="handleClose"
        id="close-box"
        class="control-btn close"
        aria-label="关闭"
      >
        <IconCloseBox />
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import RedfishIcon from "@/icons/IconRedfish.vue";
import IconMaximizeBox from "@/icons/IconMaximizeBox.vue";
import IconMinimizeBox from "@/icons/IconMinimizeBox.vue";
import IconRestoreBox from "@/icons/IconRestoreBox.vue";
import IconCloseBox from "@/icons/IconCloseBox.vue";

// 可传入的 props
const props = defineProps({
  wndTitle: { type: String, default: "" },
});

// 对外暴露的状态
const isMaximized = ref(false);
const titleBarHeight = ref(32);

const emit = defineEmits(["close", "minimize", "maximize", "restore", "drag"]);

// 关闭窗口
function handleClose() {
  emit("close");
}

// 最小化窗口
function handleMinimize() {
  emit("minimize");
}

// 最大化/还原窗口
function handleMaximize() {
  if (isMaximized.value) {
    emit("restore");
  } else {
    emit("maximize");
  }
  isMaximized.value = !isMaximized.value;
}

// 供父组件读取
defineExpose({ isMaximized, titleBarHeight });
</script>

<style scoped>
.vscode-title-bar {
  width: 100%;
  height: var(--dt-titlebar-height);
  background: var(--dt-primary-bg-color);
  color: var(--dt-primary-text-color);
  border-bottom: 1px solid var(--dt-border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0;
  -webkit-app-region: drag;
  /* 可拖拽区域 */
  user-select: none;
}

.title {
  font-size: 14px;
  pointer-events: none;
  /* 避免文字拦截拖拽 */
}

.title-bar-controls {
  display: flex;
}

.title-bar-controls .control-btn {
  -webkit-app-region: no-drag;
  /* 按钮必须不可拖拽 */
  background: transparent;
  border: none;
  color: var(--dt-primary-text-color);
  width: 48px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  margin: 0;
  /* 核心：清除默认焦点边框 */
  outline: none !important;
  /* 清除 outline 焦点样式 */
  box-shadow: none !important;
  /* 清除部分浏览器的阴影式焦点 */
  -webkit-tap-highlight-color: transparent;
  /* 清除移动端点击高亮（可选） */
}

.title-bar-controls .control-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.title-bar-controls .control-btn.close:hover {
  background: rgba(255, 0, 0, 0.6);
}
</style>
