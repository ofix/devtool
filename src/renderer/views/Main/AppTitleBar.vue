<template>
  <div class="app-title-bar" ref="titleBarRef">
    <span>
      <el-icon style="margin: 4px 4px 4px 16px" size="28">
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
import RedfishIcon from "@/icons/IconRedfish.vue";
import IconMinimizeBox from "@/icons/IconMinimizeBox.vue";
import IconCloseBox from "@/icons/IconCloseBox.vue";

// 可传入的 props
const props = defineProps({
  title: { type: String, default: "我的应用" },
});

// 对外暴露的状态
const isMaximized = ref(false);
const titleBarHeight = ref(32);

// 事件（给父组件监听）
const emit = defineEmits(["maximized", "unmaximized"]);

// 模板 ref
const titleBarRef = ref(null);
const minBtn = ref(null);
const maxBtn = ref(null);
const closeBtn = ref(null);

// 拖拽相关变量（修复核心：新增lastX/lastY记录上一帧位置）
let isDragging = ref(false);
let lastX = ref(0); // 上一帧鼠标X坐标
let lastY = ref(0); // 上一帧鼠标Y坐标
let isMaxState = ref(false); // 缓存最大化状态，避免重复判断

// 手动实现窗口拖拽逻辑
const handleMouseDown = async (e) => {
  // 排除点击控制按钮时触发拖拽
  if (e.target.closest(".title-bar-controls")) return;

  // 获取当前窗口最大化状态（避免拖拽最大化窗口）
  // isMaxState.value = await window.channel.isWindowMaximized("MainWnd");
  // if (isMaxState.value) return;

  isDragging.value = true;
  // 记录鼠标初始位置（当前帧）
  lastX.value = e.screenX;
  lastY.value = e.screenY;

  // 添加全局鼠标监听（绑定到document更稳定）
  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", handleMouseUp);
  // 防止文本选中/拖拽默认行为
  e.preventDefault();
};

const handleMouseMove = async (e) => {
  if (!isDragging.value || isMaxState.value) return;

  // 计算**本次移动的增量**（核心修复点）
  const deltaX = e.screenX - lastX.value;
  const deltaY = e.screenY - lastY.value;

  // 如果没有偏移，不执行移动（优化性能）
  if (deltaX === 0 && deltaY === 0) return;

  // 更新上一帧鼠标位置为当前位置
  lastX.value = e.screenX;
  lastY.value = e.screenY;

  // 移动窗口（传入增量，让主进程处理位置计算）
  await window.channel.moveWindow("MainWnd", deltaX, deltaY);
};

const handleMouseUp = () => {
  isDragging.value = false;
  // 移除全局监听（和绑定的对象保持一致）
  window.removeEventListener("mousemove", handleMouseMove);
  window.removeEventListener("mouseup", handleMouseUp);
};
// 同步最大化/还原状态
const onMax = () => {
  isMaximized.value = true;
  isMaxState.value = true; // 同步缓存状态
  emit("maximized");
};
const onUnmax = () => {
  isMaximized.value = false;
  isMaxState.value = false; // 同步缓存状态
  emit("unmaximized");
};

onMounted(() => {
  // 绑定标题栏拖拽事件
  titleBarRef.value?.addEventListener("mousedown", handleMouseDown);

  // 绑定窗口控制按钮事件
  minBtn.value?.addEventListener("click", () =>
    window.channel.minimize("MainWnd"),
  );
  closeBtn.value?.addEventListener("click", () =>
    window.channel.closeWindow("MainWnd"),
  );

  window.channel.on("maximized", onMax);
  window.channel.on("unmaximized", onUnmax);
});

onUnmounted(() => {
  // 清理所有事件监听，防止内存泄漏
  titleBarRef.value?.removeEventListener("mousedown", handleMouseDown);
  window.removeEventListener("mousemove", handleMouseMove);
  window.removeEventListener("mouseup", handleMouseUp);

  window.channel.off("maximized", onMax);
  window.channel.off("unmaximized", onUnmax);
});

// 供父组件读取
defineExpose({ isMaximized, titleBarHeight });
</script>

<style scoped>
.app-title-bar {
  width: 100%;
  height: 40px;
  background: rgba(0, 0, 0, 0.8);
  color: var(--dt-primary-text-color);
  border-bottom: 1px solid #666;
  display: flex;
  z-index: 100000;
  align-items: center;
  justify-content: space-between;
  padding: 0;
  pointer-events: auto;
  margin-top: 0px;
  user-select: none;
  cursor: move;
}

.title {
  font-size: 14px;
  pointer-events: none;
}

.title-bar-controls {
  display: flex;
  cursor: default;
}

.title-bar-controls .control-btn {
  background: transparent;
  border: none;
  color: #fff;
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
  outline: none !important;
  box-shadow: none !important;
  -webkit-tap-highlight-color: transparent;
}

.title-bar-controls .control-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.title-bar-controls .control-btn.close:hover {
  background: rgba(255, 0, 0, 0.6);
}
</style>
