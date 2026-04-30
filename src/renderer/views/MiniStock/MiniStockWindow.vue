<template>
  <div class="share-panel" @keydown="handleKeyDown" tabindex="0">
    <!-- 1×4 横向股票网格 -->
    <div class="grid-1x4">
      <div
        class="share-item"
        v-for="(share, idx) in displayList"
        :key="idx"
        :class="{ active: activeShareIndex === idx }"
      >
        <!-- 股票头部信息 -->
        <div class="share-header" v-if="share">
          <span class="code">{{ share.code }}</span>
          <span class="name">{{ share.name }}</span>
          <span class="price" :class="share.change >= 0 ? 'up' : 'down'">
            {{ (share.price || 0).toFixed(2) }}
          </span>
          <span class="change">
            {{ share.change >= 0 ? "+" : ""
            }}{{ (share.change || 0).toFixed(2) }} ({{
              (share.changePercent || 0).toFixed(2)
            }}%)
          </span>
          <el-button size="mini" @click="toggleType(share.code)">
            {{ chartTypes[share.code] === "kline" ? "分时" : "日K" }}
          </el-button>
        </div>

        <!-- 图表 -->
        <div class="chart" v-if="share">
          <KlineCtrl
            v-if="chartTypes[share.code] === 'kline'"
            :code="share.code"
            :market="share.market"
          />
          <MinuteKlineCtrl
            v-else
            :share="share"
            :data="minuteKlineData[share.code]"
          />
        </div>

        <!-- 空面板 -->
        <div class="empty" v-else>暂无股票</div>
      </div>
    </div>

    <!-- 按住 Tab 弹出左侧搜索面板 -->
    <SearchPanel
      class="search-popup"
      :initial-key="searchKeyword"
      @select-share="handleSelectShare"
      v-show="showSearchPanel"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import KlineCtrl from "./KlineCtrl.vue";
import MinuteKlineCtrl from "./MinuteKlineCtrl.vue";
import SearchPanel from "./SearchPanel.vue";

/////////////////// 常量配置 ///////////////////
const PAGE_SIZE = 4;
const REFRESH_INTERVAL = 5000;

/////////////////// 本地状态 ///////////////////
const watchList = ref([]); // 总观察列表
const currentPage = ref(0); // 当前页码
const displayList = ref([]); // 当前显示 4 只
const chartTypes = ref({}); // 每只股票独立图表类型
const currentShare = ref(null);

const showSearchPanel = ref(false);
const activeShareIndex = ref(-1); // 当前选中的股票下标
const minuteKlineData = ref({}); // 分时数据
const klineData = ref({}); // K线数据

let refreshTimer = null;
// 传给子组件的触发按键（字母 或 *）
const searchKeyword = ref("");

/////////////////// 生命周期 ///////////////////
onMounted(async () => {
  await loadFavoriteStocks();
  updateDisplay();
  startAutoRefresh();
  window.addEventListener("keydown", handleGlobalKey);
});

onUnmounted(() => {
  clearInterval(refreshTimer);
  window.removeEventListener("keydown", handleGlobalKey);
});

// 全局键盘控制
function handleGlobalKey(e) {
  // 如果面板已经打开，按下Escape 键优先关闭搜索面板
  if (showSearchPanel.value && e.key == "Escape") {
    showSearchPanel.value = false;
    searchKeyword.value = "";
    return;
  }

  // 如果搜索面板没有打开，判断当前是否存在选中的股票，然后取消选中的股票
  if (activeShareIndex.value != -1 && e.key == "Escape") {
    activeShareIndex.value = -1;
    return;
  }

  if (e.ctrlKey || e.shiftKey) {
    // 如果按下了控制键，则不处理
    return;
  }

  const key = e.key;

  // 规则：只允许【字母 A-Z】 + 【*】 触发打开面板
  const isLetter = /^[a-zA-Z]$/.test(key);
  const isStar = key === "*";

  // 符合条件 → 打开面板
  if (isLetter || isStar) {
    showSearchPanel.value = true;
    if (searchKeyword.value == "") {
      searchKeyword.value = key;
    }
  }
}

// 关闭股票搜索面板
function closeSearchPanel() {
  showSearchPanel.value = false;
  searchKeyword.value = "";
}

// 选中股票
function handleSelectShare(share) {
  closeSearchPanel();
  currentShare.value = share; // 当前选中的股票
  console.log("选中股票：", share);
  // 获取当前选中股票的类别，
  // 找到选中股票在 displayList 里的索引 → 高亮边框
  const index = displayList.value.findIndex(
    (item) => item?.code === share.code
  );
  activeShareIndex.value = index;
}

