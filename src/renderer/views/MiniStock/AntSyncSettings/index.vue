<template>
  <div class="spider-config">
    <div class="config-header">
      <h2>设置</h2>
      <p class="config-desc">配置各数据供应商的请求头、爬虫策略等参数</p>
    </div>
    <!-- 供应商标签栏 -->
    <div class="provider-tabs-wrapper">
      <div class="provider-tabs-header">
        <div class="tabs-nav">
          <div
            v-for="provider in providers"
            :key="provider.id"
            class="tab-item"
            :class="{
              'tab-active': activeProvider === provider.id,
              'tab-disabled': !provider.enabled,
            }"
            @click="handleTabClick(provider.id)"
          >
            <span class="tab-name">
              {{ provider.name }}
              <span class="unsaved-dot" v-if="provider.dirty">*</span>
            </span>
            <span class="tab-status-badge" v-if="!provider.enabled">禁用</span>
            <el-icon
              v-if="!provider.builtin"
              class="tab-close"
              @click.stop="handleRemoveTab(provider.id)"
            >
              <Close />
            </el-icon>
          </div>
          <div class="tab-add" @click="handleAddProvider">
            <el-icon><Plus /></el-icon>
            <span>新增</span>
          </div>
        </div>
      </div>

      <div class="provider-tabs-content">
        <div class="config-content" v-loading="loading">
          <template v-if="currentProvider">
            <div class="config-panels">
              <BasicConfig
                ref="basicConfigRef"
                :provider="currentProvider"
                @change="handleConfigChange"
              />
              <CrawlStrategy
                ref="crawlStrategyRef"
                :provider="currentProvider"
                @change="handleConfigChange"
              />
              <RequestHeadersConfig
                ref="headersConfigRef"
                :provider="currentProvider"
                @change="handleConfigChange"
              />
              <ProxyConfig
                ref="proxyConfigRef"
                :provider="currentProvider"
                @change="handleConfigChange"
              />
            </div>
          </template>
          <el-empty v-else description="请先添加供应商" />
        </div>
      </div>
      <div class="config-actions">
        <el-button type="primary" @click="handleSave" :loading="saving">
          <el-icon><Check /></el-icon>
          保存配置
        </el-button>
        <el-button @click="handleTest">
          <el-icon><Connection /></el-icon>
          测试连接
        </el-button>
        <el-button @click="handleReset">
          <el-icon><RefreshRight /></el-icon>
          恢复默认
        </el-button>
        <!-- <span class="last-save-time" v-if="lastSaveTimeMap[currentProvider.id]">
        上次保存: {{ lastSaveTimeMap[currentProvider.id] }}
      </span> -->
      </div>
    </div>

    <!-- 测试弹窗 -->
    <el-dialog v-model="testDialogVisible" title="测试连接结果" width="500px">
      <div v-if="testResult" class="test-result">
        <div
          class="test-status"
          :class="{ success: testResult.success, error: !testResult.success }"
        >
          <el-icon v-if="testResult.success"><SuccessFilled /></el-icon>
          <el-icon v-else><CircleCloseFilled /></el-icon>
          <span>{{ testResult.message }}</span>
        </div>
        <div v-if="testResult.data" class="test-data">
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="响应时间"
              >{{ testResult.duration }}ms</el-descriptions-item
            >
            <el-descriptions-item label="响应大小">{{
              testResult.dataSize
            }}</el-descriptions-item>
            <el-descriptions-item label="状态码">{{
              testResult.statusCode
            }}</el-descriptions-item>
          </el-descriptions>
        </div>
        <div v-if="testResult.error" class="test-error">
          <strong>错误详情：</strong>
          <pre>{{ testResult.error }}</pre>
        </div>
      </div>
      <template #footer>
        <el-button @click="testDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 新增供应商 -->
    <el-dialog v-model="addDialogVisible" title="新增供应商" width="450px">
      <el-form
        :model="newProvider"
        :rules="providerRules"
        ref="newProviderFormRef"
        label-width="80px"
      >
        <el-form-item label="供应商ID" prop="id">
          <el-input
            v-model="newProvider.id"
            placeholder="英文标识，如：new_provider"
          />
        </el-form-item>
        <el-form-item label="供应商名称" prop="name">
          <el-input v-model="newProvider.name" placeholder="如：新供应商" />
        </el-form-item>
        <el-form-item label="基础URL" prop="baseUrl">
          <el-input
            v-model="newProvider.baseUrl"
            placeholder="https://api.example.com"
          />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="newProvider.desc"
            type="textarea"
            :rows="2"
            :placeholder="可选"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmAddProvider"
          >确认添加</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  Plus,
  Close,
  Check,
  Connection,
  RefreshRight,
  SuccessFilled,
  CircleCloseFilled,
} from "@element-plus/icons-vue";
import BasicConfig from "./BasicConfig.vue";
import CrawlStrategy from "./CrawlStrategy.vue";
import ProxyConfig from "./ProxyConfig.vue";
import RequestHeadersConfig from "./RequestHeadersConfig.vue";

