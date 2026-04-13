<template>
  <div class="spider-config">
    <div class="config-header">
      <h2>爬虫配置中心</h2>
      <p class="config-desc">配置各数据供应商的请求头、爬虫策略等参数</p>
    </div>

    <!-- 供应商标签栏 - 改进版 -->
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
            <span class="tab-name">{{ provider.name }}</span>
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
        <!-- 配置内容区域 - 添加滚动 -->
        <div class="config-content" v-loading="loading">
          <template v-if="currentProvider">
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
              <span class="last-save-time" v-if="lastSaveTime">
                上次保存: {{ lastSaveTime }}
              </span>
            </div>

            <div class="config-panels">
              <!-- 基础设置 -->
              <BasicConfig
                ref="basicConfigRef"
                :provider="currentProvider"
                @change="handleConfigChange"
              />

              <!-- 爬虫策略 -->
              <CrawlStrategy
                ref="crawlStrategyRef"
                :provider="currentProvider"
                @change="handleConfigChange"
              />

              <!-- 代理配置 -->
              <ProxyConfig
                ref="proxyConfigRef"
                :provider="currentProvider"
                @change="handleConfigChange"
              />

              <!-- HTTP Headers 配置 -->
              <HeadersConfig
                ref="headersConfigRef"
                :provider="currentProvider"
                @change="handleConfigChange"
              />
            </div>
          </template>
          <el-empty v-else description="请先添加供应商" />
        </div>
      </div>
    </div>

    <!-- 未保存提示 -->
    <el-alert
      v-if="hasUnsavedChanges"
      title="有未保存的更改"
      type="warning"
      :closable="false"
      show-icon
      class="unsaved-alert"
    >
      <template #default>
        <div class="unsaved-actions">
          <span>您有未保存的配置更改</span>
          <el-button size="small" type="warning" @click="handleSave"
            >保存</el-button
          >
          <el-button size="small" @click="handleDiscard">放弃</el-button>
        </div>
      </template>
    </el-alert>

    <!-- 测试连接结果弹窗 -->
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

    <!-- 新增供应商弹窗 -->
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
            rows="2"
            placeholder="可选"
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
import HeadersConfig from "./HeadersConfig.vue";

// 默认供应商配置
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
    headers: [
      {
        id: "header_1",
        enabled: true,
        name: "User-Agent",
        value:
          "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.251 Safari/537.36",
        desc: "浏览器标识",
      },
      {
        id: "header_2",
        enabled: true,
        name: "Accept",
        value: "*/*",
        desc: "接受类型",
      },
      {
        id: "header_3",
        enabled: true,
        name: "Accept-Language",
        value: "zh-CN,zh-TW;q=0.9,zh;q=0.8,en-US;q=0.7,en;q=0.6",
        desc: "语言偏好",
      },
      {
        id: "header_4",
        enabled: true,
        name: "Referer",
        value: "https://quote.eastmoney.com/center/gridlist.html",
        desc: "来源页面",
      },
    ],
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
    headers: [
      {
        id: "header_1",
        enabled: true,
        name: "User-Agent",
        value: "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36",
        desc: "浏览器标识",
      },
    ],
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
    headers: [
      {
        id: "header_1",
        enabled: true,
        name: "User-Agent",
        value: "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36",
        desc: "浏览器标识",
      },
    ],
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
    headers: [
      {
        id: "header_1",
        enabled: true,
        name: "User-Agent",
        value: "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36",
        desc: "浏览器标识",
      },
    ],
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
    headers: [
      {
        id: "header_1",
        enabled: true,
        name: "User-Agent",
        value: "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36",
        desc: "浏览器标识",
      },
    ],
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
    headers: [
      {
        id: "header_1",
        enabled: true,
        name: "User-Agent",
        value: "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36",
        desc: "浏览器标识",
      },
    ],
  },
];

// State
const activeProvider = ref("eastmoney");
const providers = ref([...DEFAULT_PROVIDERS]);
const loading = ref(false);
const saving = ref(false);
const hasUnsavedChanges = ref(false);
const lastSaveTime = ref("");
const testDialogVisible = ref(false);
const testResult = ref(null);
const addDialogVisible = ref(false);
const newProviderFormRef = ref(null);

// Refs to child components
const basicConfigRef = ref(null);
const crawlStrategyRef = ref(null);
const proxyConfigRef = ref(null);
const headersConfigRef = ref(null);

// Computed
const currentProvider = computed(() => {
  return providers.value.find((p) => p.id === activeProvider.value);
});

// Form rules
const providerRules = {
  id: [
    { required: true, message: "请输入供应商ID", trigger: "blur" },
    {
      pattern: /^[a-zA-Z][a-zA-Z0-9_]*$/,
      message: "ID只能包含字母、数字和下划线，且以字母开头",
      trigger: "blur",
    },
    {
      validator: (rule, value, callback) => {
        if (providers.value.some((p) => p.id === value)) {
          callback(new Error("供应商ID已存在"));
        } else {
          callback();
        }
      },
      trigger: "blur",
    },
  ],
  name: [{ required: true, message: "请输入供应商名称", trigger: "blur" }],
  baseUrl: [
    { required: true, message: "请输入基础URL", trigger: "blur" },
    {
      pattern: /^https?:\/\/.+/,
      message: "请输入有效的URL（以http://或https://开头）",
      trigger: "blur",
    },
  ],
};

