<template>
  <div class="mac-titlebar" :class="{ maximized: isMaximized }">
    <!-- 核心修改：给容器添加hover监听，控制所有图标显示 -->
    <div
      class="traffic-lights"
      @mouseenter="isLightsHovered = true"
      @mouseleave="isLightsHovered = false"
    >
      <!-- 关闭按钮 -->
      <button
        class="traffic-light close"
        @click="handleClose"
        @mouseover.stop
        @mouseout.stop
      >
        <!-- 修改：根据容器hover状态显示图标 -->
        <IconCloseBox v-if="isLightsHovered" />
      </button>
      <!-- 最小化按钮 -->
      <button
        class="traffic-light minimize"
        @click="handleMinimize"
        @mouseover.stop
        @mouseout.stop
      >
        <IconMinimizeBox v-if="isLightsHovered" />
      </button>
      <!-- 最大化/还原按钮 -->
      <button
        class="traffic-light maximize"
        @click="handleMaximize"
        @mouseover.stop
        @mouseout.stop
      >
        <IconMacMaximize v-if="isLightsHovered && !isMaximized" />
        <IconMacRestore v-if="isLightsHovered && isMaximized" />
      </button>
    </div>

    <!-- 窗口标题 -->
    <div class="window-title">
      {{ wndTitle }}
    </div>

    <!-- 右侧空白区域（模拟原生标题栏） -->
    <div class="titlebar-right"></div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import IconMacMaximize from "@/icons/IconMacMaximize.vue";
import IconMacRestore from "@/icons/IconMacRestore.vue";
import IconCloseBox from "@/icons/IconCloseBox.vue";
import IconMinimizeBox from "@/icons/IconMinimizeBox.vue";

// 定义 props（支持自定义标题、初始最大化状态）
const props = defineProps({
  wndTitle: {
    type: String,
    default: "",
  },
  initialMaximized: {
    type: Boolean,
    default: false,
  },
});

// 定义事件（向父组件暴露窗口控制事件）
const emit = defineEmits(["close", "minimize", "maximize", "restore", "drag"]);

// 响应式状态
const isMaximized = ref(props.initialMaximized); // 窗口是否最大化
// 核心修改：新增容器hover状态，控制所有图标显示
const isLightsHovered = ref(false);

// 关闭窗口
const handleClose = () => {
  emit("close");
};

// 最小化窗口
const handleMinimize = () => {
  emit("minimize");
};

// 最大化/还原窗口
const handleMaximize = () => {
  if (isMaximized.value) {
    emit("restore");
  } else {
    emit("maximize");
  }
  isMaximized.value = !isMaximized.value;
};

// 初始化最大化状态
onMounted(() => {
  isMaximized.value = props.initialMaximized;
});
</script>

<style type="scss" scoped>
.mac-titlebar {
  height: 28px; /* 严格匹配原生高度 */
  background-color: #ffffff; /* 原生默认是纯白，不是浅灰 */
  display: flex;
  align-items: center;
  -webkit-app-region: drag;
  user-select: none;
  padding: 0 8px 0 16px; /* 左侧内边距调整为16px，匹配原生 */
  box-sizing: border-box;
  border-bottom: none; /* 原生标题栏无下边框 */
  font-synthesis: none; /* 禁用字体合成，匹配macOS字体渲染 */
  position: relative;

  &.maximized {
    padding-left: 0; /* 最大化时左侧无内边距 */

    .traffic-lights {
      padding-left: 16px; /* 红绿灯区域补回内边距 */
    }
  }
}

/* 红绿灯按钮容器 - 原生布局优化 */
.traffic-lights {
  display: flex;
  gap: 8px; /* 原生间距是8px，不是6px */
  margin-right: 20px; /* 与标题的间距调整为原生值 */
  -webkit-app-region: no-drag;
  align-items: center;
  pointer-events: auto; /* 确保事件能正常触发 */
  position: relative;
}

