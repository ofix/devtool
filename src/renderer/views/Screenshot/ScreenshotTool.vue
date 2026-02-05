<template>
  <!-- 截图工具条：黑色半透明背景，白色前景色 -->
  <div
    class="screenshot-toolbar"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <Capture class="app-button" />
    <CaptureRect
      class="tool-button"
      title="矩形截图 (Ctrl+Shift+A)"
      @click="onClickCaptureRect"
    />
    <CaptureWindow
      class="tool-button"
      title="窗口截图 (Ctrl+Shift+W)"
      @click="onClickCaptureWindow"
    />
    <CaptureScroll
      class="tool-button"
      title="滚动截图 (Ctrl+Shift+S)"
      @click="onClickCaptureScroll"
    />
    <RecordVideo
      class="tool-button"
      title="视频录制 (Ctrl+Shift+R)"
      @click="onClickRecordVideo"
    />
    <ScreenRuler
      class="tool-button"
      title="屏幕标尺 (Ctrl+Shift+L)"
      @click="onClickScreenRuler"
    />
    <ColorPicker
      class="tool-button"
      title="拾色器 (Ctrl+Shift+P)"
      @click="onClickColorPicker"
    />
    <Settings
      class="tool-button"
      title="拾色器 (Ctrl+Shift+P)"
      @click="onSettings"
    />
    <Close class="tool-button" title="关闭" @click="onClose" />
  </div>
</template>

<script setup>
// 截图功能按钮
import Settings from "@/icons/IconSettings.vue";
import Capture from "@/icons/IconCapture.vue";
import CaptureWindow from "@/icons/IconCaptureWindow.vue";
import CaptureRect from "@/icons/IconCaptureRect.vue";
import CaptureScroll from "@/icons/IconCaptureScroll.vue";
import RecordVideo from "@/icons/IconRecordVideo.vue";
import ScreenRuler from "@/icons/IconScreenRuler.vue";
import ColorPicker from "@/icons/IconColorPicker.vue";
import Close from "@/icons/IconCloseBox.vue";
import { ElMessage } from "element-plus";

import { ref, onMounted, onUnmounted } from "vue";

// 当前激活的工具
const activeTool = ref("");
const isVisible = ref(true);

// 隐藏工具栏
function hideToolbar() {
  isVisible.value = false;
  if (window.channel && window.channel.hideWindow) {
    window.channel.hideWindow("screenshot-window");
  }
}

// 显示工具栏
function showToolbar() {
  isVisible.value = true;
  if (window.channel && window.channel.showWindow) {
    window.channel.showWindow("screenshot-window");
  }
}

// 处理设置命令
function handleSettingsCommand(command) {
  switch (command) {
    case "settings":
      openSettings();
      break;
    case "shortcuts":
      showShortcuts();
      break;
  }
}

// 打开设置
function openSettings() {
  if (window.channel && window.channel.openScreenshotSettings) {
    window.channel.openScreenshotSettings();
  } else {
    ElMessage.info("设置功能需要主进程支持");
  }
}

// 显示快捷键
function showShortcuts() {
  const shortcuts = [
    { key: "Ctrl+Shift+A", desc: "矩形截图" },
    { key: "Ctrl+Shift+W", desc: "窗口截图" },
    { key: "Ctrl+Shift+S", desc: "滚动截图" },
    { key: "Ctrl+Shift+R", desc: "录制视频" },
    { key: "Ctrl+Shift+L", desc: "屏幕标尺" },
    { key: "Ctrl+Shift+P", desc: "拾色器" },
  ];

  let message = "<strong>快捷键列表：</strong><br>";
  shortcuts.forEach((item) => {
    message += `<div style="margin: 5px 0;"><code>${item.key}</code> - ${item.desc}</div>`;
  });

  ElMessage({
    dangerouslyUseHTMLString: true,
    message: message,
    duration: 8000,
    offset: 100,
  });
}

// 显示关于
function showAbout() {
  ElMessage.info("FastStone 截图工具模拟 v1.0.0");
}

// 全局快捷键映射
const shortcuts = {
  "Control+Shift+A": () => onClickCaptureRect(),
  "Control+Shift+W": () => onClickCaptureWindow(),
  "Control+Shift+S": () => onClickCaptureScroll(),
  "Control+Shift+R": () => onClickRecordVideo(),
  "Control+Shift+L": () => onClickScreenRuler(),
  "Control+Shift+P": () => onClickColorPicker(),
  "Control+Shift+H": () => hideToolbar(),
  "Control+Shift+E": () => showToolbar(),
};

