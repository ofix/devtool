<template>
  <div class="app-container">
    <el-container style="height: 100vh">
      <!-- 左侧菜单 -->
      <el-aside width="200px" class="sidebar">
        <el-menu
          :default-active="activeMenu"
          @select="handleMenuSelect"
          style="height: 100%"
        >
          <el-menu-item index="plate">
            <span>板块</span>
          </el-menu-item>
          <el-menu-item index="market">
            <span>行情</span>
          </el-menu-item>
          <el-menu-item index="finance">
            <span>财务</span>
          </el-menu-item>
        </el-menu>
      </el-aside>

      <!-- 右侧内容 -->
      <el-container>
        <el-header class="header">
          <!-- 顶部概览 - 只在左侧菜单选中"板块"时显示 -->
          <div class="overview" v-if="activeMenu === 'plate'">
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

          <!-- 非板块菜单的提示 -->
          <div class="overview" v-else>
            <div class="overview-placeholder">
              {{
                activeMenu === "market"
                  ? "行情数据开发中..."
                  : "财务数据开发中..."
              }}
            </div>
          </div>

          <!-- 搜索和同步区域 - 只在板块菜单显示 -->
          <div class="action-bar" v-if="activeMenu === 'plate'">
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
            <el-button
              type="primary"
              @click="handleSync"
              :loading="syncLoading"
            >
              同步
            </el-button>
            <div class="sync-time" v-if="lastSyncTime">
              上次同步时间: {{ lastSyncTime }}
            </div>
          </div>
        </el-header>

        <el-main class="main-content">
          <!-- 板块列表 - 只在板块菜单显示 -->
          <template v-if="activeMenu === 'plate'">
            <el-table
              :data="currentPageData"
              stripe
              style="width: 100%"
              :row-class-name="getRowClassName"
              v-loading="tableLoading"
              @expand-change="handleExpandChange"
            >
              <el-table-column type="selection" width="55" />
              <el-table-column prop="name" label="板块名称" width="150" />
              <el-table-column prop="code" label="板块代码" width="120" />
              <el-table-column prop="pinyin" label="拼音缩写" width="120" />
              <el-table-column prop="syncTime" label="同步时间" width="180" />
              <el-table-column label="操作" width="180" fixed="right">
                <template #default="{ row }">
                  <el-button
                    size="small"
                    @click="handleSyncSingle(row)"
                    :loading="row.syncLoading"
                    :disabled="!!searchText"
                  >
                    {{ row.syncLoading ? "同步中" : "同步" }}
                  </el-button>
                  <el-button
                    size="small"
                    type="info"
                    @click="toggleShares(row)"
                  >
                    {{ expandedRows[row.code] ? "收起" : "成分股" }}
                  </el-button>
                </template>
              </el-table-column>

              <!-- 展开行显示成分股 -->
              <el-table-column type="expand">
                <template #default="{ row }">
                  <div class="shares-container">
                    <div class="shares-header">
                      <span>成分股列表 - {{ row.name }} ({{ row.code }})</span>
                      <el-button
                        size="small"
                        @click="syncShares(row)"
                        :loading="row.sharesSyncLoading"
                      >
                        同步成分股
                      </el-button>
                    </div>
                    <div
                      class="shares-stats"
                      v-if="sharesData[row.code] && sharesData[row.code].length"
                    >
                      <el-tag type="success" size="small"
                        >新增:
                        {{ getSharesChangeCount(row.code, "add") }}</el-tag
                      >
                      <el-tag type="danger" size="small"
                        >删除:
                        {{ getSharesChangeCount(row.code, "delete") }}</el-tag
                      >
                      <el-tag type="info" size="small"
                        >不变:
                        {{ getSharesChangeCount(row.code, "none") }}</el-tag
                      >
                    </div>
                    <div class="shares-list">
                      <div
                        v-for="share in sharesData[row.code]"
                        :key="share.code"
                        class="share-item"
                        :class="{
                          'share-add': share._changeType === 'add',
                          'share-delete': share._changeType === 'delete',
                          'share-none': share._changeType === 'none',
                        }"
                      >
                        {{ share.name }} ({{ share.code }})
                      </div>
                      <div
                        v-if="
                          !sharesData[row.code] || !sharesData[row.code].length
                        "
                        class="no-data"
                      >
                        暂无成分股数据
                      </div>
                    </div>
                  </div>
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
          </template>

          <!-- 行情/财务占位内容 -->
          <div v-else class="placeholder-content">
            <el-empty
              :description="`${activeMenu === 'market' ? '行情' : '财务'}功能开发中...`"
            />
          </div>
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { ElMessage } from "element-plus";

