<template>
  <!-- 托盘弹窗主体：半透明黑色、Windows 11风格 -->
  <div class="tray-window">
    <!-- 常见应用区域（默认显示，即使数量为0） -->
    <div class="common-apps">
      <div
        class="section-header"
        @mouseenter="showCommonCollapse = true"
        @mouseleave="showCommonCollapse = false"
      >
        <div>
          <span>常见应用</span>
          <span class="count-badge" v-if="commonApps.length > 0">{{
            commonApps.length
          }}</span>
        </div>

        <!-- 折叠下拉按钮：默认隐藏，鼠标移入标题栏显示 -->
        <button
          class="collapse-btn"
          :class="{ expanded: commonExpanded, visible: showCommonCollapse }"
          @click="commonExpanded = !commonExpanded"
        >
          <IconCollapse class="arrow-icon" />
        </button>
      </div>
      <!-- 常见应用列表：统一Grid布局，每行4个 -->
      <div class="apps-grid common-grid" v-show="commonExpanded">
        <div
          class="app-item"
          v-for="(app, index) in commonApps"
          :key="app.key"
          :class="{ disabled: app.disabled }"
          draggable="true"
          @dragstart="handleDragStart(index)"
          @dragover="handleDragOver"
          @drop="handleDrop(index)"
          @click="!app.disabled && openApp(app.key)"
          @contextmenu.prevent="
            !app.disabled && handleCommonAppRightClick($event, app)
          "
        >
          <component :is="`Icon${app.icon}`" class="app-icon" />
          <span class="app-name">{{ app.name }}</span>
        </div>
      </div>
    </div>

    <!-- 所有应用区域 -->
    <div class="all-apps">
      <div
        class="section-header"
        @mouseenter="showAllCollapse = true"
        @mouseleave="showAllCollapse = false"
      >
        <div>
          <span>所有应用</span>
          <span class="count-badge">{{ allApps.length }}</span>
        </div>
        <!-- 折叠下拉按钮：默认隐藏，鼠标移入标题栏显示 -->
        <button
          class="collapse-btn"
          :class="{ expanded: allExpanded, visible: showAllCollapse }"
          @click="allExpanded = !allExpanded"
        >
          <IconCollapse class="arrow-icon" />
        </button>
      </div>
      <!-- 所有应用列表：Grid布局，每行4个 -->
      <div class="apps-grid all-grid" v-show="allExpanded">
        <div
          class="app-item"
          v-for="app in allApps"
          :key="app.key"
          :class="{ disabled: app.disabled }"
          @click="!app.disabled && openApp(app.key)"
          @contextmenu.prevent="
            !app.disabled && handleAllAppRightClick($event, app)
          "
        >
          <component :is="`Icon${app.icon}`" class="app-icon" />
          <span class="app-name">{{ app.name }}</span>
        </div>
      </div>
    </div>

    <SearchBar />
  </div>

  <!-- 右键菜单（Element-plus Popover） -->
  <el-popover
    ref="popoverRef"
    v-model="popoverVisible"
    placement="right"
    trigger="manual"
    width="120"
    popper-class="custom-popover"
  >
    <div class="menu-container">
      <el-button
        type="primary"
        size="small"
        @click="handlePinApp"
        v-if="menuType === 'all'"
      >
        置顶
      </el-button>
      <el-button
        type="primary"
        size="small"
        @click="handleUnpinApp"
        v-if="menuType === 'common'"
      >
        取消置顶
      </el-button>
    </div>
  </el-popover>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from "vue";
import { ElPopover, ElButton } from "element-plus";
import IconCollapse from "@/icons/IconCollapse.vue";
import SearchBar from "./SearchBar.vue";

// 1. 定义应用数据（添加disabled字段支持禁用）
const allApps = ref([
  {
    key: "ScreenshotToolWnd",
    name: "截图",
    icon: "Screenshot",
    disabled: false,
  },
  { key: "ScreenRulerWnd", name: "屏幕标尺", icon: "Ruler", disabled: false },
  {
    key: "VideoRecordWnd",
    name: "视频录制",
    icon: "VideoRecord",
    disabled: true,
  }, // 示例：禁用
  {
    key: "HexEditorWnd",
    name: "十六进制编辑器",
    icon: "HexEditor",
    disabled: true,
  },
  {
    key: "UnitConvertWnd",
    name: "单位换算",
    icon: "UnitConvert",
    disabled: false,
  },
  { key: "PostWomanWnd", name: "postman", icon: "Postman", disabled: true },
  { key: "SFTPWnd", name: "sftp", icon: "SFTP", disabled: true },
  {
    key: "FileCompareWnd",
    name: "文件对比",
    icon: "FileCompare",
    disabled: true,
  },
  {
    key: "DesktopTileWnd",
    name: "桌面磁贴",
    icon: "DesktopTile",
    disabled: true,
  },
  { key: "SSHWnd", name: "控制台", icon: "Console", disabled: true },
]);

