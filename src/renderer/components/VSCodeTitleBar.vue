<template>
  <div class="vscode-title-bar">
    <span>
      <el-icon style="margin: 4px 4px 4px 12px" size="28">
        <RedfishIcon />
      </el-icon>
    </span>
    <span class="title">{{ title }}</span>
    <div class="title-bar-controls">
      <button
        ref="minBtn"
        id="minimize-box"
        class="control-btn"
        aria-label="最小化"
      >
        <IconMinimizeBox />
      </button>
      <button
        ref="maxBtn"
        id="maximize-box"
        class="control-btn"
        aria-label="最大化/还原"
      >
        <IconMaximizeBox v-if="!isMaximized" />
        <IconRestoreBox v-else />
      </button>
      <button
        ref="closeBtn"
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
import { onMounted, onUnmounted, ref } from "vue";
import RedfishIcon from "@/components/icons/IconRedfish.vue";
import IconMaximizeBox from "@/components/icons/IconMaximizeBox.vue";
import IconMinimizeBox from "@/components/icons/IconMinimizeBox.vue";
import IconRestoreBox from "@/components/icons/IconRestoreBox.vue";
import IconCloseBox from "@/components/icons/IconCloseBox.vue";

// 可传入的 props
const props = defineProps({
  title: { type: String, default: "我的应用" },
});

// 对外暴露的状态
const isMaximized = ref(false);
const titleBarHeight = ref(32); // 与 titleBarOverlay.height 保持一致

// 事件（给父组件监听）
const emit = defineEmits(["maximized", "unmaximized"]);

// 模板 ref
const minBtn = ref(null);
const maxBtn = ref(null);
const closeBtn = ref(null);

onMounted(() => {
  // 绑定事件（使用模板 ref，避免多次 getElementById）
  minBtn.value?.addEventListener("click", () =>
    window.channel.send("window-minimize")
  );
  maxBtn.value?.addEventListener("click", () =>
    window.channel.send("window-maximize-toggle")
  );
  closeBtn.value?.addEventListener("click", () =>
    window.channel.send("window-close")
  );

  // 同步最大化/还原
  const onMax = () => {
    isMaximized.value = true;
    emit("maximized");
  };
  const onUnmax = () => {
    isMaximized.value = false;
    emit("unmaximized");
  };
  window.channel.on("maximized", onMax);
  window.channel.on("unmaximized", onUnmax);

  // 清理监听
  onUnmounted(() => {
    window.channel.off("maximized", onMax);
    window.channel.off("unmaximized", onUnmax);
  });
});

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
