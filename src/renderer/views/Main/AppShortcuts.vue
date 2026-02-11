<template>
  <AppTitleBar title="DevTool" />
  <div class="app-shortcuts">
    <!-- 2. 内容容器（新增：给置顶标题留空间） -->
    <div class="content-wrapper">
      <!-- 按应用归类的快捷键列表（支持搜索过滤） -->
      <div class="shortcut-container" v-if="filteredAppList.length > 0">
        <div
          class="app-group"
          v-for="(app, appIndex) in filteredAppList"
          :key="appIndex"
        >
          <!-- 应用标题 -->
          <h2 class="app-title">{{ app.appName }}</h2>
          <!-- 该应用下的快捷键列表 -->
          <div class="shortcut-list">
            <div
              class="shortcut-item"
              v-for="(item, keyIndex) in app.shortcuts"
              :key="keyIndex"
            >
              <div class="shortcut-key">
                <span
                  class="key-box"
                  v-for="(key, kIndex) in splitShortcutKey(item.key)"
                  :key="kIndex"
                >
                  {{ key }}
                </span>
                <span
                  class="key-separator"
                  v-if="
                    item.key.includes('+') &&
                    kIndex < splitShortcutKey(item.key).length - 1
                  "
                  >+</span
                >
              </div>
              <div class="shortcut-desc">{{ item.desc }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 无搜索结果提示 -->
      <div class="empty-tip" v-else>未找到匹配的快捷键，请更换关键词重试</div>
    </div>

    <!-- 3. 底部搜索栏 + 返回按钮 -->
    <div class="bottom-bar">
      <!-- 搜索框 -->
      <div class="search-wrapper">
        <input
          type="text"
          class="search-input"
          placeholder="搜索应用/快捷键..."
          v-model="searchKeyword"
        />
      </div>
      <!-- 返回按钮 -->
      <button class="back-btn" @click="handleBackClick">← 返回</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, inject } from "vue";
import AppTitleBar from "./AppTitleBar.vue";
// 1. 数据驱动：按应用归类的快捷键列表（核心）
const appShortcutList = ref([
  {
    appName: "截图",
    shortcuts: [
      { key: "Ctrl + Shift + A", desc: "启动截图工具" },
      { key: "Ctrl + S", desc: "保存截图到本地" },
      { key: "Ctrl + C", desc: "复制截图到剪贴板" },
      { key: "Esc", desc: "取消截图操作" },
    ],
  },
  {
    appName: "视频录制",
    shortcuts: [
      { key: "Ctrl + Shift + R", desc: "开始/暂停视频录制" },
      { key: "Ctrl + Shift + F", desc: "全屏录制" },
      { key: "Alt + F4", desc: "停止录制并保存" },
    ],
  },
  {
    appName: "屏幕标尺",
    shortcuts: [
      { key: "Ctrl + R", desc: "显示/隐藏标尺" },
      { key: "Mouse Wheel", desc: "调整标尺刻度" },
      { key: "Shift + Drag", desc: "移动标尺位置" },
    ],
  },
  {
    appName: "十六进制编辑器",
    shortcuts: [
      { key: "Ctrl + F", desc: "查找十六进制值" },
      { key: "Ctrl + G", desc: "跳转到指定偏移量" },
      { key: "Ctrl + Z", desc: "撤销上一步操作" },
    ],
  },
  {
    appName: "单位换算",
    shortcuts: [
      { key: "Ctrl + U", desc: "打开单位换算面板" },
      { key: "Tab", desc: "切换换算单位类型" },
      { key: "Enter", desc: "执行单位换算" },
    ],
  },
  {
    appName: "Postman",
    shortcuts: [
      { key: "Ctrl + N", desc: "新建请求" },
      { key: "Ctrl + R", desc: "发送请求" },
      { key: "Ctrl + /", desc: "注释请求内容" },
    ],
  },
  {
    appName: "SFTP",
    shortcuts: [
      { key: "Ctrl + P", desc: "上传文件到服务器" },
      { key: "Ctrl + D", desc: "下载文件到本地" },
      { key: "Ctrl + Del", desc: "删除服务器文件" },
    ],
  },
  {
    appName: "文件比对",
    shortcuts: [
      { key: "Ctrl + B", desc: "开始文件比对" },
      { key: "F3", desc: "跳转到下一个差异点" },
      { key: "Shift + F3", desc: "跳转到上一个差异点" },
    ],
  },
  {
    appName: "桌面磁贴",
    shortcuts: [
      { key: "Win + 1-9", desc: "打开对应位置的磁贴应用" },
      { key: "Ctrl + Drag", desc: "调整磁贴大小" },
      { key: "Right Click", desc: "磁贴右键菜单" },
    ],
  },
  {
    appName: "控制台",
    shortcuts: [
      { key: "F12", desc: "打开开发者控制台" },
      { key: "Ctrl + L", desc: "清空控制台输出" },
      { key: "Tab", desc: "自动补全命令" },
      { key: "Enter", desc: "执行输入的命令" },
    ],
  },
]);