// New provider template
const newProvider = ref({
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
  headers: [],
});

// Methods
async function handleTabClick(providerId) {
  if (hasUnsavedChanges.value) {
    try {
      await ElMessageBox.confirm("当前有未保存的更改，是否继续切换？", "提示", {
        confirmButtonText: "继续切换",
        cancelButtonText: "取消",
        type: "warning",
      });
      hasUnsavedChanges.value = false;
      activeProvider.value = providerId;
      loadProviderConfig(providerId);
    } catch {
      // 用户取消，不做任何操作
    }
  } else {
    activeProvider.value = providerId;
    loadProviderConfig(providerId);
  }
}

function handleRemoveTab(targetId) {
  const provider = providers.value.find((p) => p.id === targetId);
  if (provider && !provider.builtin) {
    ElMessageBox.confirm(`确定要删除供应商 "${provider.name}" 吗？`, "提示", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    })
      .then(() => {
        const index = providers.value.findIndex((p) => p.id === targetId);
        if (index !== -1) {
          providers.value.splice(index, 1);
          if (activeProvider.value === targetId) {
            activeProvider.value = providers.value[0]?.id || "";
          }
          ElMessage.success("删除成功");
        }
      })
      .catch(() => {});
  }
}

function loadProviderConfig(providerId) {
  // 配置已经在 providers 中，子组件通过 props 接收
  // 这里可以触发子组件重新加载
}

function handleConfigChange() {
  hasUnsavedChanges.value = true;
}

async function handleSave() {
  saving.value = true;
  try {
    // 收集所有配置
    const updatedProvider = { ...currentProvider.value };

    if (basicConfigRef.value) {
      Object.assign(updatedProvider, basicConfigRef.value.getConfig());
    }
    if (crawlStrategyRef.value) {
      updatedProvider.crawlStrategy = crawlStrategyRef.value.getConfig();
    }
    if (proxyConfigRef.value) {
      updatedProvider.proxy = proxyConfigRef.value.getConfig();
    }
    if (headersConfigRef.value) {
      updatedProvider.headers = headersConfigRef.value.getConfig();
    }

    // 更新 providers 中的数据
    const index = providers.value.findIndex(
      (p) => p.id === activeProvider.value
    );
    if (index !== -1) {
      providers.value[index] = updatedProvider;
    }

    // 保存到本地存储或调用API
    localStorage.setItem("spider_providers", JSON.stringify(providers.value));

    hasUnsavedChanges.value = false;
    lastSaveTime.value = new Date().toLocaleString();
    ElMessage.success("保存成功");
  } catch (error) {
    ElMessage.error("保存失败：" + error.message);
  } finally {
    saving.value = false;
  }
}