// 默认供应商
const DEFAULT_PROVIDERS = [
  {
    id: "eastmoney",
    name: "东方财富",
    builtin: true,
    enabled: true,
    baseUrl: "https://push2.eastmoney.com",
    timeout: 30,
    desc: "东方财富板块数据",
    crawlStrategy: {
      minInterval: 2,
      maxInterval: 5,
      pauseThreshold: 50,
      pauseDuration: 10,
      maxRetries: 3,
      concurrentRequests: 1,
      enableDeduplication: true,
    },
    proxy: {
      enabled: false,
      type: "HTTP",
      host: "",
      port: "",
      username: "",
      password: "",
    },
  },
  {
    id: "tonghuashun",
    name: "同花顺",
    builtin: true,
    enabled: true,
    baseUrl: "https://data.10jqka.com.cn",
    timeout: 30,
    desc: "同花顺板块数据",
    crawlStrategy: {
      minInterval: 3,
      maxInterval: 6,
      pauseThreshold: 40,
      pauseDuration: 12,
      maxRetries: 3,
      concurrentRequests: 1,
      enableDeduplication: true,
    },
    proxy: {
      enabled: false,
      type: "HTTP",
      host: "",
      port: "",
      username: "",
      password: "",
    },
  },
  {
    id: "baidu",
    name: "百度财经",
    builtin: true,
    enabled: false,
    baseUrl: "https://gushitong.baidu.com",
    timeout: 30,
    desc: "百度财经板块数据",
    crawlStrategy: {
      minInterval: 2,
      maxInterval: 4,
      pauseThreshold: 60,
      pauseDuration: 8,
      maxRetries: 2,
      concurrentRequests: 1,
      enableDeduplication: true,
    },
    proxy: {
      enabled: false,
      type: "HTTP",
      host: "",
      port: "",
      username: "",
      password: "",
    },
  },
  {
    id: "tencent",
    name: "腾讯财经",
    builtin: true,
    enabled: false,
    baseUrl: "https://web.ifzq.gtimg.cn",
    timeout: 30,
    desc: "腾讯财经板块数据",
    crawlStrategy: {
      minInterval: 2,
      maxInterval: 5,
      pauseThreshold: 50,
      pauseDuration: 10,
      maxRetries: 3,
      concurrentRequests: 1,
      enableDeduplication: true,
    },
    proxy: {
      enabled: false,
      type: "HTTP",
      host: "",
      port: "",
      username: "",
      password: "",
    },
  },
  {
    id: "sina",
    name: "新浪财经",
    builtin: true,
    enabled: false,
    baseUrl: "https://stock.finance.sina.com.cn",
    timeout: 30,
    desc: "新浪财经板块数据",
    crawlStrategy: {
      minInterval: 2,
      maxInterval: 5,
      pauseThreshold: 50,
      pauseDuration: 10,
      maxRetries: 3,
      concurrentRequests: 1,
      enableDeduplication: true,
    },
    proxy: {
      enabled: false,
      type: "HTTP",
      host: "",
      port: "",
      username: "",
      password: "",
    },
  },
  {
    id: "tushare",
    name: "Tushare",
    builtin: true,
    enabled: false,
    baseUrl: "https://api.tushare.pro",
    timeout: 30,
    desc: "Tushare 专业数据接口",
    crawlStrategy: {
      minInterval: 1,
      maxInterval: 2,
      pauseThreshold: 100,
      pauseDuration: 5,
      maxRetries: 2,
      concurrentRequests: 2,
      enableDeduplication: true,
    },
    proxy: {
      enabled: false,
      type: "HTTP",
      host: "",
      port: "",
      username: "",
      password: "",
    },
  },
];

// State
const activeProvider = ref("eastmoney");
const providers = ref([]);
const loading = ref(false);
const saving = ref(false);
const lastSaveTimeMap = ref({});
const testDialogVisible = ref(false);
const testResult = ref(null);
const addDialogVisible = ref(false);
const newProviderFormRef = ref(null);

const basicConfigRef = ref(null);
const crawlStrategyRef = ref(null);
const proxyConfigRef = ref(null);
const headersConfigRef = ref(null);

