<!-- src/components/FindReplace.vue -->
<template>
  <el-card title="查找替换" class="search-replace-card">
    <!-- 配置区 -->
    <el-form :model="options" inline @submit.prevent>
      <el-form-item label="查找内容">
        <el-input
          v-model="options.searchText"
          placeholder="输入要查找的内容"
          @input="handleSearchChange"
        />
      </el-form-item>
      <el-form-item label="替换为">
        <el-input
          v-model="options.replaceText"
          placeholder="输入替换后的内容"
        />
      </el-form-item>
      <el-form-item>
        <el-checkbox v-model="options.caseSensitive">区分大小写</el-checkbox>
      </el-form-item>
      <el-form-item>
        <el-checkbox v-model="options.useRegex">正则表达式</el-checkbox>
      </el-form-item>
      <el-form-item>
        <el-checkbox v-model="options.wholeWord">完整匹配</el-checkbox>
      </el-form-item>
      <el-form-item label="包含目录">
        <el-input v-model="options.includeDir" placeholder="如 /src" />
      </el-form-item>
      <el-form-item label="排除目录">
        <el-input
          v-model="excludeDirsStr"
          placeholder="多个目录用逗号分隔，如 /node_modules,/dist"
          @input="handleExcludeDirsChange"
        />
      </el-form-item>
    </el-form>

    <!-- 操作按钮 -->
    <el-button type="primary" @click="handleFind">查找</el-button>
    <el-button
      type="warning"
      @click="handleReplaceAll"
      :disabled="matchResults.length === 0"
      >全部替换</el-button
    >

    <!-- 匹配结果列表 -->
    <el-table
      :data="matchResults"
      border
      style="margin-top: 20px"
      v-loading="replaceStatus.isLoading"
    >
      <el-table-column prop="file.path" label="文件路径" min-width="300" />
      <el-table-column prop="lineNumber" label="行号" width="80" />
      <el-table-column prop="text" label="匹配内容" min-width="200" />
      <el-table-column label="操作" width="100">
        <template #default="scope">
          <el-button type="text" @click="handleReplaceSingle(scope.row)">
            替换
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 替换结果提示 -->
    <el-alert
      v-if="replaceStatus.replacedCount > 0"
      title="替换完成：共替换 {{ replaceStatus.replacedCount }} 处，涉及 {{ replaceStatus.affectedFiles.length }} 个文件"
      type="success"
      style="margin-top: 20px"
      show-icon
    />
  </el-card>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { ElMessage } from "element-plus";
import { useSearchReplaceStore } from "@/stores/StoreSearchReplace.js";
import {
  findMatches,
  replaceSingle,
  replaceAll,
  isPathIncluded,
} from "@/common/SearchReplace.js";

// 获取Pinia状态
const searchReplaceStore = useSearchReplaceStore();

// 响应式配置
const options = ref({ ...searchReplaceStore.findReplaceOptions });
const matchResults = ref(searchReplaceStore.matchResults);
const replaceStatus = ref({ ...searchReplaceStore.replaceStatus });

// 排除目录字符串（适配输入框）
const excludeDirsStr = computed({
  get: () => options.value.excludeDirs.join(","),
  set: () => {},
});

// 监听配置变化，同步到Pinia
watch(
  options,
  (newVal) => {
    searchReplaceStore.updateFindOptions(newVal);
  },
  { deep: true }
);

// 处理排除目录输入
const handleExcludeDirsChange = (val) => {
  options.value.excludeDirs = val
    .split(",")
    .map((dir) => dir.trim())
    .filter((dir) => dir);
};

// 查找内容变化时清空结果
const handleSearchChange = () => {
  searchReplaceStore.clearMatchResults();
  matchResults.value = [];
};

// 执行查找
const handleFind = () => {
  if (!options.value.searchText) {
    ElMessage.warning("请输入查找内容");
    return;
  }
  const results = findMatches(searchReplaceStore.virtualFiles, options.value);
  searchReplaceStore.matchResults = results;
  matchResults.value = results;
  ElMessage.info(`找到 ${results.length} 处匹配`);
};

// 单个替换
const handleReplaceSingle = (match) => {
  const updatedFile = replaceSingle(match, options.value.replaceText);
  // 更新Pinia中的文件列表
  searchReplaceStore.virtualFiles = searchReplaceStore.virtualFiles.map(
    (file) => (file.path === updatedFile.path ? updatedFile : file)
  );
  // 重新查找（刷新结果）
  handleFind();
  ElMessage.success("单个替换成功");
};

// 批量替换
const handleReplaceAll = async () => {
  replaceStatus.value.isLoading = true;
  searchReplaceStore.resetReplaceStatus();

  try {
    const result = replaceAll(searchReplaceStore.virtualFiles, options.value);
    // 更新Pinia状态
    searchReplaceStore.virtualFiles = result.updatedFiles;
    searchReplaceStore.replaceStatus = {
      replacedCount: result.replacedCount,
      affectedFiles: result.affectedFiles,
      isLoading: false,
    };
    replaceStatus.value = searchReplaceStore.replaceStatus;
    // 重新查找（刷新结果）
    handleFind();
    ElMessage.success("全部替换完成");
  } catch (error) {
    replaceStatus.value.isLoading = false;
    ElMessage.error(`替换失败：${error.message}`);
    console.error("批量替换出错：", error);
  }
};

// 初始化
watch(
  () => searchReplaceStore.matchResults,
  (newVal) => {
    matchResults.value = newVal;
  },
  { immediate: true }
);
</script>

<style scoped>
.search-replace-card {
  max-width: 1200px;
  margin: 20px auto;
  padding: 20px;
}
</style>
