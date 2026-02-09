<template>
  <div class="tray-main" :style="{ marginTop: marginTop + 'px' }">
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
import { ref, provide, onMounted } from "vue";
import AppList from "./AppList.vue";
import AppHelp from "./AppHelp.vue";
import AppShortcuts from "./AppShortcuts.vue";

// 响应式数据（替代原有的data）
const isFlipped = ref(false); // 是否翻转
const activeTab = ref(""); // 当前激活的标签：help/shortcut
const marginTop = ref(0); // 页面上边距
const originalHeight = ref(500); // 窗口原始高度
const originalWidth = ref(400); // 窗口原始宽度
const flipContainer = ref(null); // 替代原有的$refs.flipContainer

// 处理帮助按钮点击（替代原有的methods）
const handleHelpClick = async () => {
  activeTab.value = "help";
  if (isFlipped.value) {
    setTimeout(() => {
      resetWindowSize();
    }, 1000); // 匹配 CSS 翻转动画时长
    isFlipped.value = false;
  } else {
    await prepareFlip();
    isFlipped.value = true;
  }
};

// 处理快捷键按钮点击
const handleShortcutClick = async () => {
  activeTab.value = "shortcut";
  if (isFlipped.value) {
    setTimeout(() => {
      resetWindowSize();
    }, 1000); // 匹配 CSS 翻转动画时长
    isFlipped.value = false;
  } else {
    await prepareFlip();
    isFlipped.value = true;
  }
};

provide("helpClickEvent", handleHelpClick);
provide("shortcutClickEvent", handleShortcutClick);

// 组件挂载时注册监听
onMounted(() => {
  document.addEventListener("visibilitychange", handleVisibilityChange);
});

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

let isListening = false; // 标记是否已启动监听
// 启动全局事件监听（核心逻辑）
function startGlobalListener() {
  if (isListening) return;

  // 方案1：监听全局点击事件（捕获阶段）
  document.addEventListener("click", handleGlobalClick, true);
  // 方案2：监听窗口失焦（最简洁，点击外部自动失焦）
  window.addEventListener("blur", handleWindowBlur);
  // 方案3：监听鼠标抬起（兼容点击窗口外的场景）
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

// 处理全局点击：判断是否点击窗口外
function handleGlobalClick(e) {
  // 获取当前点击的元素是否属于本窗口
  const isClickInside = document.contains(e.target);
  if (!isClickInside) {
    window.channel.hideWindow("TrayAppWnd");
    stopGlobalListener();
  }
}

// 处理窗口失焦：失焦即隐藏（最优雅的方案）
function handleWindowBlur() {
  window.channel.hideWindow("TrayAppWnd");
  stopGlobalListener();
}

// 兼容方案：判断鼠标位置是否在窗口外
function handleMouseUp(e) {
  // 获取窗口在屏幕中的位置（通过Electron API）
  const windowBounds = window.channel.getWindowBounds("TrayAppWnd");
  // 获取鼠标在屏幕中的坐标
  const mouseX = e.screenX;
  const mouseY = e.screenY;

  // 判断是否在窗口外
  const isOutside =
    mouseX < windowBounds.x ||
    mouseX > windowBounds.x + windowBounds.width ||
    mouseY < windowBounds.y ||
    mouseY > windowBounds.y + windowBounds.height;

  if (isOutside) {
    window.channel.hideWindow("TrayAppWnd");
    stopGlobalListener();
  }
}

// 窗口隐藏时自动停止监听（兜底）
window.addEventListener("unload", stopGlobalListener);

// 翻转前准备：调整窗口尺寸和margin
const prepareFlip = async () => {
  // 获取翻转内容的实际高度（根据不同标签计算）
  const extraHeight = 0; // this.activeTab === "help" ? 200 : 150;
  const newHeight = originalHeight.value + extraHeight;

  let bounds = await window.channel.getWindowBounds("TrayAppWnd");
  console.log(bounds);
  bounds.height = bounds.height + extraHeight;

  // 1. 调整 Electron 窗口尺寸
  await window.channel.setWindowBounds("TrayAppWnd", bounds);

  // 2. 设置页面margin-top，避免内容裁剪
  marginTop.value = extraHeight;
};

// 重置窗口尺寸
const resetWindowSize = async () => {
  const extraHeight = 0;
  let bounds = await window.channel.getWindowBounds("TrayAppWnd");
  bounds.height = bounds.height - extraHeight;
  console.log(bounds);
  await window.channel.setWindowBounds("TrayAppWnd", bounds);
  marginTop.value = 0;
};
</script>

<style scoped>
/* 3D 翻转核心样式 */
.tray-main {
  width: 100%;
  height: 100%;
  transition: margin-top 0.3s ease;
}

.flip-container {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.5s ease;
  perspective: 1000px;
}

/* 翻转状态 */
.flip-container.flipped {
  transform: rotateY(180deg);
}

.flip-front,
.flip-back {
  position: absolute;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.flip-back {
  transform: rotateY(180deg);
  box-sizing: border-box;
}

.default-content {
  height: 100%;
  box-sizing: border-box;
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
}
</style>
