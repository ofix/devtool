<template>
  <div class="vscode-search-container">
    <div class="search-input-wrapper">
      <el-input
        v-model="searchValue"
        placeholder="搜索"
        class="vscode-input"
        @input="handleSearch"
      >
        <template #suffix>
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

      <el-input
        v-model="searchValue"
        placeholder=""
        class="vscode-input"
        @input="handleSearch"
      >
        <template #suffix>
          <IconOpenFiles
            class="match-icon"
            :class="{ active: matchConfig.caseSensitive }"
            @click="toggleMatchConfig('caseSensitive')"
            title="大小写敏感匹配 (Alt+C)"
          />
        </template>
      </el-input>
      <div class="input-label">包含文件</div>
      <el-input
        v-model="searchValue"
        placeholder=""
        class="vscode-input"
        @input="handleIncludeFiles"
      >
        <template #suffix>
          <IconOpenFiles
            class="match-icon"
            :class="{ active: matchConfig.caseSensitive }"
            @click="toggleMatchConfig('caseSensitive')"
            title="大小写敏感匹配 (Alt+C)"
          />
        </template>
      </el-input>
      <div class="input-label">排除文件</div>
      <el-input
        v-model="searchValue"
        placeholder=""
        class="vscode-input"
        @input="handleExcludeFiles"
      >
        <template #suffix>
          <IconExcludeFiles
            class="match-icon"
            :class="{ active: matchConfig.caseSensitive }"
            @click="toggleMatchConfig('caseSensitive')"
            title="大小写敏感匹配 (Alt+C)"
          />
        </template>
      </el-input>

      <!-- 匹配结果提示 -->
      <div v-if="searchValue" class="search-result-tip">
        匹配规则：
        <span v-if="matchConfig.caseSensitive">大小写敏感 </span>
        <span v-if="matchConfig.regex">正则匹配 </span>
        <span v-if="matchConfig.wholeWord">全字匹配</span>
        <span v-else>默认（大小写不敏感）</span>
      </div>
    </div>

    <!-- 模拟搜索结果列表 -->
    <div v-if="filteredFiles.length" class="search-result-list">
      <div class="result-title">匹配结果 ({{ filteredFiles.length }})</div>
      <el-list border :data="filteredFiles" class="file-list">
        <el-list-item v-for="file in filteredFiles" :key="file.path">
          <span class="file-icon">📄</span>
          <span class="file-name">{{ file.name }}</span>
          <span class="file-path">{{ file.path }}</span>
        </el-list-item>
      </el-list>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from "vue";
import IconMatchCase from "@/icons/IconMatchCase.vue";
import IconMatchRegex from "@/icons/IconMatchRegex.vue";
import IconMatchWholeWord from "@/icons/IconMatchWholeWord.vue";
import IconOpenFiles from "@/icons/IconOpenFiles.vue";
import IconExcludeFiles from "@/icons/IconExcludeFiles.vue";

// 搜索输入值
const searchValue = ref("");

// 匹配配置
const matchConfig = reactive({
  caseSensitive: false,
  regex: false,
  wholeWord: false,
});

// 模拟文件列表
const fileList = ref([
  { name: "App.vue", path: "/src/App.vue" },
  { name: "index.js", path: "/src/index.js" },
  { name: "FileTree.vue", path: "/src/components/FileTree.vue" },
  { name: "config.json", path: "/src/config.json" },
  { name: "README.md", path: "/README.md" },
  { name: "test.js", path: "/src/test/test.js" },
  { name: "Test.vue", path: "/src/components/Test.vue" },
]);

// 切换匹配配置
const toggleMatchConfig = (key) => {
  matchConfig[key] = !matchConfig[key];
  handleSearch();
};

// 过滤文件列表
const filteredFiles = computed(() => {
  if (!searchValue.value) return [];
  const searchStr = matchConfig.caseSensitive
    ? searchValue.value
    : searchValue.value.toLowerCase();

  return fileList.value.filter((file) => {
    const fileName = matchConfig.caseSensitive
      ? file.name
      : file.name.toLowerCase();
    const filePath = matchConfig.caseSensitive
      ? file.path
      : file.path.toLowerCase();

    if (matchConfig.regex) {
      try {
        return (
          new RegExp(searchStr, matchConfig.caseSensitive ? "" : "i").test(
            fileName
          ) ||
          new RegExp(searchStr, matchConfig.caseSensitive ? "" : "i").test(
            filePath
          )
        );
      } catch (e) {
        return fileName.includes(searchStr) || filePath.includes(searchStr);
      }
    }
    if (matchConfig.wholeWord) {
      const regex = new RegExp(
        `\\b${searchStr}\\b`,
        matchConfig.caseSensitive ? "" : "i"
      );
      return regex.test(fileName) || regex.test(filePath);
    }
    return fileName.includes(searchStr) || filePath.includes(searchStr);
  });
});

// 搜索处理
const handleSearch = () => {
  console.log("搜索配置：", matchConfig, "关键词：", searchValue.value);
};

function handleIncludeFiles(value) {
  console.log("包含文件：", value);
}

function handleExcludeFiles(value) {
  console.log("排除文件：", value);
}
</script>

<style scoped>
.vscode-search-container {
  width: calc(100% - 4px);
  max-width: 600px;
  padding: 4px;
  background-color: #1e1e1e;
  border-radius: 4px;
}

.vscode-input {
  --el-input-bg-color: #3c3c3c;
  --el-input-text-color: #ffffff;
  --el-input-placeholder-color: #b4b4b4;
  --el-input-border-radius: 2px;
  --el-input-border: none;
  --el-input-hover-border: none;
  --el-input-focus-border: none;
  --el-input-focus-box-shadow: none;
  padding-left: 2px;
  height: 28px;
  font-size: 13px;
  margin-bottom: 6px;
}

/* 强制移除输入框所有边框 */
.vscode-input :deep(.el-input__wrapper) {
  border: none !important;
  box-shadow: none !important;
  outline: none !important;
  background-color: #3c3c3c !important; /* 双重兜底背景色 */
}

.vscode-input :deep(.el-input__suffix) {
  color: #cccccc;
  display: flex;
  align-items: center;
  justify-content: flex-end; /* 按钮组整体右对齐 */
  margin-right: -10px;
  padding: 0; /* 移除默认内边距，避免偏移 */
}

.match-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 2px;
  margin-right: 2px;
  border-radius: 2px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  color: #cccccc;
}

.match-icon:hover {
  background-color: #484848;
}

.match-icon.active {
  background-color: #094771;
  color: #ffffff;
}

.match-icon :deep(svg) {
  fill: currentColor !important;
  width: 14px !important;
  height: 14px !important;
}

.search-result-tip {
  font-size: 12px;
  color: #b4b4b4;
  margin-top: 6px;
  padding-left: 4px;
}

.input-label {
  font-size: 10px;
  margin-bottom: 2px;
  margin-left: 2px;
}

.search-result-list {
  margin-top: 12px;
}
.result-title {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
  color: #ffffff;
}
.file-list {
  --el-list-item-hover-bg-color: #2a2a2a;
  --el-list-text-color: #ffffff;
  --el-list-border-color: #3c3c3c;
  font-size: 13px;
}
.file-icon {
  margin-right: 6px;
  font-size: 14px;
}
.file-name {
  font-weight: 400;
  color: #ffffff;
  margin-right: 8px;
}
.file-path {
  font-size: 12px;
  color: #b4b4b4;
}
</style>
