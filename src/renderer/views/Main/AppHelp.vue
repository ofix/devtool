<template>
  <div class="help-wrapper">
    <AppTitleBar title="DevTool" />
    <!-- 核心滚动容器 -->
    <div class="app-help" ref="helpContainer">
      <!-- 应用Tab标签栏（滚轮控制+悬浮矩形按钮+横向滚动） -->
      <div
        class="tab-nav"
        ref="tabNavRef"
        @mouseenter="showArrows = true"
        @mouseleave="showArrows = false"
        @wheel="handleTabWheel"
      >
        <!-- 左按钮-矩形+左对齐+呼吸阴影 -->
        <button
          class="tab-btn tab-btn-left"
          @click="scrollTab('left')"
          :class="{ disabled: tabScrollLeft <= 0, show: showArrows }"
        >
          ←
        </button>
        <!-- Tab列表容器（可横向滚动+左右对齐） -->
        <div class="tab-list" ref="tabListRef" @scroll="onTabScroll">
          <button
            class="tab-item"
            v-for="(app, index) in filteredAppHelpList"
            :key="index"
            :class="{ active: activeTabIndex === index }"
            @click="switchTab(index)"
          >
            {{ app.appName }}
          </button>
        </div>
        <!-- 右按钮-矩形+右对齐+呼吸阴影 -->
        <button
          class="tab-btn tab-btn-right"
          @click="scrollTab('right')"
          :class="{ disabled: isTabScrollEnd, show: showArrows }"
        >
          →
        </button>
      </div>

      <!-- 对应Tab的帮助内容（修复v-html解析问题） -->
      <div class="help-content" v-if="filteredAppHelpList.length > 0">
        <!-- 替换v-html为组件式渲染，避免注释符号解析错误 -->
        <div
          class="help-desc"
          v-for="(desc, idx) in currentTabFilteredDesc"
          :key="idx"
        >
          <span v-html="highlightKeyword(desc)"></span>
        </div>
      </div>
      <!-- 无搜索结果/无内容提示 -->
      <div class="empty-tip" v-else>
        {{
          searchKeyword.value.trim()
            ? "当前Tab未找到匹配的帮助内容"
            : "暂无帮助内容"
        }}
      </div>
    </div>

    <!-- 底部搜索栏+返回按钮（固定） -->
    <div class="bottom-bar">
      <div class="search-wrapper">
        <input
          type="text"
          class="search-input"
          placeholder="搜索当前页帮助内容..."
          v-model="searchKeyword"
        />
      </div>
      <button class="back-btn" @click="handleBackClick">← 返回</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, computed, inject, nextTick } from "vue";
import AppTitleBar from "./AppTitleBar.vue";

// 定义emit通知父组件
const emit = defineEmits(["back"]);
// 注入返回事件
const handleHelpEvent = inject("helpClickEvent");

