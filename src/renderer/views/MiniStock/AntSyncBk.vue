<template>
  <el-container>
    <el-header class="header">
      <!-- 顶部概览 - 只在左侧菜单选中"板块"时显示 -->
      <div class="overview">
        <div
          v-for="item in overviewItems"
          :key="item.key"
          class="overview-item"
          :class="{ active: currentBkType === item.key }"
          :style="{ backgroundColor: getOverviewBgColor(item.key) }"
          @click="handleOverviewClick(item.key)"
        >
          <div class="overview-name">{{ item.name }}</div>
          <div class="overview-count">{{ item.count }}</div>
        </div>
      </div>

      <!-- 搜索和同步区域 - 只在板块菜单显示 -->
      <div class="action-bar">
        <el-input
          v-model="searchText"
          :placeholder="`请输入${currentBkTypeName}名称或代码`"
          style="width: 300px"
          clearable
          @keyup.enter="handleSearch"
        >
          <template #prefix>
            <!-- <el-icon><Search /></el-icon> -->
          </template>
        </el-input>
        <el-button type="primary" @click="handleSync" :loading="syncLoading">
          同步
        </el-button>
        <div class="sync-time" v-if="lastSyncTime">
          上次同步时间: {{ lastSyncTime }}
        </div>
      </div>
    </el-header>

    <el-main class="main-content">
      <el-table
        ref="tableRef"
        :data="currentPageData"
        stripe
        style="width: 100%"
        :row-class-name="getRowClassName"
        v-loading="tableLoading"
        @expand-change="handleExpandChange"
      >
        <!-- 展开行显示成分股 -->
        <el-table-column type="expand" width="1" style="width: 1px">
          <template #default="{ row }">
            <div class="shares-container">
              <div class="shares-list">
                <div
                  v-for="share in row.shares"
                  :key="share.code"
                  class="share-item"
                  :class="{
                    'share-add': share._flag == 1,
                    'share-delete': share._flag == -1,
                    'share-none': share._flag == 0,
                  }"
                >
                  {{ share.name }} ({{ share.code }})
                </div>
                <div v-if="!row.shares.length" class="no-data">
                  暂无成分股数据
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column type="selection" min-width="5%" />
        <el-table-column prop="name" label="板块名称" min-width="10%" />
        <el-table-column
          prop="count"
          label="成分股数量"
          sortable
          min-width="15%"
        />
        <el-table-column prop="code" label="板块代码" min-width="10%" />
        <el-table-column prop="pinyin" label="拼音缩写" min-width="10%" />
        <el-table-column prop="syncStatus" label="同步状态" min-width="16%">
          <template #default="{ row }">
            <div class="shares-stats" v-if="row.shares && row.shares.length">
              <el-tag type="success" size="small" v-if="getSharesChangeCount(row.shares, 1)>0"
                >新增:{{ getSharesChangeCount(row.shares, 1) }}</el-tag
              >
              <el-tag type="danger" size="small" v-if="getSharesChangeCount(row.shares, -1)>0"
                >删除:{{ getSharesChangeCount(row.shares, -1) }}</el-tag
              >
              <el-tag type="info" size="small"
                >不变:{{ getSharesChangeCount(row.shares, 0) }}</el-tag
              >
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="syncTime" label="同步时间" min-width="14%" />
        <el-table-column label="操作" fixed="right" width="160">
          <template #default="{ row }">
            <el-button size="small" @click="toggleExpand(row)">{{
              expandedRows.indexOf(row.code) != -1 ? "收起" : "成分股"
            }}</el-button>

            <el-button
              size="small"
              @click="handleSyncSingle(row)"
              :loading="row.syncLoading"
              :disabled="!!searchText"
            >
              {{ row.syncLoading ? "同步中" : "同步" }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <!-- 分页 -->
      <div class="pagination">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[50, 100, 200]"
          :total="filteredData.length"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-main>
  </el-container>
</template>
<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { ElMessage } from "element-plus";

// 添加表格 ref
const tableRef = ref(null);
const currentBkType = ref("concept"); // 顶部概览选中项：concept, region, industry, index, etf
const searchText = ref("");
const syncLoading = ref(false);
const tableLoading = ref(false);
const lastSyncTime = ref("");
const currentPage = ref(1);
const pageSize = ref(20);
const expandedRows = ref([]); // ✅ 改为数组，存储展开行的 code
const sharesData = ref({});
const bkOverview = ref({
  concept: 0,
  region: 0,
  industry: 0,
});

// 板块数据存储 - 按类型分类
const bkData = ref({
  concept: [], // 概念
  region: [], // 地域
  industry: [], // 行业
  index: [], // 指数（预留）
  etf: [], // ETF（预留）
});

// 不同板块类型的背景色配置
const bkTypeColors = {
  concept: { bg: "#e8f4fd", border: "#91caff", active: "#409eff" }, // 概念 - 蓝色系
  region: { bg: "#f0f9eb", border: "#b3e19d", active: "#67c23a" }, // 地域 - 绿色系
  industry: { bg: "#fef0e6", border: "#ffc069", active: "#e6a23c" }, // 行业 - 橙色系
  index: { bg: "#f4e6fe", border: "#d9b4ff", active: "#a855f7" }, // 指数 - 紫色系
  etf: { bg: "#ffe6f0", border: "#ffb3d9", active: "#f472b6" }, // ETF - 粉色系
};

// 获取概览项背景色
const getOverviewBgColor = (key) => {
  const colors = bkTypeColors[key];
  if (currentBkType.value === key) {
    return colors.active;
  }
  return colors.bg;
};

// 顶部概览项配置
const overviewItems = computed(() => [
  { key: "concept", name: "概念", count: bkOverview.value.concept },
  { key: "region", name: "地域", count: bkOverview.value.region },
  { key: "industry", name: "行业", count: bkOverview.value.industry },
  { key: "index", name: "指数", count: 0 },
  { key: "etf", name: "ETF", count: 0 },
]);

// 当前板块类型名称
const currentBkTypeName = computed(() => {
  const names = {
    concept: "概念",
    region: "地域",
    industry: "行业",
    index: "指数",
    etf: "ETF",
  };
  return names[currentBkType.value] || "板块";
});

// 当前板块类型的样式
const currentBkTypeStyle = computed(() => {
  return bkTypeColors[currentBkType.value] || bkTypeColors.concept;
});

// 过滤后的数据（基于当前选中的板块类型和搜索文本）
const filteredData = computed(() => {
  // 获取当前选中类型的数据
  let data = bkData.value[currentBkType.value] || [];

  // 根据搜索文本过滤
  if (searchText.value) {
    const searchLower = searchText.value.toLowerCase();
    data = data.filter(
      (item) =>
        item.name.toLowerCase().includes(searchLower) ||
        item.code.toLowerCase().includes(searchLower) ||
        (item.pinyin && item.pinyin.toLowerCase().includes(searchLower))
    );
  }

  return data;
});

// 当前页数据
const currentPageData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return filteredData.value.slice(start, end);
});

