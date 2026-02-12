<template>
  <div class="app-main">
    <!-- 3D 翻转容器 -->
    <div
      class="flip-container"
      :class="{ flipped: isFlipped }"
      ref="flipContainer"
    >
      <!-- 正面：默认内容 -->
      <div class="flip-front">
        <div class="default-content">
          <AppList />
          <SearchBar @search="handleSearch" />
        </div>
      </div>

      <!-- 背面：帮助/快捷键 -->
      <div class="flip-back">
        <div class="back-content">
          <AppHelp v-if="activeTab === 'help'" />
          <AppShortcuts v-if="activeTab === 'shortcut'" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, provide, nextTick, onMounted, onUnmounted, watch } from "vue";
import AppList from "./AppList.vue";
import AppHelp from "./AppHelp.vue";
import AppShortcuts from "./AppShortcuts.vue";
import SearchBar from "./SearchBar.vue";

// 响应式数据
const isFlipped = ref(false);
const activeTab = ref("");
let isPenetrationEnabled = false; // 穿透状态
const flipContainer = ref(null);
let mouseMoveTimer = null;
let trackCursorTimer = null; // 定时检测鼠标的定时器
let platform = null; // 平台信息

const isMouseInWindow = async () => {
  try {
    if (!flipContainer.value) return false;

    const mousePos = await window.channel.getScreenMousePos(); // 物理坐标
    const windowBounds = await window.channel.getWindowBounds("MainWnd"); // DIP坐标
    const containerRect = flipContainer.value.getBoundingClientRect(); // 网页内物理像素

    let minX = windowBounds.x + containerRect.left;
    let maxX = windowBounds.x + containerRect.left + containerRect.width;
    let minY = windowBounds.y + containerRect.top;
    let maxY = windowBounds.y + containerRect.top + containerRect.height;

    return (
      mousePos.x >= minX &&
      mousePos.x <= maxX &&
      mousePos.y >= minY &&
      mousePos.y <= maxY
    );
  } catch (e) {
    console.error("坐标判断失败：", e);
    return false;
  }
};

// 定时检测鼠标位置（Linux下唯一可行的方式）
const trackMousePosInLinuxPlatform = () => {
  // 停止已有定时器
  if (trackCursorTimer) clearInterval(trackCursorTimer);

  // 每50ms检测一次（平衡性能和响应速度）
  trackCursorTimer = setInterval(async () => {
    const isInWindow = await isMouseInWindow();
    // 鼠标在窗口内 → 关闭穿透；鼠标在窗口外 → 开启穿透
    if (isInWindow && isPenetrationEnabled) {
      enablePenetration(false);
      isPenetrationEnabled = false;
    } else if (!isInWindow && !isPenetrationEnabled) {
      enablePenetration(true);
      isPenetrationEnabled = true;
    }
  }, 50);
};

onMounted(async () => {
  // 初始化：先关闭穿透，开启全局监听
  startGlobalListener();
  let osInfo = await window.channel.getPlatformInfo();
  platform = osInfo.platform;
  if (platform == "linux") {
    trackMousePosInLinuxPlatform();
  }
  // 绑定基础监听
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("pointerrawupdate", handleMouseMove);
  window.addEventListener("unload", stopGlobalListener);
});

onUnmounted(() => {
  // 卸载时清理所有监听和状态
  stopGlobalListener();
  window.removeEventListener("mousemove", handleMouseMove);
  window.removeEventListener("pointerrawupdate", handleMouseMove);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  window.removeEventListener("unload", stopGlobalListener);
  clearTimeout(mouseMoveTimer);
  if (trackCursorTimer) {
    clearInterval(trackCursorTimer);
  }
  enablePenetration(false);
});

// 穿透控制函数（分离监听逻辑，只负责穿透）
const enablePenetration = async (enable) => {
  if (isPenetrationEnabled === enable) return; // 状态一致时不重复调用
  isPenetrationEnabled = enable;
  // 仅调用IPC设置穿透，不再在这里启停监听
  await window.channel.ignoreMouseEvents("MainWnd", enable);
};

