<template>
  <div class="theme-switch" @click="toggleTheme">
    <!-- 可视遮罩容器，截断溢出 -->
    <div class="icon-wrapper" :class="{ dark: theme === 'dark' }">
      <!-- 亮色太阳图标 -->
      <IconLight class="icon light-icon" />
      <!-- 深色月亮图标 -->
      <IconDark class="icon dark-icon" />
    </div>
  </div>
</template>

<script setup>
// 你的两个图标组件
import IconLight from "@/icons/IconLight.vue";
import IconDark from "@/icons/IconDark.vue";
import { useTheme } from "@/theme/ThemeManager.js";
const { theme, toggleTheme } = useTheme();
</script>

<style scoped>
.theme-switch {
  cursor: pointer;
  width: 18px;
  height: 18px;
  overflow: hidden;
  display: flex;
  align-items: center;
}

/* 图标总容器，滑动核心 */
.icon-wrapper {
  display: flex;
  width: 36px;
  /* 缓动曲线，模拟原生顺滑手感 */
  transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}
/* 深色模式整体左滑一半宽度 */
.icon-wrapper.dark {
  transform: translateX(-18px);
}

.icon {
  flex-shrink: 0;
  color: var(--dt-svg-color);
  transition: opacity 0.26s ease;
}

/* 无dark时月亮透明，有dark时太阳透明 */
.icon-wrapper:not(.dark) .dark-icon {
  opacity: 0;
}

.icon-wrapper.dark .light-icon {
  opacity: 0;
}
</style>
