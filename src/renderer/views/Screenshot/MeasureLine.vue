<template>
  <div class="measure-line">
    <IconMeasureLine />
  </div>
</template>
<script setup>
import IconMeasureLine from "@/components/icons/IconMeasureLine.vue";
import { ref, onMounted, onUnmounted } from "vue";

const windowOptions = ref(null);

const getWindowOptions = async () => {
  try {
    // 调用主进程的 get-window-options 通道
    const options = await window.channel.getWindowOptions("MeasureLineWnd");
    windowOptions.value = options;
    console.log("获取到窗口选项:", options);
    return options;
  } catch (error) {
    console.error("获取窗口选项失败:", error);
    return {};
  }
};

const setupOptionsListener = () => {
  if (!channel) return;
  window.channel.on("window-options", (event, newOptions) => {
    console.log("收到窗口选项更新:", newOptions);
    windowOptions.value = newOptions;
    // 立即更新UI状态
    // updateUIWithNewOptions(newOptions);
  });
};

onMounted(() => {
  getWindowOptions();
  setupOptionsListener();
});
</script>
<style type="scss">
html,
body {
  cursor: none !important;
}
.measure-line {
  box-sizing: border-box;
  overflow: hidden;
  width: 100%;
  height: 100%;
  color: #ee18d1;
  cursor: none !important;
  pointer-events: auto !important;
  user-select: none !important;
  -webkit-user-drag: none !important;
}

.measure-line :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
  flex-shrink: 0;
  cursor: none !important;
  pointer-events: auto !important;
  user-select: none !important;
  -webkit-user-drag: none !important;
}
</style>
