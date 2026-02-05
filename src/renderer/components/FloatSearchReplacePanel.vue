<template>
  <!-- 搜索替换浮动面板 -->
  <div class="search-replace-panel" v-if="showFindReplace">
    <!-- 搜索替换输入区域 -->
    <div class="search-replace-inputs">
      <!-- 搜索输入 -->
      <div class="input-group">
        <span class="input-label">查找:</span>
        <el-input
          v-model="searchValue"
          placeholder="输入要查找的内容"
          class="search-input"
          @input="handleSearch"
          @keyup.enter="findNext"
        >
          <template #suffix>
            <span class="match-count">{{ matchCount }} 个匹配项</span>
            <IconMatchCase
              class="match-icon"
              :class="{ active: matchConfig.caseSensitive }"
              @click="toggleMatchConfig('caseSensitive')"
              title="大小写敏感匹配 (Alt+C)"
            />
            <IconMatchWholeWord
              class="match-icon"
              :class="{ active: matchConfig.wholeWord }"
              @click="toggleMatchConfig('wholeWord')"
              title="全字匹配 (Alt+W)"
            />
            <IconMatchRegex
              class="match-icon"
              :class="{ active: matchConfig.regex }"
              @click="toggleMatchConfig('regex')"
              title="正则表达式匹配 (Alt+R)"
            />
          </template>
        </el-input>
      </div>

      <!-- 替换输入 -->
      <div class="input-group">
        <span class="input-label">替换为:</span>
        <el-input
          v-model="replaceValue"
          placeholder="输入替换后的内容"
          class="replace-input"
        >
          <template #suffix>
            <!-- 替换图标（无button包裹） -->
            <IconReplace
              class="action-icon"
              :class="{ disabled: currentMatchIndex === -1 }"
              @click="replaceCurrent"
              title="替换当前匹配项"
            />
            <IconReplaceAll
              class="action-icon"
              :class="{ disabled: matchCount === 0 }"
              @click="replaceAll"
              title="替换所有匹配项"
            />
          </template>
        </el-input>
      </div>

      <!-- 导航图标（无button包裹） -->
      <div class="nav-icons">
        <IconPrev
          class="nav-icon"
          :class="{ disabled: currentMatchIndex === -1 }"
          @click="findPrev"
          title="上一个匹配项"
        />
        <IconNext
          class="nav-icon"
          :class="{ disabled: currentMatchIndex === -1 }"
          @click="findNext"
          title="下一个匹配项"
        />
      </div>

      <!-- 匹配规则提示 -->
      <div v-if="searchValue" class="match-tip">
        匹配规则:
        <span v-if="matchConfig.caseSensitive">大小写敏感 </span>
        <span v-if="matchConfig.regex">正则匹配 </span>
        <span v-if="matchConfig.wholeWord">全字匹配</span>
        <span v-else>默认（大小写不敏感）</span>
      </div>
    </div>

    <!-- 文件内容展示 -->
    <div class="file-content-container">
      <div class="file-header">
        <span class="file-icon">📄</span>
        <span class="file-name">{{ currentFile.name }}</span>
        <span class="file-path">{{ currentFile.path }}</span>
      </div>
      <div class="file-content">
        <div
          v-for="(line, lineNum) in highlightedContent"
          :key="lineNum"
          class="code-line"
          :class="{ 'active-line': lineNum === activeLine }"
        >
          <span class="line-number">{{ lineNum + 1 }}</span>
          <span v-html="line"></span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { useFindReplaceStore } from "@/stores/StoreFindReplace";
import IconMatchCase from "@/icons/IconMatchCase.vue";
import IconMatchWholeWord from "@/icons/IconMatchWholeWord.vue";
import IconMatchRegex from "@/icons/IconMatchRegex.vue";
import IconReplace from "@/icons/IconReplace.vue";
import IconReplaceAll from "@/icons/IconReplaceAll.vue";
import IconPrev from "@/icons/IconArrowUp.vue";
import IconNext from "@/icons/IconArrowDown.vue";

const findStore = useFindReplaceStore();