// 响应式数据
const activeMenu = ref("plate"); // 左侧菜单选中项：plate, market, finance
const currentBkType = ref("concept"); // 顶部概览选中项：concept, region, industry, index, etf
const searchText = ref("");
const syncLoading = ref(false);
const tableLoading = ref(false);
const lastSyncTime = ref("");
const currentPage = ref(1);
const pageSize = ref(50);
const expandedRows = ref({});
const sharesData = ref({});

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
  { key: "concept", name: "概念", count: bkData.value.concept.length },
  { key: "region", name: "地域", count: bkData.value.region.length },
  { key: "industry", name: "行业", count: bkData.value.industry.length },
  { key: "index", name: "指数", count: bkData.value.index.length },
  { key: "etf", name: "ETF", count: bkData.value.etf.length },
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
  if (row._changeType === "add") return "row-add";
  if (row._changeType === "delete") return "row-delete";
  return "";
};

// 获取成分股变化统计
const getSharesChangeCount = (bkCode, type) => {
  const shares = sharesData.value[bkCode] || [];
  return shares.filter((s) => s._changeType === type).length;
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
    const data = await window.channel.getBkList(currentBkType.value, "");
    bkData.value[currentBkType.value] = data;
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
      loadShares(row);
    }
  }
};

// 切换成分股显示
const toggleShares = async (row) => {
  if (expandedRows.value[row.code]) {
    expandedRows.value[row.code] = false;
  } else {
    // 收起其他展开的行
    Object.keys(expandedRows.value).forEach((key) => {
      expandedRows.value[key] = false;
    });
    expandedRows.value[row.code] = true;
    if (!sharesData.value[row.code]) {
      await loadShares(row);
    }
  }
};

// 加载成分股
const loadShares = async (row) => {
  try {
    const data = await window.channel.getBkShares(row.code);
    sharesData.value[row.code] = data;
  } catch (error) {
    ElMessage.error("加载成分股失败：" + error.message);
  }
};

// 同步成分股
const syncShares = async (row) => {
  row.sharesSyncLoading = true;
  try {
    const data = await window.channel.syncBkShares(row.code);
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
  expandedRows.value = {};
};

// 左侧菜单选择
const handleMenuSelect = (index) => {
  activeMenu.value = index;

  // 切换菜单时重置状态
  if (index === "plate") {
    // 切换到板块，加载当前选中的板块类型数据
    currentBkType.value = "concept";
    searchText.value = "";
    currentPage.value = 1;
    expandedRows.value = {};
    loadBkData();
  } else {
    // 切换到行情或财务，清空板块相关数据
    searchText.value = "";
    currentPage.value = 1;
    expandedRows.value = {};
  }
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
  expandedRows.value = {}; // 清空展开的行
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
  expandedRows.value = {};
});

// 监听当前板块类型变化，重置页码
watch(currentBkType, () => {
  currentPage.value = 1;
  expandedRows.value = {};
});

// 初始化
onMounted(() => {
  loadBkData();
});
</script>

<style scoped>
.app-container {
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  background-color: #304156;
  color: #fff;
}

.sidebar :deep(.el-menu) {
  border-right: none;
  background-color: #304156;
}

.sidebar :deep(.el-menu-item) {
  color: #bfcbd9;
}

.sidebar :deep(.el-menu-item:hover) {
  color: #fff;
  background-color: #263445;
}

.sidebar :deep(.el-menu-item.is-active) {
  color: #409eff;
  background-color: #263445;
}

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
  padding: 20px;
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
  margin-bottom: 15px;
}

.shares-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  max-height: 300px;
  overflow-y: auto;
}

.share-item {
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
  background-color: #e9ecef;
  color: #495057;
  border: 1px solid #dee2e6;
}

.no-data {
  text-align: center;
  color: #909399;
  padding: 20px;
  width: 100%;
}

.pagination {
  margin-top: 20px;
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