// 1. 原始应用帮助数据（10个应用）
const appHelpList = ref([
  {
    appName: "截图",
    descriptions: [
      "1. 快捷键 Ctrl+Shift+A 快速启动截图工具",
      "2. 支持矩形/自由形状/全屏/窗口精准截图",
      "3. 截图后可直接标注/马赛克/添加文字/裁剪",
      "4. Ctrl+S 保存到本地 | Ctrl+C 复制到剪贴板",
      "5. 常见问题：截图黑屏请关闭硬件加速后重试",
    ],
  },
  {
    appName: "视频录制",
    descriptions: [
      "1. 快捷键 Ctrl+Shift+R 开始/暂停视频录制",
      "2. 可选录制区域：全屏/自定义窗口/指定矩形区域",
      "3. 支持开启麦克风/系统声音单独/混合采集",
      "4. Alt+F4 停止录制并自动保存到默认视频目录",
      "5. 常见问题：无声音请检查音频设备权限和输出",
    ],
  },
  {
    appName: "屏幕标尺",
    descriptions: [
      "1. 快捷键 Ctrl+R 显示/隐藏屏幕标尺",
      "2. 滚轮滚动调整标尺刻度精度（像素/厘米/英寸）",
      "3. Shift+鼠标拖动 移动标尺位置，双击标尺居中",
      "4. 右键标尺可切换水平/垂直方向，重置标尺参数",
      "5. 常见问题：标尺不显示请确认应用在前台运行",
    ],
  },
  {
    appName: "十六进制编辑器",
    descriptions: [
      "1. 拖拽文件到编辑器窗口可直接解析为十六进制",
      "2. Ctrl+F 查找指定十六进制/ASCII字符值",
      "3. Ctrl+G 跳转到指定偏移量，支持十/十六进制输入",
      "4. Ctrl+S 保存修改 | Ctrl+Z 撤销上一步操作",
      "5. 常见问题：无法保存请确认文件未被其他程序占用",
    ],
  },
  {
    appName: "单位换算",
    descriptions: [
      "1. 快捷键 Ctrl+U 快速打开单位换算面板",
      "2. 支持长度/重量/时间/面积/体积等10+换算类型",
      "3. Tab键切换换算单位，Enter键执行快速换算",
      "4. 支持自定义常用换算单位，自动保存配置",
      "5. 常见问题：换算错误请检查单位类型是否选择正确",
    ],
  },
  {
    appName: "Postman",
    descriptions: [
      "1. 点击图标快速启动集成版Postman客户端",
      "2. Ctrl+N 新建请求，支持GET/POST/PUT/DELETE等方法",
      "3. Ctrl+R 发送请求，响应结果自动格式化展示",
      "4. Ctrl+/ 快速注释请求内容，支持批量导入/导出接口",
      "5. 常见问题：无法连接请检查网络和Postman服务状态",
    ],
  },
  {
    appName: "SFTP",
    descriptions: [
      "1. 首次使用需配置服务器地址/端口/账号密码",
      "2. Ctrl+P 上传本地文件到服务器指定目录",
      "3. Ctrl+D 下载服务器文件到本地，支持批量操作",
      "4. Ctrl+Del 删除服务器文件（谨慎操作，无回收站）",
      "5. 常见问题：连接失败请检查防火墙和服务器端口",
    ],
  },
  {
    appName: "文件比对",
    descriptions: [
      "1. 拖拽两个文件到比对窗口，自动识别文件类型",
      "2. 支持文本/图片/代码文件的差异精准比对",
      "3. F3 跳转到下一个差异点 | Shift+F3 上一个",
      "4. 可导出比对报告为HTML/JSON/文本格式",
      "5. 常见问题：无结果请确认文件格式相同且内容有差异",
    ],
  },
  {
    appName: "桌面磁贴",
    descriptions: [
      "1. Win+1~9 快速打开对应位置的磁贴应用",
      "2. Ctrl+鼠标拖动 调整磁贴大小和位置，支持自由排列",
      "3. 右键磁贴可编辑名称/更换图标/删除/分组",
      "4. 支持磁贴分组管理，拖拽磁贴到分组栏即可归类",
      "5. 常见问题：磁贴无响应请重启应用或重新添加",
    ],
  },
  {
    appName: "控制台",
    descriptions: [
      "1. F12 快速打开开发者控制台，支持命令行输入",
      "2. Ctrl+L 清空控制台输出，Tab键实现命令自动补全",
      "3. 支持执行系统命令/自定义脚本，输出实时展示",
      "4. 自动保存命令历史记录，下次打开可直接复用",
      "5. 常见问题：命令执行失败请用管理员模式启动应用",
    ],
  },
]);

// 2. 响应式状态
const searchKeyword = ref(""); // 搜索关键词
const activeTabIndex = ref(0); // 当前激活的Tab索引
const tabListRef = ref(null); // Tab列表DOM引用
const tabNavRef = ref(null); // Tab导航栏DOM引用
const tabScrollLeft = ref(0); // Tab滚动的left值
const isTabScrollEnd = ref(false); // 是否滚动到最右侧
const showArrows = ref(false); // 是否显示左右按钮
const helpContainer = ref(null);

// 3. 计算属性：过滤后的应用列表（全局）
const filteredAppHelpList = computed(() => {
  return appHelpList.value;
});

// 4. 计算属性：当前激活Tab的原始帮助内容
const currentTabOriginDesc = computed(() => {
  if (!filteredAppHelpList.value[activeTabIndex.value]) return [];
  return filteredAppHelpList.value[activeTabIndex.value].descriptions;
});

// 5. 计算属性：搜索当前Tab的帮助内容（仅过滤当前Tab）
const currentTabFilteredDesc = computed(() => {
  if (!searchKeyword.value.trim()) return currentTabOriginDesc.value;
  const keyword = searchKeyword.value.trim().toLowerCase();
  return currentTabOriginDesc.value.filter((desc) =>
    desc.toLowerCase().includes(keyword),
  );
});

// 6. Tab切换：切换到指定索引+重置滚动
const switchTab = (index) => {
  activeTabIndex.value = index;
  // 切换Tab清空搜索框
  searchKeyword.value = "";
};