// 开始矩形截图
async function onClickCaptureRect() {
  try {
    activeTool.value = "rectangle";
    await window.channel.startScreenshot("rectangle");
  } catch (error) {
    console.error("启动矩形截图失败:", error);
    ElMessage.error("启动截图失败：" + error);
  }
}

// 开始窗口截图
async function onClickCaptureWindow() {
  try {
    activeTool.value = "window";
    await window.channel.startScreenshot("window");
  } catch (error) {
    console.error("启动窗口截图失败:", error);
    ElMessage.error("启动窗口截图失败");
  }
}

// 开始滚动截图
async function onClickCaptureScroll() {
  try {
    activeTool.value = "scroll";
    await window.channel.startScreenshot("scroll");
  } catch (error) {
    console.error("启动滚动截图失败:", error);
    ElMessage.error("启动滚动截图失败");
  }
}

// 开始视频录制
async function onClickRecordVideo() {
  try {
    activeTool.value = "record";
    await window.channel.sendToolCmd("record-video", {
      quality: "high",
      fps: 30,
    });
  } catch (error) {
    console.error("启动视频录制失败:", error);
    ElMessage.error("启动视频录制失败");
  }
}

// 打开屏幕标尺
async function onClickScreenRuler() {
  try {
    activeTool.value = "ruler";
    await window.channel.showWindow("ScreenRulerWnd", {});
  } catch (error) {
    console.error("打开屏幕标尺失败:", error);
  }
}

// 打开拾色器
async function onClickColorPicker() {
  try {
    activeTool.value = "color";
    await window.channel.sendToolCmd("color-picker", {});
  } catch (error) {
    console.error("打开拾色器失败:", error);
    ElMessage.error("打开拾色器失败");
  }
}

async function onSettings() {}

async function onClose() {
  await window.channel.hideWindow("ScreenshotToolWnd");
}

// 全局快捷键处理
function handleKeydown(e) {
  const key = e.key;
  const ctrlKey = e.ctrlKey;
  const shiftKey = e.shiftKey;
  const altKey = e.altKey;

  // 构建快捷键字符串
  let shortcut = "";
  if (ctrlKey) shortcut += "Control+";
  if (shiftKey) shortcut += "Shift+";
  if (altKey) shortcut += "Alt+";
  shortcut += key;

  // 执行对应的快捷键功能
  if (shortcuts[shortcut]) {
    e.preventDefault();
    shortcuts[shortcut]();
  }
}

onMounted(() => {
  // 注册全局快捷键
  window.addEventListener("keydown", handleKeydown);

  // 监听鼠标靠近屏幕左侧
  let mouseTimeout = null;
  document.addEventListener("mousemove", (e) => {
    if (!isVisible.value && e.clientX < 5) {
      clearTimeout(mouseTimeout);
      mouseTimeout = setTimeout(() => {
        showToolbar();
      }, 100);
    }
  });

  // 监听主进程消息
  if (window.channel && window.channel.onScreenshotFinished) {
    window.channel.onScreenshotFinished(() => {
      activeTool.value = "";
    });
  }
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<style scoped>
.screenshot-toolbar {
  /* 关键属性：开启拖拽 */
  -webkit-app-region: drag;
  /* 可选：防止拖拽区域内的按钮被遮挡/无法点击 */
  user-select: none;
  display: flex;
  flex-direction: row;
  gap: 12px;
  z-index: 2147483647;
  padding: 8px;
  background-color: rgba(0, 0, 0, 0.9);
}

.screenshot-toolbar .tool-button {
  -webkit-app-region: no-drag;
}

.app-button {
  width: 32px;
  height: 32px;
}

.tool-button {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: rgba(255, 255, 255, 0.05);
  cursor: pointer;
  color: rgba(255, 255, 255, 0.8);
}

.tool-button:hover {
  /* background: rgba(255, 255, 255, 0.1); */
  color: #409eff;
  /* transform: translateY(-2px); */
}

.tool-button.active {
  background: rgba(64, 158, 255, 0.2);
  color: #409eff;
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.3);
}

.tool-button.active:hover {
  background: rgba(64, 158, 255, 0.3);
}

.tool-tip {
  position: absolute;
  left: calc(100% + 10px);
  background: rgba(0, 0, 0, 0.9);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  opacity: 0;
  transform: translateX(-10px);
  transition: all 0.3s ease;
  pointer-events: none;
  z-index: 10000;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.tool-button:hover .tool-tip {
  opacity: 1;
  transform: translateX(0);
}

.settings-group {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.settings-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: rgba(255, 255, 255, 0.8);
}

.settings-button:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #e6a23c;
}

.settings-icon {
  width: 20px;
  height: 20px;
  fill: currentColor;
}
</style>
