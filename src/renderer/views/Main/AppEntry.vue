<template>
  <div class="app-main">
    <!-- 3D 翻转容器 -->
    <div
      class="flip-container"
      :class="{ flipped: isFlipped }"
      ref="flipContainer"
    >
      <!-- 正面：默认内容（可替换为你的原有内容） -->
      <div class="flip-front">
        <div class="default-content">
          <AppList />
          <!-- 搜索组件：绑定搜索事件 -->
          <SearchBar @search="handleSearch" />
        </div>
      </div>

      <!-- 背面：根据类型显示帮助/快捷键 -->
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

// 响应式数据（替代原有的data）
const isFlipped = ref(false); // 是否翻转
const activeTab = ref(""); // 当前激活的标签：help/shortcut

// 基础配置：3D翻转需要预留的额外空间（根据你的3D效果调整）
let isPenetrationEnabled = ref(false); // 标记当前穿透状态（关键）
const flipContainer = ref(null); // 3D容器ref（关键）
let mouseMoveTimer = null; // 防抖定时器

onMounted(async () => {
  document.addEventListener("visibilitychange", handleVisibilityChange);
  // 关键：先监听鼠标移动，再根据鼠标位置决定是否开启全局监听
  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("pointerrawupdate", handleMouseMove);
  // 初始状态：开启穿透，不开启全局监听
  enablePenetration(false);
  isListening = false;
});

// 6. 组件卸载时清理监听
onUnmounted(() => {
  stopGlobalListener();
  window.removeEventListener("mousemove", handleMouseMove);
  clearTimeout(mouseMoveTimer);
  enablePenetration(false); // 恢复穿透
});

// 2. 动态控制鼠标穿透（核心函数）
const enablePenetration = async (enable) => {
  isPenetrationEnabled.value = enable;
  await window.channel.ignoreMouseEvents("MainWnd", enable);

  // 穿透开启 → 关闭全局监听；穿透关闭 → 开启全局监听
  if (enable) {
    stopGlobalListener();
  } else {
    startGlobalListener();
  }
};

// 3. 监听鼠标位置：判断是否在3D容器内
const handleMouseMove = (e) => {
  // 防抖：避免频繁触发IPC
  clearTimeout(mouseMoveTimer);
  mouseMoveTimer = setTimeout(() => {
    if (!flipContainer.value) return;
    // 获取3D容器的位置和尺寸
    const rect = flipContainer.value.getBoundingClientRect();
    // 判断鼠标是否在容器内
    const isInContainer =
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom;
    // 仅当状态不一致时才切换（避免重复IPC调用）
    if (isInContainer && isPenetrationEnabled.value) {
      enablePenetration(false); // 鼠标在容器内：关闭穿透，开启监听
    } else if (!isInContainer && !isPenetrationEnabled.value) {
      isPenetrationEnabled.value = true;
      enablePenetration(true); // 鼠标在容器外：开启穿透，关闭监听
    }
  }, 5); // 10ms防抖，性能更优
};

// 处理帮助按钮点击（替代原有的methods）
const handleHelpClick = async () => {
  await flipWindow("help");
};

// 处理快捷键按钮点击
const handleShortcutClick = async () => {
  await flipWindow("shortcut");
};

async function flipWindow(tabName) {
  activeTab.value = tabName;

  try {
    // 步骤1：先扩窗（等待窗口调整完成）

    // 步骤2：等窗口渲染完成后，再触发3D翻转（关键：nextTick+短暂延迟）
    // await nextTick();
    // setTimeout(() => {

    // }, 600); // 50ms延迟，确保窗口已调整到位
    isFlipped.value = !isFlipped.value;

    // 步骤3：翻转完成后，延迟重置窗口（匹配动画时长）
  } catch (e) {
    console.error("翻转失败：", e);
  }
}

provide("helpClickEvent", handleHelpClick);
provide("shortcutClickEvent", handleShortcutClick);