// 鼠标位置监听（仅负责切换穿透状态）
const handleMouseMove = (e) => {
  clearTimeout(mouseMoveTimer);
  mouseMoveTimer = setTimeout(() => {
    const rect = flipContainer.value.getBoundingClientRect();
    const isInContainer =
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom;

    // 状态不一致时才切换
    if (isInContainer && isPenetrationEnabled) {
      enablePenetration(false); // 鼠标在内 → 关闭穿透（自动开监听）
    } else if (!isInContainer && !isPenetrationEnabled) {
      enablePenetration(true); // 鼠标在外 → 开启穿透（自动关监听）
    }
  }, 5);
};

// 窗口可见性变化处理
const handleVisibilityChange = () => {};

// 全局监听控制（核心修复：移除不必要的穿透判断）
function startGlobalListener() {
  document.addEventListener("click", handleGlobalClick, true);
  window.addEventListener("blur", handleWindowBlur);
  document.addEventListener("mouseup", handleMouseUp);
}

function stopGlobalListener() {
  document.removeEventListener("click", handleGlobalClick, true);
  window.removeEventListener("blur", handleWindowBlur);
  window.removeEventListener("pointerrawupdate", handleMouseMove);
  document.removeEventListener("mouseup", handleMouseUp);
}

// 全局点击处理
function handleGlobalClick(e) {
  if (!flipContainer.value) return;
  const isClickOutside = !flipContainer.value.contains(e.target);
  if (isClickOutside) {
    enablePenetration(true); // 只控制穿透，监听由enablePenetration自动处理
  }
}

// 窗口失焦处理
function handleWindowBlur() {
  enablePenetration(true); // 只控制穿透，监听由enablePenetration自动处理
}

// 鼠标松开处理
function handleMouseUp(e) {
  if (!flipContainer.value) return;

  const rect = flipContainer.value.getBoundingClientRect();
  const isOutside =
    e.clientX < rect.left ||
    e.clientX > rect.right ||
    e.clientY < rect.top ||
    e.clientY > rect.bottom;

  if (isOutside) {
    enablePenetration(true); // 只控制穿透，监听由enablePenetration自动处理
  }
}

// 翻转窗口逻辑
async function flipWindow(tabName) {
  activeTab.value = tabName;
  try {
    isFlipped.value = !isFlipped.value;
  } catch (e) {
    console.error("翻转失败：", e);
  }
}

// 事件分发
const handleHelpClick = async () => {
  await flipWindow("help");
};

const handleShortcutClick = async () => {
  await flipWindow("shortcut");
};

const handleSearch = (keyword) => {
  // 搜索逻辑（根据你的需求实现）
  console.log("搜索关键词：", keyword);
};

provide("helpClickEvent", handleHelpClick);
provide("shortcutClickEvent", handleShortcutClick);
</script>

<style scoped>
.app-main {
  width: 100vw;
  height: 100vh;
  margin: 0;
  padding: 0;
  background: transparent;
  box-sizing: border-box;
  transition: margin-top 0.3s ease;
  perspective: 700px;
  overflow: hidden;
  transform-style: preserve-3d;
  display: flex;
  align-items: center;
  justify-content: center;
  will-change: transform;
  pointer-events: none;
}

.flip-container {
  width: 640px;
  height: 480px;
  position: relative;
  transform-style: preserve-3d;
  transform-origin: center center;
  margin: auto;
  transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: auto !important;
}

.flip-container.flipped {
  transform: rotateY(180deg);
}

.flip-front,
.flip-back {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  transform: translateZ(1px);
  overflow: hidden;
  will-change: transform;
}

.flip-back {
  transform: rotateY(180deg) translateZ(1px);
}

.default-content,
.back-content {
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
  transform: translateZ(0);
}

.back-btn {
  margin-bottom: 15px;
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  background: #409eff;
  color: #fff;
  cursor: pointer;
}
</style>