const {
  currentFile,
  searchValue,
  replaceValue,
  matchConfig,
  matchCount,
  currentMatchIndex,
  activeLine,
  highlightedContent,
  toggleMatchConfig,
  findNext,
  findPrev,
  replaceCurrent,
  replaceAll,
  handleSearch,
} = findStore;

const showFindReplace = ref(false);
// 监听快捷键事件
onMounted(() => {
  window.channel?.onShortcut("show-find-replace", () => {
    showFindReplace.value = true;
  });

  window.channel?.onShortcut("save-document", () => {
    saveDocument();
  });
});

// 注册自定义快捷键
const registerCustomShortcut = async () => {
  const success = await window.channel?.registerShortcut(
    "Ctrl+Shift+N",
    "new-document"
  );

  if (success) {
    window.channel.onShortcut("new-document", () => {
      console.log("新建文档");
    });
  }
};

findStore.findAllMatches();
</script>

<style scoped>
/* 核心样式 */
.search-replace-panel {
  position: fixed;
  top: 20px;
  right: 20px;
  width: 500px;
  background-color: #1e1e1e;
  border-radius: 4px;
  padding: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
  z-index: 1000;
  color: #fff;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

/* 输入区域 */
.input-group {
  margin-bottom: 8px;
}
.input-label {
  font-size: 11px;
  color: #b4b4b4;
  margin-bottom: 2px;
  display: inline-block;
  width: 50px;
}
.search-input,
.replace-input {
  --el-input-bg-color: #3c3c3c;
  --el-input-text-color: #fff;
  --el-input-placeholder-color: #b4b4b4;
  --el-input-border: none;
  height: 28px;
  font-size: 13px;
  width: calc(100% - 55px);
  display: inline-block;
}
.search-input :deep(.el-input__wrapper),
.replace-input :deep(.el-input__wrapper) {
  border: none !important;
  box-shadow: none !important;
  background-color: #3c3c3c !important;
}

/* 匹配数量 */
.match-count {
  font-size: 12px;
  color: #b4b4b4;
  margin-right: 8px;
  line-height: 28px;
}

/* 通用图标样式 */
.match-icon,
.action-icon,
.nav-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 2px;
  margin-right: 2px;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #ccc;
}
.match-icon:hover,
.action-icon:hover,
.nav-icon:hover {
  background-color: #484848;
  color: #fff;
}
.match-icon.active {
  background-color: #094771;
  color: #fff;
}

/* 禁用状态图标 */
.action-icon.disabled,
.nav-icon.disabled {
  color: #666;
  cursor: not-allowed;
  background-color: transparent !important;
}

/* 导航图标容器 */
.nav-icons {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

/* 匹配提示 */
.match-tip {
  font-size: 11px;
  color: #b4b4b4;
  margin-top: 6px;
  padding-left: 2px;
}

/* 文件内容区域 */
.file-content-container {
  border-top: 1px solid #3c3c3c;
  padding-top: 12px;
  max-height: 400px;
  overflow-y: auto;
}
.file-header {
  margin-bottom: 8px;
  font-size: 13px;
}
.file-icon {
  margin-right: 6px;
}
.file-name {
  color: #fff;
  font-weight: 500;
  margin-right: 8px;
}
.file-path {
  color: #b4b4b4;
  font-size: 12px;
}

/* 代码行样式 */
.file-content {
  font-family: Consolas, Monaco, "Courier New", monospace;
  font-size: 13px;
  line-height: 1.4;
}
.code-line {
  padding: 1px 4px;
  white-space: pre;
}
.code-line:hover {
  background-color: #2a2a2a;
}
.active-line {
  background-color: #094771 !important;
}
.line-number {
  display: inline-block;
  width: 40px;
  color: #888;
  text-align: right;
  padding-right: 8px;
  user-select: none;
}

/* 高亮样式 */
.highlight {
  background-color: #ffff0040;
  color: #000;
  border-radius: 1px;
}
.highlight-current {
  background-color: #ff9d00;
  color: #000;
  border-radius: 1px;
}

/* 滚动条优化 */
.file-content-container::-webkit-scrollbar {
  width: 8px;
}
.file-content-container::-webkit-scrollbar-track {
  background: #2a2a2a;
}
.file-content-container::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 4px;
}
</style>