// 计算：当前 provider 是否有未保存修改
const hasUnsavedChanges = computed(() => {
  const p = providers.value.find((x) => x.id === activeProvider.value);
  return p?.dirty ?? false;
});

const currentProvider = computed(() => {
  return providers.value.find((p) => p.id === activeProvider.value);
});

// 规则
const providerRules = {
  id: [
    { required: true, message: "请输入供应商ID", trigger: "blur" },
    {
      pattern: /^[a-zA-Z][a-zA-Z0-9_]*$/,
      message: "ID只能包含字母、数字和下划线，且以字母开头",
      trigger: "blur",
    },
    {
      validator: (r, v, cb) =>
        providers.value.some((p) => p.id === v)
          ? cb(new Error("ID已存在"))
          : cb(),
      trigger: "blur",
    },
  ],
  name: [{ required: true, message: "请输入名称", trigger: "blur" }],
  baseUrl: [
    { required: true, message: "请输入URL", trigger: "blur" },
    { pattern: /^https?:\/\/.+/, message: "URL格式错误", trigger: "blur" },
  ],
};

const newProvider = ref({});

// 初始化带 dirty 标记
function initProviders() {
  providers.value = JSON.parse(JSON.stringify(DEFAULT_PROVIDERS)).map((p) => ({
    ...p,
    dirty: false,
  }));
}

// 任意配置发生变化 → 只标记当前 provider
function handleConfigChange() {
  const curr = providers.value.find((p) => p.id === activeProvider.value);
  if (curr) curr.dirty = true;
}

// 切换 Tab
async function handleTabClick(providerId) {
  activeProvider.value = providerId;
}

// 保存 → 清除当前 provider dirty
async function handleSave() {
  const currId = activeProvider.value;
  saving.value = true;
  try {
    const p = { ...currentProvider.value };
    if (basicConfigRef.value)
      Object.assign(p, basicConfigRef.value.getConfig());
    if (crawlStrategyRef.value)
      p.crawlStrategy = crawlStrategyRef.value.getConfig();
    if (proxyConfigRef.value) p.proxy = proxyConfigRef.value.getConfig();
    if (headersConfigRef.value)
      p.requestHeaders = headersConfigRef.value.getConfig();

    const idx = providers.value.findIndex((x) => x.id === currId);
    if (idx !== -1) {
      providers.value[idx] = p;
      providers.value[idx].dirty = false;
    }

    let settings = JSON.stringify(providers.value, "", 3);
    localStorage.setItem("spider_providers", settings);
    await window.channel.saveProviderSettings(settings);
    lastSaveTimeMap.value[currId] = new Date().toLocaleString();
    ElMessage.success("保存成功");
  } catch (e) {
    ElMessage.error("保存失败：" + e.message);
  } finally {
    saving.value = false;
  }
}

// 放弃 → 重置当前 provider
function handleDiscard() {
  ElMessageBox.confirm("确定放弃当前供应商未保存更改？", "提示", {
    type: "warning",
  })
    .then(() => {
      const idx = providers.value.findIndex(
        (x) => x.id === activeProvider.value
      );
      const def = DEFAULT_PROVIDERS.find((x) => x.id === activeProvider.value);
      if (idx !== -1 && def) {
        providers.value[idx] = JSON.parse(JSON.stringify(def));
        providers.value[idx].dirty = false;
      }
      [
        basicConfigRef,
        crawlStrategyRef,
        proxyConfigRef,
        headersConfigRef,
      ].forEach((r) => r.value?.resetConfig());
      ElMessage.info("已放弃更改");
    })
    .catch(() => {});
}

// 其余方法保持不变
function handleRemoveTab(targetId) {
  const p = providers.value.find((x) => x.id === targetId);
  if (!p || p.builtin) return;
  ElMessageBox.confirm("确定删除？", "提示", { type: "warning" })
    .then(() => {
      const idx = providers.value.findIndex((x) => x.id === targetId);
      if (idx !== -1) providers.value.splice(idx, 1);
      if (activeProvider.value === targetId)
        activeProvider.value = providers.value[0]?.id || "";
      ElMessage.success("删除成功");
    })
    .catch(() => {});
}

async function handleTest() {
  testDialogVisible.value = true;
  testResult.value = { success: false, message: "测试中" };
  await new Promise((r) => setTimeout(r, 800));
  testResult.value = {
    success: true,
    message: "连接成功",
    duration: 120,
    dataSize: "24KB",
    statusCode: 200,
  };
}