// 初始化：加载自选股
async function loadFavoriteStocks() {
  const fav = await window.channel.favoriteShares();
  if (fav?.length) {
    watchList.value = fav;
  }
}

// 更新显示列表
function updateDisplay() {
  const start = currentPage.value * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  displayList.value = watchList.value.slice(start, end);

  // 自动补齐空面板，保持 4 个
  while (displayList.value.length < PAGE_SIZE) {
    displayList.value.push(null);
  }

  // 初始化图表类型
  displayList.value.forEach((s) => {
    if (s && !chartTypes.value[s.code]) chartTypes.value[s.code] = "minute";
  });
}

// 翻页
function nextPage() {
  const max = Math.ceil(watchList.value.length / PAGE_SIZE);
  if (currentPage.value < max - 1) {
    currentPage.value++;
    updateDisplay();
  }
}

function prevPage() {
  if (currentPage.value > 0) {
    currentPage.value--;
    updateDisplay();
  }
}

// 独立切换图表类型
function toggleType(code) {
  chartTypes.value[code] =
    chartTypes.value[code] === "kline" ? "minute" : "kline";
}

function handleKeyDown(e) {
  // 禁止浏览器默认行为
  if (e.ctrlKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
    e.preventDefault();
  }

  // Ctrl + 左/右 切换选中股票
  if (e.ctrlKey && e.key === "ArrowRight") {
    console.log("arrow right key down");
    if (activeShareIndex.value === -1) {
      // 无选中 → 选第一个
      activeShareIndex.value = 0;
    } else {
      // 有选中 → +1，到顶回到 0
      activeShareIndex.value = (activeShareIndex.value + 1) % 4;
    }
  }

  if (e.ctrlKey && e.key === "ArrowLeft") {
    if (activeShareIndex.value === -1) {
      // 无选中 → 选最后一个
      activeShareIndex.value = 3;
    } else {
      // 有选中 → -1，到底回到 3
      activeShareIndex.value = (activeShareIndex.value - 1 + 4) % 4;
    }
  }

  // 股票翻页逻辑
  if (e.ctrlKey && e.key === "ArrowUp") {
    e.preventDefault();
    prevPage();
  }

  if (e.ctrlKey && e.key === "ArrowDown") {
    e.preventDefault();
    nextPage();
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 自动刷新
async function startAutoRefresh() {
  // 先立即刷新一次
  await refreshRealTimeData();

  // 之后定时刷新
  refreshTimer = setInterval(async () => {
    if (isTradingTime()) {
      await refreshRealTimeData();
    }
  }, REFRESH_INTERVAL);
}

// 根据每只股票自己的K线类型拉取数据
async function refreshRealTimeData() {
  for (const share of displayList.value) {
    if (!share || !share.code) continue;

    // 获取当前股票自己的图表类型
    const type = chartTypes.value[share.code];

    let data = null;
    if (type === "minute") {
      // 分时图 → 拉分时数据
      // 👇 【关键修复】只传递纯数据对象，禁止传响应式/Vue对象
      const oneShare = {
        code: share.code,
        market: share.market,
        name: share.name,
      };
      data = await window.channel.getMinuteKlines(oneShare, 1);
      console.log(data);
      minuteKlineData.value[share.code] = data;
      await sleep(5000);
    } else if (type === "kline") {
      // 日K → 拉日K数据
      data = await window.channel.getKline(
        share.code,
        share.market,
        "day",
        "",
        ""
      );
      klineData.value[share.code] = data;
    }

    if (data) {
      Object.assign(share, data);
    }
  }
}

// 交易时间判断
function isTradingTime() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  return (h === 9 && m >= 30) || (h >= 10 && h <= 11) || (h >= 13 && h <= 14);
}
</script>

<style scoped>
.share-panel {
  width: 100%;
  height: 100vh;
  background: #111;
  color: #fff;
  position: relative;
}

/* 1×4 横向布局 */
.grid-1x4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  height: 100%;
  gap: 6px;
}

.share-item {
  background: #1a1a1a;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
}

/* 选中股票的高亮边框 */
.share-item.active {
  border: 1px solid #4dabf7;
  background: #222;
  box-shadow: 0 0 12px rgba(77, 171, 247, 0.3);
  transition: all 0.2s ease;
}

.share-header {
  display: flex;
  gap: 8px;
  font-size: 13px;
  margin-bottom: 4px;
  flex-shrink: 0;
}

.chart {
  flex: 1;
  min-height: 0;
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  height: 100%;
}

.up {
  color: #ff4444;
}
.down {
  color: #00c853;
}
</style>