function handleDiscard() {
  ElMessageBox.confirm("确定要放弃所有未保存的更改吗？", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(() => {
      // 重新加载当前供应商的配置
      const index = providers.value.findIndex(
        (p) => p.id === activeProvider.value
      );
      if (index !== -1) {
        // 触发子组件重置
        if (basicConfigRef.value) basicConfigRef.value.resetConfig();
        if (crawlStrategyRef.value) crawlStrategyRef.value.resetConfig();
        if (proxyConfigRef.value) proxyConfigRef.value.resetConfig();
        if (headersConfigRef.value) headersConfigRef.value.resetConfig();
      }
      hasUnsavedChanges.value = false;
      ElMessage.info("已放弃更改");
    })
    .catch(() => {});
}

async function handleTest() {
  testDialogVisible.value = true;
  testResult.value = { success: false, message: "测试中..." };

  try {
    // 模拟测试连接
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const provider = currentProvider.value;
    testResult.value = {
      success: true,
      message: "连接成功",
      duration: Math.floor(Math.random() * 200) + 50,
      dataSize: (Math.random() * 50 + 10).toFixed(1) + "KB",
      statusCode: 200,
    };
  } catch (error) {
    testResult.value = {
      success: false,
      message: "连接失败",
      error: error.message,
    };
  }
}

function handleReset() {
  ElMessageBox.confirm("确定要恢复当前供应商的默认配置吗？", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(() => {
      const defaultProvider = DEFAULT_PROVIDERS.find(
        (p) => p.id === activeProvider.value
      );
      if (defaultProvider) {
        const index = providers.value.findIndex(
          (p) => p.id === activeProvider.value
        );
        if (index !== -1) {
          providers.value[index] = JSON.parse(JSON.stringify(defaultProvider));
        }
      }

      // 触发子组件重置
      if (basicConfigRef.value) basicConfigRef.value.resetConfig();
      if (crawlStrategyRef.value) crawlStrategyRef.value.resetConfig();
      if (proxyConfigRef.value) proxyConfigRef.value.resetConfig();
      if (headersConfigRef.value) headersConfigRef.value.resetConfig();

      hasUnsavedChanges.value = false;
      ElMessage.success("已恢复默认配置");
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
    headers: [
      {
        id: Date.now().toString(),
        enabled: true,
        name: "User-Agent",
        value: "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36",
        desc: "浏览器标识",
      },
    ],
  };
  addDialogVisible.value = true;
}

async function confirmAddProvider() {
  try {
    await newProviderFormRef.value?.validate();

    const newId = newProvider.value.id;
    if (providers.value.some((p) => p.id === newId)) {
      ElMessage.error("供应商ID已存在");
      return;
    }

    providers.value.push({ ...newProvider.value });
    activeProvider.value = newId;
    addDialogVisible.value = false;
    hasUnsavedChanges.value = true;
    ElMessage.success("添加成功");
  } catch (error) {
    ElMessage.error("请正确填写表单");
  }
}

// 加载保存的配置
function loadSavedConfig() {
  const saved = localStorage.getItem("spider_providers");
  if (saved) {
    try {
      const savedProviders = JSON.parse(saved);
      // 合并内置供应商的更新
      const mergedProviders = DEFAULT_PROVIDERS.map((defaultP) => {
        const savedP = savedProviders.find((sp) => sp.id === defaultP.id);
        return savedP ? { ...defaultP, ...savedP } : defaultP;
      });
      // 添加自定义供应商
      const customProviders = savedProviders.filter(
        (sp) => !DEFAULT_PROVIDERS.some((dp) => dp.id === sp.id)
      );
      providers.value = [...mergedProviders, ...customProviders];
    } catch (e) {
      console.error("加载配置失败", e);
    }
  }
}

onMounted(() => {
  loadSavedConfig();
});
</script>

<style scoped>
.spider-config {
  height: 100%;
  display: flex;
  flex-direction: column;
  /* background-color: #f5f7fa; */
  padding: 20px;
  overflow: hidden; /* 防止外层滚动 */
}

.config-header {
  margin-bottom: 20px;
  flex-shrink: 0; /* 防止被压缩 */
}

.config-header h2 {
  margin: 0 0 8px 0;
  font-size: 20px;
  color: #303133;
}

.config-desc {
  margin: 0;
  color: #909399;
  font-size: 14px;
}

/* 供应商标签栏包装器 - 占据剩余高度并支持滚动 */
.provider-tabs-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  min-height: 0; /* 重要：允许 flex 子元素缩小 */
}

/* 标签栏头部 - 固定不滚动 */
.provider-tabs-header {
  flex-shrink: 0;
  background: #ffffff;
  border-bottom: 1px solid #e4e7ed;
  padding: 0 20px;
}

.tabs-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  position: relative;
  margin-bottom: -1px;
}

.tab-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 12px 16px;
  font-size: 14px;
  color: #606266;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s ease;
  position: relative;
}

.tab-item:hover {
  color: #409eff;
  background-color: #f5f7fa;
}

.tab-item.tab-active {
  color: #409eff;
  border-bottom-color: #409eff;
}

.tab-item.tab-disabled {
  color: #c0c4cc;
}

.tab-name {
  font-weight: 500;
}

.tab-status-badge {
  font-size: 10px;
  padding: 0 4px;
  background-color: #f4f4f5;
  color: #909399;
  border-radius: 4px;
  line-height: 16px;
}

.tab-close {
  font-size: 12px;
  margin-left: 4px;
  padding: 2px;
  border-radius: 50%;
  transition: all 0.2s;
}

.tab-close:hover {
  background-color: #f56c6c;
  color: white;
}

.tab-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 12px 16px;
  font-size: 13px;
  color: #67c23a;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s ease;
  margin-left: auto;
}

.tab-add:hover {
  color: #85ce61;
  background-color: #f0f9eb;
}

/* 标签内容区 - 可滚动 */
.provider-tabs-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: #ffffff;
  min-height: 0; /* 重要：允许滚动 */
}

/* 自定义滚动条样式 */
.provider-tabs-content::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.provider-tabs-content::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.provider-tabs-content::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

.provider-tabs-content::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

.config-content {
  min-height: 100%;
}

.config-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 20px;
  border-bottom: 1px solid #ebeef5;
  margin-bottom: 20px;
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

/* 未保存提示 */
.unsaved-alert {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 320px;
  z-index: 1000;
}

.unsaved-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}

/* 测试结果样式 */
.test-result {
  padding: 12px;
}

.test-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 16px;
}

.test-status.success {
  color: #67c23a;
}

.test-status.error {
  color: #f56c6c;
}

.test-data {
  margin-bottom: 16px;
}

.test-error pre {
  background-color: #f5f7fa;
  padding: 12px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 12px;
  margin-top: 8px;
}
</style>