// 7. Tab滚动：左右按钮/滚轮控制平滑滚动（处理边界）
const scrollTab = (direction, step = 150) => {
  if (!tabListRef.value) return;

  const el = tabListRef.value;
  const currentLeft = el.scrollLeft;
  const maxScrollLeft = el.scrollWidth - el.clientWidth;

  let newLeft = 0;
  if (direction === "left") {
    newLeft = Math.max(0, currentLeft - step);
  } else if (direction === "right") {
    newLeft = Math.min(maxScrollLeft, currentLeft + step);
  }

  el.scrollTo({
    left: newLeft,
    behavior: "smooth",
  });
};

// 8. 监听Tab滚动事件：更新滚动状态（控制按钮禁用）
const onTabScroll = () => {
  if (!tabListRef.value) return;
  const el = tabListRef.value;
  const { scrollLeft, scrollWidth, clientWidth } = el;
  tabScrollLeft.value = scrollLeft;
  isTabScrollEnd.value =
    Math.ceil(scrollLeft) >= Math.floor(scrollWidth - clientWidth - 5);
};

// 9. 处理鼠标滚轮事件
const handleTabWheel = (e) => {
  e.preventDefault();

  if (e.deltaY < 0 || e.deltaX < 0) {
    scrollTab("left", 80);
  } else if (e.deltaY > 0 || e.deltaX > 0) {
    scrollTab("right", 80);
  }
};

// 10. 兼容所有环境的正则转义方法 + 过滤非法字符
const escapeRegExp = (str) => {
  // 先过滤HTML注释符号和非法字符，避免v-html解析错误
  const cleanStr = str.replace(/<!--|-->|<|>|&/g, (match) => {
    const escapeMap = {
      "<!--": "",
      "-->": "",
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
    };
    return escapeMap[match] || match;
  });
  // 转义正则特殊字符
  return cleanStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// 11. 关键词高亮方法（修复HTML解析问题）
const highlightKeyword = (text) => {
  if (!searchKeyword.value.trim()) {
    // 无关键词时，转义特殊字符避免解析错误
    return text
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/&/g, "&amp;");
  }

  const keyword = searchKeyword.value.trim();
  const escapedKeyword = escapeRegExp(keyword);
  const reg = new RegExp(escapedKeyword, "gi");

  // 高亮前先转义原文本，再替换高亮部分
  const escapedText = text
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&/g, "&amp;");
  return escapedText.replace(
    reg,
    (match) => `<span class="highlight">${match}</span>`,
  );
};

// 12. 返回按钮事件：重置状态+触发父组件返回
const handleHelpClick = () => {
  if (typeof handleHelpEvent === "function") {
    handleHelpEvent();
  }
  searchKeyword.value = "";
  activeTabIndex.value = 0;
  showArrows.value = false;
  if (tabListRef.value) {
    tabListRef.value.scrollLeft = 0;
  }
};

// 修正：修复方法名重复问题
const handleBackClick = () => {
  handleHelpEvent();
  // 重置所有状态
  searchKeyword.value = "";
  activeTabIndex.value = 0;
  showArrows.value = false;
  if (tabListRef.value) {
    tabListRef.value.scrollLeft = 0;
  }
};

// 13. 初始化+监听
onMounted(() => {
  nextTick(() => {
    onTabScroll();
  });
  watch(
    filteredAppHelpList,
    () => {
      activeTabIndex.value = 0;
      nextTick(() => {
        onTabScroll();
      });
    },
    { immediate: true },
  );
});
</script>

<style scoped>
/* 外层容器：控制整体尺寸和布局 */
.help-wrapper {
  width: 640px;
  height: calc(480px - 80px);
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
}

/* 滚动容器：仅内容区域滚动 */
.app-help {
  width: 100%;
  height: 100%;
  padding: 0px 16px 0px;
  box-sizing: border-box;
}