// 获取行样式类名
const getRowClassName = ({ row }) => {
  if (row._flag === 1) return "row-add";
  if (row._flag === -1) return "row-delete";
  return "";
};

// 获取成分股变化统计
const getSharesChangeCount = (shares, type) => {
  return shares.filter((s) => s._flag === type).length;
};

const toggleExpand = (row) => {
  const table = tableRef.value;
  if (table) {
    table.toggleRowExpansion(row);
  }

  // 使用 row.code 作为唯一标识
  const index = expandedRows.value.indexOf(row.code);
  if (index > -1) {
    expandedRows.value.splice(index, 1);
  } else {
    expandedRows.value.push(row.code);
  }
};

// 加载板块数据
const loadBkData = async () => {
  // 只加载当前选中的板块类型
  if (
    !currentBkType.value ||
    currentBkType.value === "index" ||
    currentBkType.value === "etf"
  ) {
    // 指数和ETF暂未实现
    return;
  }

  tableLoading.value = true;
  try {
    const overview = await window.channel.getBkOverview();
    const data = await window.channel.getBkList(currentBkType.value, "");

    for (let item of data) {
      for (let share of item.shares) {
        share._flag = 0;
      }
      console.log(item);
    }
    bkData.value[currentBkType.value] = data;
    bkOverview.value = overview;
    lastSyncTime.value = new Date().toLocaleString();
  } catch (error) {
    ElMessage.error("加载数据失败：" + error.message);
  } finally {
    tableLoading.value = false;
  }
};

// 同步所有板块（当前选中的类型）
const handleSync = async () => {
  if (currentBkType.value === "index" || currentBkType.value === "etf") {
    ElMessage.warning("指数和ETF功能开发中");
    return;
  }

  syncLoading.value = true;
  try {
    const data = await window.channel.syncBkList(currentBkType.value);
    bkData.value[currentBkType.value] = data;
    lastSyncTime.value = new Date().toLocaleString();
    ElMessage.success(`${currentBkTypeName.value}板块同步成功`);
  } catch (error) {
    ElMessage.error("同步失败：" + error.message);
  } finally {
    syncLoading.value = false;
  }
};