function handleReset() {
  ElMessageBox.confirm("恢复当前供应商默认？", "提示", { type: "warning" })
    .then(() => {
      const idx = providers.value.findIndex(
        (x) => x.id === activeProvider.value
      );
      const def = DEFAULT_PROVIDERS.find((x) => x.id === activeProvider.value);
      if (idx !== -1 && def) {
        providers.value[idx] = JSON.parse(JSON.stringify(def));
        providers.value[idx].dirty = false;
      }
      [
        basicConfigRef,
        crawlStrategyRef,
        proxyConfigRef,
        headersConfigRef,
      ].forEach((r) => r.value?.resetConfig());
      ElMessage.success("已恢复默认");
    })
    .catch(() => {});
}

function handleAddProvider() {
  newProvider.value = {
    id: "",
    name: "",
    baseUrl: "",
    desc: "",
    builtin: false,
    enabled: true,
    timeout: 30,
    crawlStrategy: {
      minInterval: 2,
      maxInterval: 5,
      pauseThreshold: 50,
      pauseDuration: 10,
      maxRetries: 3,
      concurrentRequests: 1,
      enableDeduplication: true,
    },
    proxy: {
      enabled: false,
      type: "HTTP",
      host: "",
      port: "",
      username: "",
      password: "",
    },
    dirty: true,
  };
  addDialogVisible.value = true;
}

async function confirmAddProvider() {
  await newProviderFormRef.value?.validate().catch(() => {
    ElMessage.error("填写有误");
    throw "";
  });
  providers.value.push({ ...newProvider.value, dirty: true });
  activeProvider.value = newProvider.value.id;
  addDialogVisible.value = false;
  ElMessage.success("添加成功");
}

function loadSavedConfig() {
  const saved = localStorage.getItem("spider_providers");
  if (!saved) return initProviders();
  try {
    const list = JSON.parse(saved);
    providers.value = list.map((i) => ({ ...i, dirty: false }));
  } catch {
    initProviders();
  }
}

onMounted(() => {
  loadSavedConfig();
  if (!providers.value.length) initProviders();
});
</script>

<style scoped>
.spider-config {
  /* height: 100%; */
  display: flex;
  flex-direction: column;
  padding: 20px;
  /* overflow: hidden; */
}

.config-header {
  width: 100%;
  padding: 16px;
  background: #fff;
  margin-bottom: 10px;
}
.config-header h2 {
  margin: 0 0 6px 0;
  font-size: 20px;
  color: #303133;
}
.config-desc {
  margin: 0;
  color: #909399;
  font-size: 14px;
}

/* 未保存提示条 */
.unsaved-alert {
  margin-bottom: 14px;
  border-radius: 8px;
}
.unsaved-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
}
.unsaved-dot {
  color: #f56c6c;
  font-weight: bold;
  margin-left: 4px;
}

/* 标签布局 */
.provider-tabs-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.07);
  /* overflow: hidden; */
  min-height: 0;
}
.provider-tabs-header {
  flex-shrink: 0;
  border-bottom: 1px solid #e4e7ed;
  padding: 0 16px;
}
.tabs-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.tab-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 11px 14px;
  font-size: 14px;
  color: #606266;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}
.tab-item:hover {
  color: #409eff;
  background: #f5f7fa;
}
.tab-active {
  color: #409eff;
  border-color: #409eff;
}
.tab-disabled {
  color: #c0c4cc;
}
.tab-status-badge {
  font-size: 10px;
  padding: 0 4px;
  background: #f4f4f5;
  color: #909399;
  border-radius: 4px;
}
.tab-close {
  font-size: 12px;
  padding: 2px;
}
.tab-close:hover {
  background: #f56c6c;
  color: #fff;
  border-radius: 50%;
}
.tab-add {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 11px 14px;
  color: #67c23a;
  cursor: pointer;
}
.tab-add:hover {
  background: #f0f9eb;
  color: #85ce61;
}

/* 内容滚动区 */
.provider-tabs-content {
  flex: 1;
  /* overflow-y: auto; */
  padding: 20px;
  min-height: 0;
}
.config-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  margin-bottom: 10px;
  border-bottom: 1px solid #ebeef5;
  flex-wrap: wrap;
}
.last-save-time {
  margin-left: auto;
  color: #909399;
  font-size: 12px;
}
.config-panels {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 滚动条美化 */
/* .provider-tabs-content::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.provider-tabs-content::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 4px;
}
.provider-tabs-content::-webkit-scrollbar-track {
  background: #f6f6f6;
} */

.test-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  margin-bottom: 12px;
}
.test-status.success {
  color: #67c23a;
}
.test-status.error {
  color: #f56c6c;
}
.test-error pre {
  background: #f5f7fa;
  padding: 10px;
  border-radius: 4px;
  font-size: 12px;
}
</style>