// 2. 搜索关键词（响应式）
const searchKeyword = ref("");

// 3. 计算属性：根据关键词过滤应用/快捷键
const filteredAppList = computed(() => {
  if (!searchKeyword.value.trim()) {
    return appShortcutList.value; // 无关键词时显示全部
  }
  const keyword = searchKeyword.value.trim().toLowerCase();
  return appShortcutList.value.filter((app) => {
    // 匹配应用名称
    const matchAppName = app.appName.toLowerCase().includes(keyword);
    // 匹配该应用下的快捷键
    const matchShortcut = app.shortcuts.some(
      (item) =>
        item.key.toLowerCase().includes(keyword) ||
        item.desc.toLowerCase().includes(keyword),
    );
    return matchAppName || matchShortcut;
  });
});

// 4. 注入翻转事件
const handleShortcutClick = inject("shortcutClickEvent");

// 5. 工具函数：拆分组合键
const splitShortcutKey = (keyStr) => {
  return keyStr.split(" + ").filter(Boolean);
};

// 6. 返回按钮点击事件
const handleBackClick = () => {
  if (typeof handleShortcutClick === "function") {
    handleShortcutClick();
  }
  // 清空搜索框
  searchKeyword.value = "";
};
</script>

<style scoped>
body {
  overflow-y: hidden;
}
.app-shortcuts {
  width: 640px;
  height: calc(480px - 80px);
  overflow: hidden;
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  border-radius: 8px;
  position: relative;
}

/* 1. 置顶大标题样式（核心修改） */
.sticky-header {
  position: fixed; /* 固定定位实现置顶 */
  top: 0;
  left: 0;
  right: 0;
  z-index: 9; /* 低于底部栏但高于内容 */
  padding: 8px 16px; /* 与内容padding对齐 */
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.85);
  /* backdrop-filter: blur(8px); 
    -webkit-backdrop-filter: blur(8px); */
}

.main-title {
  font-size: 16px;
  /* font-weight: 600; */
  color: #fff;
  margin: 0;
  text-align: left;
}

/* 新增：内容容器（给置顶标题留空间+滚动） */
.content-wrapper {
  height: 100%;
  overflow-y: auto;
  padding: 60px 16px 80px; /* 顶部留标题高度，底部留搜索栏高度 */
  box-sizing: border-box;
}

/* 2. 应用分组样式 */
.app-group {
  margin-bottom: 24px;
}

.app-title {
  font-size: 16px;
  font-weight: 500;
  color: #e5e7eb;
  margin: 0 0 12px 0;
  padding-left: 8px;
  border-left: 3px solid #4f46e5; /* 侧边标色，增强分类感 */
}

/* 快捷键列表样式（微调） */
.shortcut-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 11px; /* 与应用标题对齐 */
}

.shortcut-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  transition: background-color 0.1s ease;
  border-radius: 6px;
}

.shortcut-item:hover {
  background-color: rgb(46, 46, 51);
  padding: 8px 12px;
  margin: 0 -12px;
}

.shortcut-key {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  min-width: 180px; /* 加宽，适配多键组合 */
}

.key-box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  border: 1px solid #545555;
  color: #ccc;
  border-radius: 6px;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  font-weight: 500;
  min-width: 40px;
  height: 28px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.key-separator {
  font-size: 14px;
  color: #888;
  font-weight: 400;
}

.shortcut-desc {
  font-size: 14px;
  color: #b6b7b9;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  line-height: 1.5;
}

/* 无结果提示 */
.empty-tip {
  text-align: center;
  padding: 40px 0;
  color: #888;
  font-size: 14px;
}

/* 3. 底部栏样式（搜索 + 返回） */
.bottom-bar {
  position: sticky;
  transform-style: preserve-3d;
  backface-visibility: hidden;
  bottom: 0;
  left: 0;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.9);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0 0 8px 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 1000; /* 高于置顶标题 */
}

/* 搜索框样式 */
.search-wrapper {
  flex: 1;
}

.search-input {
  width: 100%;
  height: 36px;
  padding: 0 16px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s ease;
}

.search-input::placeholder {
  color: #888;
}

.search-input:focus {
  border-color: #4f46e5;
  background: rgba(255, 255, 255, 0.15);
}

/* 返回按钮样式（适配深色） */
.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
}

.back-btn:active {
  background: rgba(255, 255, 255, 0.05);
  transform: scale(0.98);
}

.content-wrapper::-webkit-scrollbar {
  width: 8px;
  background: transparent;
}

.content-wrapper::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  transition: background 0.2s ease;
}

.content-wrapper::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

.content-wrapper::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 4px;
}
</style>