const handleVisibilityChange = () => {
  // visibilityState 有两个值：
  // - visible：页面可见（窗口激活、未最小化）
  // - hidden：页面隐藏（窗口最小化、隐藏、切换标签页）
  if (document.visibilityState === "hidden") {
    stopGlobalListener();
  } else {
    startGlobalListener();
  }
};

// 启动全局事件监听（核心逻辑）
let isListening = false;
function startGlobalListener() {
  if (isListening || isPenetrationEnabled.value) return; // 穿透开启时不开启监听

  document.addEventListener("click", handleGlobalClick, true);
  window.addEventListener("blur", handleWindowBlur);
  document.addEventListener("mouseup", handleMouseUp);
  isListening = true;
}

// 停止全局监听（避免内存泄漏）
function stopGlobalListener() {
  if (!isListening) return;

  document.removeEventListener("click", handleGlobalClick, true);
  window.removeEventListener("blur", handleWindowBlur);
  document.removeEventListener("mouseup", handleMouseUp);

  isListening = false;
}

// 关键：仅当点击容器外且穿透开启时，隐藏窗口
function handleGlobalClick(e) {
  if (!flipContainer.value || isPenetrationEnabled.value) return; // 穿透开启时不处理

  const isClickOutside = !flipContainer.value.contains(e.target);
  if (isClickOutside) {
    window.channel.hideWindow("mainWnd");
    stopGlobalListener();
    enablePenetration(true);
  }
}

// 处理窗口失焦：失焦即隐藏（最优雅的方案）
function handleWindowBlur() {
  if (isPenetrationEnabled.value) return; // 穿透开启时，失焦不隐藏

  window.channel.hideWindow("mainWnd");
  stopGlobalListener();
  enablePenetration(true);
}

// 兼容方案：判断鼠标位置是否在窗口外
function handleMouseUp(e) {
  if (!flipContainer.value || isPenetrationEnabled.value) return; // 穿透开启时不处理
  const rect = flipContainer.value.getBoundingClientRect();
  const isOutside =
    e.clientX < rect.left ||
    e.clientX > rect.right ||
    e.clientY < rect.top ||
    e.clientY > rect.bottom;

  if (isOutside) {
    window.channel.hideWindow("mainWnd");
    stopGlobalListener();
    enablePenetration(true);
  }
}

// 窗口隐藏时自动停止监听（兜底）
window.addEventListener("unload", stopGlobalListener);
</script>

<style scoped>
/* 3D 翻转核心样式 */
.app-main {
  width: 100vw; /* 等于窗口最终宽度 FINAL_WIDTH */
  height: 100vh; /* 等于窗口最终高度 FINAL_HEIGHT */
  margin: 0;
  padding: 0;
  background: transparent; /* 全透明，外部区域鼠标穿透的关键 */
  box-sizing: border-box;
  transition: margin-top 0.3s ease;
  perspective: 700px; /* 把透视加在父容器，距离调小（500px比1000px效果更明显） */
  overflow: hidden;
  transform-style: preserve-3d; /* 强制子元素继承3D上下文 */
  display: flex;
  align-items: center;
  justify-content: center;
  /* 新增：强制硬件加速，避免抖动 */
  will-change: transform;
  pointer-events: none;
}

.flip-container {
  width: 640px;
  height: 480px;
  position: relative;
  transform-style: preserve-3d;
  transform-origin: center center; /* 翻转中心在容器正中心（避免偏移） */
  margin: auto; /* 即使窗口扩大，容器仍居中 */
  transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  /* 关键：确保容器能接收鼠标事件 */
  pointer-events: auto !important;
}

/* 翻转状态 */
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
  transform: translateZ(1px); /* Z轴位移，让两面有前后距离 */
  overflow: hidden;
  /* 新增：避免子元素重绘导致抖动 */
  will-change: transform;
}

.flip-back {
  transform: rotateY(180deg) translateZ(1px);
}

.default-content {
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
  /* 新增：强制硬件加速 */
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

.back-content {
  height: 100%;
  overflow: hidden;
  /* 新增：强制硬件加速 */
  transform: translateZ(0);
}
</style>