// 同步单个板块
const handleSyncSingle = async (row) => {
  if (searchText.value) {
    ElMessage.warning("搜索状态下无法同步单个板块，请清空搜索后重试");
    return;
  }

  row.syncLoading = true;
  try {
    const data = await window.channel.syncBkList(currentBkType.value);
    bkData.value[currentBkType.value] = data;
    lastSyncTime.value = new Date().toLocaleString();
    ElMessage.success(`板块 ${row.name} 同步成功`);
  } catch (error) {
    ElMessage.error("同步失败：" + error.message);
  } finally {
    row.syncLoading = false;
  }
};

// 处理表格展开/收起事件
const handleExpandChange = (row, expandedRowsData) => {
  // 如果当前行正在展开且还没有加载数据，则加载
  if (
    expandedRowsData.length > 0 &&
    expandedRowsData[expandedRowsData.length - 1] === row
  ) {
    if (!sharesData.value[row.code]) {
      //   loadShares(row);
    }
  }
};

// 同步成分股
const syncShares = async (row) => {
  row.sharesSyncLoading = true;
  try {
    const data = await window.channel.syncBkShares(
      currentBkType.value,
      row.code
    );
    sharesData.value[row.code] = data;
    ElMessage.success(`${row.name} 成分股同步成功`);
  } catch (error) {
    ElMessage.error("同步失败：" + error.message);
  } finally {
    row.sharesSyncLoading = false;
  }
};

// 搜索处理
const handleSearch = () => {
  currentPage.value = 1;
  // 搜索时清空展开的行
  expandedRows.value = [];
};

// 顶部概览点击 - 这是过滤的关键
const handleOverviewClick = (key) => {
  if (key === "index" || key === "etf") {
    ElMessage.info(`${key === "index" ? "指数" : "ETF"}功能开发中`);
    return;
  }

  currentBkType.value = key;
  currentPage.value = 1;
  searchText.value = ""; // 切换类型时清空搜索
  expandedRows.value = []; // 清空展开的行
  loadBkData(); // 重新加载数据
};

// 分页处理
const handleSizeChange = (val) => {
  pageSize.value = val;
  currentPage.value = 1;
};

const handleCurrentChange = (val) => {
  currentPage.value = val;
};

// 监听搜索文本变化，重置页码和展开行
watch(searchText, () => {
  currentPage.value = 1;
  expandedRows.value = [];
});

// 监听当前板块类型变化，重置页码
watch(currentBkType, () => {
  currentPage.value = 1;
  expandedRows.value = [];
});

// 初始化
onMounted(() => {
  loadBkData();
});
</script>

<style scoped>
.header {
  background-color: #fff;
  border-bottom: 1px solid #e6e6e6;
  padding: 20px;
  height: auto;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.overview {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.overview-item {
  flex: 1;
  min-width: 100px;
  padding: 15px;
  border-radius: 8px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
  color: #333;
}

.overview-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.overview-item.active {
  color: white !important;
}

.overview-name {
  font-size: 14px;
  margin-bottom: 8px;
}

.overview-count {
  font-size: 24px;
  font-weight: bold;
}

.overview-placeholder {
  width: 100%;
  padding: 15px;
  background-color: #f5f7fa;
  border-radius: 8px;
  text-align: center;
  color: #909399;
}

.action-bar {
  display: flex;
  gap: 15px;
  align-items: center;
  flex-wrap: wrap;
}

.sync-time {
  color: #909399;
  font-size: 12px;
  margin-left: auto;
}

.main-content {
  background-color: #f0f2f5;
  padding: 20px;
  overflow-y: auto;
}

.placeholder-content {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

.shares-container {
  padding: 10px;
  padding-left: 6%;
  background-color: #fafafa;
}

.shares-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid #e6e6e6;
}

.shares-stats {
  display: flex;
  gap: 10px;
}

.shares-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  max-height: 300px;
  overflow-y: auto;
}

.share-item {
  width: 160px;
  overflow: hidden;
  padding: 5px 12px;
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.3s;
  cursor: pointer;
}

.share-item:hover {
  transform: scale(1.05);
}

.share-add {
  background-color: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.share-delete {
  background-color: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.share-none {
  background-color: #f6f6f6;
  color: #4e4f50;
  border: 1px solid #dee2e6;
}

.no-data {
  text-align: center;
  color: #909399;
  padding: 20px;
  width: 100%;
}

.pagination {
  margin-top: 10px;
  margin-bottom: 40px;
  display: flex;
  justify-content: flex-end;
}

/* 表格行样式 - 基于变化类型 */
:deep(.row-add) {
  background-color: #d4edda !important;
}

:deep(.row-delete) {
  background-color: #f8d7da !important;
}

/* 为不同板块类型设置表格表头样式 */
:deep(.el-table__header-wrapper) {
  background-color: v-bind("currentBkTypeStyle.bg");
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* 添加一些动画效果 */
.share-item {
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
