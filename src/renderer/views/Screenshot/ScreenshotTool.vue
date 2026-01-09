<template>
  <!-- 截图工具条：黑色半透明背景，白色前景色 -->
  <div
    class="screenshot-toolbar"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <div class="toolbar-header">
      <span class="toolbar-title">截图工具</span>
      <button class="close-btn" @click="hideToolbar" title="隐藏">×</button>
    </div>

    <div class="tool-group">
      <div
        class="tool-button"
        @click="onClickCaptureRect"
        :class="{ active: activeTool === 'rectangle' }"
        title="矩形截图 (Ctrl+Shift+A)"
      >
        <CaptureRect />
        <span class="tool-tip">矩形</span>
      </div>
      <div
        class="tool-button"
        @click="onClickCaptureWindow"
        :class="{ active: activeTool === 'window' }"
        title="窗口截图 (Ctrl+Shift+W)"
      >
        <CaptureWindow />
        <span class="tool-tip">窗口</span>
      </div>
      <div
        class="tool-button"
        @click="onClickCaptureScroll"
        :class="{ active: activeTool === 'scroll' }"
        title="滚动截图 (Ctrl+Shift+S)"
      >
        <CaptureScroll />
        <span class="tool-tip">滚动</span>
      </div>
    </div>

    <div class="tool-group">
      <div
        class="tool-button"
        @click="onClickRecordVideo"
        :class="{ active: activeTool === 'record' }"
        title="视频录制 (Ctrl+Shift+R)"
      >
        <RecordVideo />
        <span class="tool-tip">录制</span>
      </div>
      <div
        class="tool-button"
        @click="onClickScreenRuler"
        :class="{ active: activeTool === 'ruler' }"
        title="屏幕标尺 (Ctrl+Shift+L)"
      >
        <ScreenRuler />
        <span class="tool-tip">标尺</span>
      </div>
      <div
        class="tool-button"
        @click="onClickColorPicker"
        :class="{ active: activeTool === 'color' }"
        title="拾色器 (Ctrl+Shift+P)"
      >
        <ColorPicker />
        <span class="tool-tip">取色</span>
      </div>
    </div>

    <div class="settings-group">
      <el-dropdown trigger="click" @command="handleSettingsCommand">
        <div class="settings-button" title="设置">
          <svg class="settings-icon" viewBox="0 0 24 24">
            <path
              d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.91,11.36,4.89,11.69,4.89,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"
            />
          </svg>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="settings">设置</el-dropdown-item>
            <el-dropdown-item command="shortcuts">快捷键</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup>
// 截图功能按钮
import CaptureWindow from "@/components/icons/IconCaptureWindow.vue";
import CaptureRect from "@/components/icons/IconCaptureRect.vue";
import CaptureScroll from "@/components/icons/IconCaptureScroll.vue";
import RecordVideo from "@/components/icons/IconRecordVideo.vue";
import ScreenRuler from "@/components/icons/IconScreenRuler.vue";
import ColorPicker from "@/components/icons/IconColorPicker.vue";
import {
  ElMessage,
  ElDropdown,
  ElDropdownMenu,
  ElDropdownItem,
} from "element-plus";

import { ref, onMounted, onUnmounted } from "vue";

// 当前激活的工具
const activeTool = ref("");
const isVisible = ref(true);

// 隐藏工具栏
function hideToolbar() {
  isVisible.value = false;
  if (window.channel && window.channel.hideWindow) {
    window.channel.hideWindow('screenshot-window');
  }
}

// 显示工具栏
function showToolbar() {
  isVisible.value = true;
  if (window.channel && window.channel.showWindow) {
    window.channel.showWindow('screenshot-window');
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
    ElMessage.error("启动截图失败");
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
    await window.channel.sendToolCmd("screen-ruler", {});
  } catch (error) {
    console.error("打开屏幕标尺失败:", error);
    ElMessage.error("打开屏幕标尺失败");
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
  position: fixed;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  background-color: rgba(0, 0, 0, 0.9);
  padding: 12px 8px;
  border-radius: 0 12px 12px 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 2147483647;
  box-shadow: 2px 0 12px rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  min-width: 60px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.screenshot-toolbar:hover {
  background-color: rgba(0, 0, 0, 0.95);
  box-shadow: 2px 0 20px rgba(0, 0, 0, 0.6);
  border-color: rgba(255, 255, 255, 0.3);
  transform: translateY(-50%) translateX(5px);
}

.toolbar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.toolbar-title {
  color: #ffffff;
  font-size: 12px;
  font-weight: bold;
  opacity: 0.8;
}

.close-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  font-size: 16px;
  width: 20px;
  height: 20px;
  line-height: 1;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.tool-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.tool-group:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.tool-button {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: rgba(255, 255, 255, 0.8);
}

.tool-button:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #409eff;
  transform: translateY(-2px);
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