/* 顶部大标题 */
.page-header {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.main-title {
  font-size: 16px;
  /* font-weight: 600; */
  color: #fff;
  margin: 0;
}

/* Tab标签栏：相对定位+滚轮事件捕获 */
.tab-nav {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  height: 50px;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 10;
  overflow: hidden;
}

/* Tab左右按钮：矩形样式+悬浮显示+呼吸阴影 */
.tab-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 32px;
  background: rgba(0, 0, 0, 0.8);
  color: #3b82f6;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  /* transition: all 0.3s ease; */
  flex-shrink: 0;
  opacity: 0;
  pointer-events: none;
  z-index: 11;
}
/* 按钮显示/禁用样式 */
.tab-btn.show {
  opacity: 1;
  pointer-events: auto;
  border: none;
  background-color: #000;
  /* box-shadow: x偏移 y偏移 模糊半径 扩散半径 颜色 阴影类型; */
  box-shadow: 10px 0 16px -8px rgba(59, 130, 246, 0.5);
  /* 关键参数说明：
     5px：水平右移5px（仅右侧显示）
     0：垂直无偏移
     8px：模糊半径（阴影柔和度）
     -3px：扩散半径（抵消左右扩散，仅保留右侧）
     rgba(59, 130, 246, 0.5)：蓝色半透明（和你Tab栏的蓝色一致）
  */
  /* animation: breathShadow 0.5s infinite ease-in-out; */
}
.tab-btn.show.disabled {
  opacity: 0.3;
  cursor: not-allowed;
  border-color: rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.6);
  color: #888;
  animation: none;
}
/* 按钮位置：左按钮左对齐，右按钮右对齐 */
.tab-btn-left {
  left: 0;
}
.tab-btn-right {
  right: 0;
}
/* 按钮hover效果 - 蓝色系增强 */
.tab-btn.show:not(.disabled):hover {
  background-color: #000;
  border-color: rgba(59, 130, 246, 0.6);
  color: #fff;
  /* box-shadow: 0 0 8px rgba(59, 130, 246, 0.4); */
}

/* 呼吸阴影动画（核心效果） */
@keyframes breathShadow {
  0% {
    box-shadow: 0 0 4px rgba(59, 130, 246, 0.2);
  }
  50% {
    box-shadow: 0 0 10px rgba(59, 130, 246, 0.4);
  }
  100% {
    box-shadow: 0 0 4px rgba(59, 130, 246, 0.2);
  }
}

/* Tab列表容器：横向滚动+左右对齐（避开按钮区域） */
.tab-list {
  width: 100%;
  max-width: calc(100% - 40px);
  height: 100%;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  padding: 0 2px;
  scroll-behavior: smooth;
}
/* 隐藏Chrome滚动条 */
.tab-list::-webkit-scrollbar {
  display: none;
}

/* Tab项样式 - 蓝色激活色 */
.tab-item {
  padding: 6px 16px;
  border-radius: 20px;
  border: none;
  background: transparent;
  color: #ccc;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
}
.tab-item.active {
  background: rgba(59, 130, 246, 0.2);
  color: #3b82f6;
  font-weight: 500;
}
.tab-item:hover:not(.active) {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

/* 帮助内容区域 */
.help-content {
  overflow-y: auto;
  height: 200px;
  padding: 20px;
  line-height: 1.8;
}
.help-desc {
  font-size: 14px;
  color: #e5e7eb;
  margin-bottom: 12px;
  list-style: none;
}
/* 关键词【蓝色】高亮样式 - 核心样式（适配深色背景） */
.highlight {
  color: #3b82f6;
  font-weight: 600;
  background: rgba(59, 130, 246, 0.1);
  padding: 1px 4px;
  border-radius: 3px;
}

/* 无搜索结果提示 */
.empty-tip {
  text-align: center;
  padding: 60px 20px;
  color: #888;
  font-size: 14px;
}

/* 底部搜索栏+返回按钮（固定底部） */
.bottom-bar {
  position: sticky;
  transform-style: preserve-3d;
  backface-visibility: hidden;
  bottom: 0;
  height: 70px;
  padding: 12px 20px;
  background: rgba(0, 0, 0, 0.9);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 15000;
  box-sizing: border-box;
}

/* 搜索框样式 - 蓝色聚焦边框 */
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
  transition: all 0.2s ease;
  box-sizing: border-box;
}
.search-input::placeholder {
  color: #888;
}
.search-input:focus {
  border-color: #3b82f6;
  background: rgba(255, 255, 255, 0.15);
}

/* 返回按钮样式 - 蓝色hover边框 */
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
  border-color: rgba(59, 130, 246, 0.3);
}
.back-btn:active {
  background: rgba(255, 255, 255, 0.05);
  transform: scale(0.98);
}

/* 整体滚动条样式 - 蓝色系 */
.help-content::-webkit-scrollbar {
  width: 6px;
  background: transparent;
}
.help-content::-webkit-scrollbar-thumb {
  background: rgba(59, 130, 246, 0.2);
  border-radius: 3px;
}
.help-content::-webkit-scrollbar-thumb:hover {
  background: rgba(59, 130, 246, 0.3);
}
.help-content::-webkit-scrollbar-track {
  background: transparent;
}
</style>