// 2. 本地存储key定义
const STORAGE_KEYS = {
  APP_USAGE: "app_usage", // 应用使用频次
  COMMON_APPS_ORDER: "common_apps_order", // 常见应用自定义顺序
};

// 3. 响应式数据
const commonApps = ref([]); // 常见应用列表（默认空）
const popoverVisible = ref(false); // 右键菜单显示状态
const currentRightClickApp = ref(null); // 当前右键点击的应用
const dragStartIndex = ref(-1); // 拖拽起始索引
const commonExpanded = ref(true); // 常见应用折叠状态
const allExpanded = ref(true); // 所有应用折叠状态
const menuType = ref(""); // 右键菜单类型：common/all
// 新增：控制折叠按钮显示/隐藏
const showCommonCollapse = ref(false);
const showAllCollapse = ref(false);
// 新增：popover引用，解决定位问题
const popoverRef = ref(null);

// 4. 初始化：从localStorage加载数据
onMounted(() => {
  loadAppUsage();
  loadCommonAppsOrder();
  updateCommonApps(); // 修复：初始化时调用更新常见应用列表
});

// 5. 加载应用使用频次
function loadAppUsage() {
  const usage = localStorage.getItem(STORAGE_KEYS.APP_USAGE);
  return usage ? JSON.parse(usage) : {};
}

// 6. 加载常见应用自定义顺序
function loadCommonAppsOrder() {
  const order = localStorage.getItem(STORAGE_KEYS.COMMON_APPS_ORDER);
  return order ? JSON.parse(order) : [];
}

// 新增：更新常见应用列表（原代码缺失此核心函数）
function updateCommonApps() {
  const usage = loadAppUsage();
  const customOrder = loadCommonAppsOrder();

  // 步骤1：优先显示自定义顺序的应用
  const customApps = customOrder
    .map((key) => {
      return allApps.value.find((app) => app.key === key);
    })
    .filter(Boolean);

  // 步骤2：补充剩余应用（按使用频次降序）
  const otherApps = allApps.value
    .filter((app) => !customOrder.includes(app.key) && !app.disabled)
    .sort((a, b) => (usage[b.key] || 0) - (usage[a.key] || 0));

  // 步骤3：合并并限制最多8个
  commonApps.value = [...customApps, ...otherApps].slice(0, 8);
}

// 8. 打开应用窗口（并记录使用频次）
function openApp(appKey) {
  // 发送IPC给主进程，打开应用窗口
  if (window.channel?.showWindow) {
    window.channel.showWindow(appKey);
  }

  // 记录使用频次
  const usage = loadAppUsage();
  usage[appKey] = (usage[appKey] || 0) + 1;
  localStorage.setItem(STORAGE_KEYS.APP_USAGE, JSON.stringify(usage));

  // 更新常见应用列表
  updateCommonApps();
}

// 9. 常见应用右键菜单处理
function handleCommonAppRightClick(e, app) {
  currentRightClickApp.value = app;
  menuType.value = "common";
  showPopover(e);
}

// 10. 所有应用右键菜单处理
function handleAllAppRightClick(e, app) {
  currentRightClickApp.value = app;
  menuType.value = "all";
  showPopover(e);
}

// 11. 显示右键菜单（修复定位逻辑）
function showPopover(e) {
  popoverVisible.value = false; // 先关闭，避免重复触发
  nextTick(() => {
    popoverVisible.value = true;
    // 修复：通过ref获取popover元素，解决querySelector定位失败问题
    const popover = popoverRef.value?.popperRef?.el;
    if (popover) {
      // 兼容不同浏览器的坐标计算
      const x = e.clientX || e.pageX;
      const y = e.clientY || e.pageY;
      popover.style.position = "fixed";
      popover.style.left = `${x + 10}px`; // 偏移10px避免遮挡鼠标
      popover.style.top = `${y + 10}px`;
      popover.style.zIndex = 9999;
    }
  });
}

// 12. 置顶应用到常见应用第一个位置
function handlePinApp() {
  if (!currentRightClickApp.value) return;

  const appKey = currentRightClickApp.value.key;
  let customOrder = loadCommonAppsOrder();

  // 移除已有项，添加到首位
  customOrder = [appKey, ...customOrder.filter((key) => key !== appKey)];

  // 限制最多8个
  if (customOrder.length > 8) {
    customOrder = customOrder.slice(0, 8);
  }

  // 保存到localStorage
  localStorage.setItem(
    STORAGE_KEYS.COMMON_APPS_ORDER,
    JSON.stringify(customOrder)
  );

  // 更新常见应用列表
  updateCommonApps();
  popoverVisible.value = false;
}