/* 基础红绿灯按钮样式 - 完全匹配原生 */
.traffic-light {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  outline: none;
  padding: 0;
  position: relative;
  transition: background-color 0.1s ease; /* 原生过渡动画 */
  pointer-events: auto; /* 强制启用指针事件 */
  z-index: 10; /* 确保按钮在最上层 */

  & > * {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 8px;
    height: 8px;
    color: #000; /* 修改：图标改为白色，匹配原生 */
    opacity: 1; /* 改为1，由v-if控制显示隐藏 */
    transition: opacity 0.1s ease;
  }
}

/* 核心优化：容器hover时，所有按钮同时变色
:deep(.traffic-lights:hover .traffic-light.close) {
  background-color: #ff2c20 !important; 
}

:deep(.traffic-lights:hover .traffic-light.minimize) {
  background-color: #e0a100 !important; 
}

:deep(.traffic-lights:hover .traffic-light.maximize) {
  background-color: #00b22d !important;
} */

/* 基础颜色（非hover状态） */
:deep(.traffic-light.close) {
  background-color: #ff5f56; /* 原生精确色值 */

  &:active {
    background-color: #e01b16 !important; /* 点击按下效果 */
  }
}

:deep(.traffic-light.minimize) {
  background-color: #ffbd2e; /* 原生精确色值 */

  &:active {
    background-color: #c08b00 !important; /* 点击按下效果 */
  }
}

:deep(.traffic-light.maximize) {
  background-color: #27c93f; /* 原生精确色值 */

  &:active {
    background-color: #009a26 !important; /* 点击按下效果 */
  }
}

/* 窗口标题 - 完全匹配原生样式 */
.window-title {
  flex: 1;
  font-size: 13px;
  color: #1c1c1e; /* 原生文本色值 */
  text-align: center;
  font-family:
    -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue",
    sans-serif;
  font-weight: 400; /* 原生字重 */
  letter-spacing: -0.02em; /* 匹配原生字间距 */
  line-height: 28px; /* 行高匹配标题栏高度 */
}

/* 右侧空白区域 - 模拟原生 */
.titlebar-right {
  width: 120px;
  -webkit-app-region: no-drag; /* 右侧区域取消拖拽，匹配原生 */
}

/* 深色模式适配 - 精确匹配macOS深色模式 */
@media (prefers-color-scheme: dark) {
  .mac-titlebar {
    background-color: #1c1c1e; /* 原生深色模式背景 */
    border-bottom-color: transparent;
  }

  .window-title {
    color: #f2f2f2; /* 深色模式文本色 */
  }

  /* 深色模式基础色 */
  :deep(.traffic-light.close) {
    background-color: #ff6159 !important;
  }

  :deep(.traffic-light.minimize) {
    background-color: #ffc038 !important;
  }

  :deep(.traffic-light.maximize) {
    background-color: #31d146 !important;
  }

  /* 深色模式hover色 */
  :deep(.traffic-lights:hover .traffic-light.close) {
    background-color: #ff2c20 !important;
  }

  :deep(.traffic-lights:hover .traffic-light.minimize) {
    background-color: #e0a100 !important;
  }

  :deep(.traffic-lights:hover .traffic-light.maximize) {
    background-color: #00b22d !important;
  }
}

/* 窗口非活跃状态样式（可选，增强原生体验） */
:deep(.mac-titlebar:not(.active) .traffic-light.close) {
  background-color: #ad504e !important;
}

:deep(.mac-titlebar:not(.active) .traffic-light.minimize) {
  background-color: #ad8e48 !important;
}

:deep(.mac-titlebar:not(.active) .traffic-light.maximize) {
  background-color: #4a8e54 !important;
}

/* 非活跃状态hover效果 */
:deep(.mac-titlebar:not(.active) .traffic-lights:hover .traffic-light.close) {
  background-color: #ff5f56 !important;
}

:deep(
  .mac-titlebar:not(.active) .traffic-lights:hover .traffic-light.minimize
) {
  background-color: #ffbd2e !important;
}

:deep(
  .mac-titlebar:not(.active) .traffic-lights:hover .traffic-light.maximize
) {
  background-color: #27c93f !important;
}
</style>