// 13. 取消置顶（从常见应用移除）
function handleUnpinApp() {
  if (!currentRightClickApp.value) return;

  const appKey = currentRightClickApp.value.key;
  let customOrder = loadCommonAppsOrder();

  // 从自定义顺序中移除
  customOrder = customOrder.filter((key) => key !== appKey);

  // 保存到localStorage
  localStorage.setItem(
    STORAGE_KEYS.COMMON_APPS_ORDER,
    JSON.stringify(customOrder)
  );

  // 更新常见应用列表
  updateCommonApps();
  popoverVisible.value = false;
}

// 14. 拖拽排序：开始拖拽
function handleDragStart(index) {
  dragStartIndex.value = index;
}

// 15. 拖拽排序：允许放置
function handleDragOver(e) {
  e.preventDefault();
}

// 16. 拖拽排序：放置（更新自定义顺序）
function handleDrop(dropIndex) {
  if (dragStartIndex.value === -1 || dragStartIndex.value === dropIndex) return;

  // 复制当前常见应用顺序
  const customOrder = [...commonApps.value.map((app) => app.key)];
  // 交换位置
  const [draggedItem] = customOrder.splice(dragStartIndex.value, 1);
  customOrder.splice(dropIndex, 0, draggedItem);
  // 保存到localStorage
  localStorage.setItem(
    STORAGE_KEYS.COMMON_APPS_ORDER,
    JSON.stringify(customOrder)
  );

  // 更新常见应用列表
  updateCommonApps();
  dragStartIndex.value = -1;
}
</script>

<style scoped>
/* 核心样式：Windows 11风格、半透明黑色、自适应滚动条 */
.tray-window {
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8); /* 半透明黑色 */
  /* 磨砂模糊 */
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  padding: 16px;
  box-sizing: border-box;
  overflow-y: auto; /* 自适应滚动 */
  color: #fff; /* 文字白色 */
}

/* 滚动条样式：Windows 11风格 */
.tray-window::-webkit-scrollbar {
  width: 6px;
  background: transparent;
}
.tray-window::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
}
.tray-window::-webkit-scrollbar-track {
  background: transparent;
}

/* 区域标题 */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  position: relative; /* 为折叠按钮定位做准备 */
}
.section-header .count-badge {
  background: #0078d4; /* 海蓝色（Windows 11主题色） */
  color: #fff;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 12px;
  margin-left: 8px;
}

/* 折叠按钮样式：默认隐藏，鼠标移入标题栏显示 */
.collapse-btn {
  background: transparent;
  border: none;
  color: #fff;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition:
    background 0.2s,
    opacity 0.3s ease;
  opacity: 0; /* 默认隐藏 */
  position: absolute;
  right: 0;
}
/* 鼠标移入标题栏时显示按钮 */
.collapse-btn.visible {
  opacity: 1;
}
.collapse-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}
/* 箭头旋转：展开顺时针90度，收缩逆时针90度（初始为向右，展开向下） */
.arrow-icon {
  transition: transform 0.3s ease;
  transform: rotate(0deg); /* 初始状态：向右 */
}
/* 展开状态：顺时针旋转90度（向下） */
.expanded .arrow-icon {
  transform: rotate(90deg);
}

/* 应用列表布局：统一Grid布局 */
.apps-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr); /* 每行4个 */
  gap: 16px;
  margin-bottom: 24px;
}

/* 应用项样式 */
.app-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
  user-select: none; /* 防止右键时选中文字 */
}
.app-item:hover:not(.disabled) {
  background: rgba(255, 255, 255, 0.1);
}
/* 禁用状态样式 */
.app-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.app-icon {
  width: 32px;
  height: 32px;
  fill: #fff; /* SVG图标白色 */
  margin-bottom: 8px;
}
.app-item.disabled .app-icon {
  fill: #999; /* 禁用时图标灰色 */
}
.app-name {
  font-size: 12px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}

/* 右键菜单样式 */
:deep(.custom-popover) {
  background: rgba(0, 0, 0, 0.9) !important;
  border: 1px solid rgba(255, 255, 255, 0.2) !important;
  border-radius: 4px !important;
  padding: 8px !important;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5) !important;
}
.menu-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
:deep(.el-button--primary) {
  background: #0078d4 !important;
  border: none !important;
  width: 100%;
}
/* 修复popover默认样式覆盖 */
:deep(.el-popover__popper) {
  z-index: 9999 !important;
}
</style>
