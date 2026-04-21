<template>
  <el-card class="config-card" shadow="never">
    <template #header>
      <div class="card-header">
        <span class="icon-text"><IconRequestHeaders />请求头</span>
        <div class="header-actions">
          <el-tag
            v-if="httpHeaders?.pollMode && httpHeaders.pollMode !== 'off'"
            type="success"
            size="small"
            class="poll-tag"
          >
            {{ httpHeaders.pollMode === "sequence" ? "顺序轮询" : "随机轮询" }}
            (每{{ httpHeaders.pollInterval }}次)
          </el-tag>
          <el-button link type="primary" @click="expanded = !expanded">
            {{ expanded ? "收起" : "展开" }}
          </el-button>
        </div>
      </div>
    </template>
    <el-collapse-transition>
      <div v-show="expanded">
        <!-- 轮询配置栏 -->
        <div class="poll-bar">
          <el-radio-group
            v-model="localPollMode"
            @change="handlePollModeChange"
          >
            <el-radio label="off">关闭轮询</el-radio>
            <el-radio label="sequence">顺序轮询</el-radio>
            <el-radio label="random">随机轮询</el-radio>
          </el-radio-group>

          <div style="display: flex; align-items: center; margin-left: 20px">
            <span style="margin-right: 10px">轮询间隔：</span>
            <el-slider
              v-model="localPollInterval"
              :min="1"
              :max="20"
              :step="1"
              :marks="{ 1: '1次', 5: '5次', 10: '10次', 20: '20次' }"
              style="width: 260px"
              @change="handlePollIntervalChange"
            />
          </div>
        </div>

        <!-- Tab 形式管理多套 Headers -->
        <div class="headers-tabs">
          <el-tabs
            v-model="activeTabId"
            type="border-card"
            @tab-click="handleTabClick"
          >
            <el-tab-pane
              v-for="set in httpHeaders.sets"
              :key="set.id"
              :name="set.id"
              :label="set.name"
              :closable="httpHeaders.sets.length > 1"
              @close="deleteSet(set)"
            >
              <template #label>
                <div class="tab-label">
                  <span>{{ set.name }}</span>
                  <el-icon
                    v-if="set.id === httpHeaders.currentSetId"
                    class="default-icon"
                    title="当前使用"
                  >
                    <StarFilled />
                  </el-icon>
                  <el-dropdown
                    trigger="click"
                    @click.stop
                    @command="(cmd) => handleTabCommand(cmd, set)"
                  >
                    <el-icon class="tab-more" @click.stop
                      ><MoreFilled
                    /></el-icon>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="setDefault">
                          <el-icon><Star /></el-icon>
                          设为默认
                        </el-dropdown-item>
                        <el-dropdown-item command="rename">
                          <el-icon><Edit /></el-icon>
                          重命名
                        </el-dropdown-item>
                        <el-dropdown-item command="duplicate">
                          <el-icon><CopyDocument /></el-icon>
                          复制
                        </el-dropdown-item>
                        <el-dropdown-item
                          v-if="httpHeaders.sets.length > 1"
                          command="delete"
                          divided
                        >
                          <el-icon><Delete /></el-icon>
                          删除
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </template>

              <!-- Headers 编辑表格 -->
              <div class="headers-editor">
                <div class="editor-toolbar">
                  <el-button
                    type="primary"
                    size="small"
                    @click="addHeaderToSet(set)"
                  >
                    <el-icon><Plus /></el-icon>
                    添加 Header
                  </el-button>
                  <el-button size="small" @click="openPasteDialog(set)">
                    <el-icon><DocumentCopy /></el-icon>
                    从浏览器粘贴
                  </el-button>
                  <el-button size="small" @click="openPresetSelector(set)">
                    <el-icon><Upload /></el-icon>
                    导入预设
                  </el-button>
                  <el-button size="small" @click="exportSet(set)">
                    <el-icon><Download /></el-icon>
                    导出
                  </el-button>
                </div>

                <el-table
                  :data="getHeadersList(set)"
                  stripe
                  size="small"
                  border
                >
                  <el-table-column label="启用" width="70" align="center">
                    <template #default="{ row }">
                      <el-switch
                        v-model="row.enabled"
                        size="small"
                        @change="updateHeaders(set)"
                      />
                    </template>
                  </el-table-column>
                  <el-table-column label="Header 名称" width="200">
                    <template #default="{ row }">
                      <el-input
                        v-model="row.name"
                        size="small"
                        placeholder="如: User-Agent"
                        @change="updateHeaders(set)"
                      />
                    </template>
                  </el-table-column>
                  <el-table-column label="Header 值" min-width="350">
                    <template #default="{ row }">
                      <div class="editable-value-wrapper">
                        <div
                          :contenteditable="true"
                          class="editable-value"
                          :class="{ 'is-long': row.value?.length > 100 }"
                          @blur="
                            (e) => {
                              row.value = e.target.innerText;
                              updateHeaders(set);
                            }
                          "
                          v-html="row.value"
                        ></div>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column label="操作" width="100">
                    <template #default="{ row, $index }">
                      <el-button
                        link
                        type="danger"
                        size="small"
                        @click="removeHeaderFromSet(set, $index)"
                      >
                        删除
                      </el-button>
                    </template>
                  </el-table-column>
                </el-table>

                <div
                  class="table-footer"
                  v-if="getHeadersList(set).length === 0"
                >
                  <el-empty
                    description="暂无 Header，点击上方按钮添加"
                    :image-size="80"
                  />
                </div>
              </div>
            </el-tab-pane>

            <!-- 添加新配置集的 Tab -->
            <el-tab-pane name="__add__" :disabled="false">
              <template #label>
                <div class="tab-add" @click="addHeadersSet">
                  <el-icon><Plus /></el-icon>
                  <span>新建配置</span>
                </div>
              </template>
            </el-tab-pane>
          </el-tabs>
        </div>

        <!-- 当前使用状态 + 计数 + 轮询位置 -->
        <div class="status-bar">
          <div class="status-info">
            <el-icon><InfoFilled /></el-icon>
            <span>
              当前使用：<strong>{{ currentHeadersSet?.name }}</strong>
              <span v-if="pollStatusText" class="poll-hint">{{
                pollStatusText
              }}</span>
            </span>

            <!-- 请求计数 + 轮询进度 -->
            <div class="poll-stats" v-if="httpHeaders.pollMode !== 'off'">
              <el-tag size="small" type="info"
                >总请求：{{ provider.requestCount || 0 }}</el-tag
              >
              <el-tag size="small" type="success">
                当前轮询：第 {{ currentPollIndex }} 个 / 共
                {{ enabledSets.length }} 个
              </el-tag>
              <el-tag size="small" type="warning">
                下次切换：还剩 {{ remainingToNextSwitch }} 次
              </el-tag>
            </div>
          </div>

          <div class="status-actions">
            <el-button size="small" @click="previewHeaders">
              <el-icon><View /></el-icon>
              预览当前 Headers
            </el-button>
            <el-button size="small" type="primary" @click="testCurrentHeaders">
              <el-icon><Connection /></el-icon>
              测试请求
            </el-button>
            <el-button
              size="small"
              @click="resetRequestCount"
              type="danger"
              link
            >
              重置计数
            </el-button>
          </div>
        </div>

        <!-- 预览对话框 -->
        <el-dialog
          v-model="previewDialogVisible"
          title="当前 Headers 预览"
          width="700px"
        >
          <el-table :data="previewHeadersList" size="small" border>
            <el-table-column prop="name" label="Header 名称" width="200" />
            <el-table-column
              prop="value"
              label="Header 值"
              show-overflow-tooltip
            />
          </el-table>
          <template #footer>
            <el-button @click="previewDialogVisible = false">关闭</el-button>
            <el-button type="primary" @click="copyHeaders">复制全部</el-button>
          </template>
        </el-dialog>

        <!-- 重命名对话框 -->
        <el-dialog
          v-model="renameDialogVisible"
          title="重命名配置集"
          width="400px"
        >
          <el-input v-model="renamingName" placeholder="请输入新名称" />
          <template #footer>
            <el-button @click="renameDialogVisible = false">取消</el-button>
            <el-button type="primary" @click="confirmRename">确认</el-button>
          </template>
        </el-dialog>

        <!-- 粘贴解析弹窗 -->
        <PasteHeadersDialog
          ref="pasteDialogRef"
          @confirm="(headers) => handlePasteConfirm(headers, currentPasteSet)"
        />
        <!-- 使用预设选择器组件 -->
        <PresetSelector
          v-model="showPresetSelector"
          @confirm="handlePresetConfirm"
        />
      </div>
    </el-collapse-transition>
  </el-card>
</template>

<script setup>
import { ref, watch, computed } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  Plus,
  Star,
  StarFilled,
  MoreFilled,
  Edit,
  CopyDocument,
  Delete,
  DocumentCopy,
  Download,
  Upload,
  InfoFilled,
  View,
  Connection,
} from "@element-plus/icons-vue";
import IconRequestHeaders from "@/icons/IconRequestHeaders.vue";
import PasteHeadersDialog from "./PasteHeadersDialog.vue";
import PresetSelector from "./PresetSelector.vue";

const props = defineProps({
  provider: { type: Object, required: true },
});
const emit = defineEmits(["change"]);

const expanded = ref(true);
const activeTabId = ref(null);
const renameDialogVisible = ref(false);
const renamingSet = ref(null);
const renamingName = ref("");
const previewDialogVisible = ref(false);
const previewHeadersList = ref([]);
const pasteDialogRef = ref(null);
const currentPasteSet = ref(null);
const showPresetSelector = ref(false);
const currentPresetSet = ref(null);

const localPollMode = ref("off");
const localPollInterval = ref(3);

// 浏览器预设
const browserPresets = {
  "Chrome (Windows)": {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Sec-Ch-Ua":
      '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Upgrade-Insecure-Requests": "1",
  },
  "Chrome (macOS)": {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
  },
  "Firefox (Windows)": {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language":
      "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
    "Accept-Encoding": "gzip, deflate, br",
    "Upgrade-Insecure-Requests": "1",
  },
  "Safari (macOS)": {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh-Hans;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
  },
  "Edge (Windows)": {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  },
  "Mobile (iPhone)": {
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh-Hans;q=0.9",
  },
  "Mobile (Android)": {
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.163 Mobile Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  },
};

// 配置
const httpHeaders = computed({
  get: () => {
    if (!props.provider.httpHeaders) {
      const defaultSet = {
        id: "default",
        name: "默认配置",
        enabled: true,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "*/*",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
      };
      props.provider.httpHeaders = {
        strategy: {
          pollMode: "off",
          pollInterval: 3,
          currentSetId: "default",
        },
        requestCount: 0,
        sets: [defaultSet],
      };
    }
    localPollMode.value = props.provider.httpHeaders.strategy.pollMode;
    localPollInterval.value = props.provider.httpHeaders.strategy.pollInterval;
    return props.provider.httpHeaders;
  },
  set: (val) => {
    props.provider.httpHeaders = val;
    localPollMode.value = val.strategy.pollMode;
    localPollInterval.value = val.strategy.pollInterval;
    emitChange();
  },
});

// 启用的配置集
const enabledSets = computed(() =>
  httpHeaders.value.sets.filter((s) => s.enabled)
);

// 当前轮询到第几个（从 1 开始）
const currentPollIndex = computed(() => {
  const idx = enabledSets.value.findIndex(
    (s) => s.id === httpHeaders.value.currentSetId
  );
  return idx >= 0 ? idx + 1 : 1;
});

// 剩余次数
const remainingToNextSwitch = computed(() => {
  const interval = httpHeaders.value.strategy.pollInterval || 3;
  const count = props.provider.httpHeaders.requestCount || 0;
  return interval - (count % interval);
});

// 状态文字
const pollStatusText = computed(() => {
  if (httpHeaders.value.strategy.pollMode === "off") return "";
  return httpHeaders.value.strategy.pollMode === "sequence"
    ? "（顺序轮询中）"
    : "（随机轮询中）";
});

// 切换
function handlePollModeChange(val) {
  httpHeaders.value.strategy.pollMode = val;
  emitChange();
}

function handlePollIntervalChange(val) {
  httpHeaders.value.strategy.pollInterval = val;
  emitChange();
}

// 当前集
const currentHeadersSet = computed(() => {
  const cid = httpHeaders.value.currentSetId;
  return (
    httpHeaders.value.sets.find((s) => s.id === cid) ||
    httpHeaders.value.sets[0]
  );
});

// 核心 Headers + 轮询逻辑
const currentHeaders = computed(() => {
  if (!currentHeadersSet.value) return {};
  const headers = {};
  const list = getHeadersList(currentHeadersSet.value);
  list.forEach((h) => {
    if (h.enabled && h.name?.trim()) headers[h.name.trim()] = h.value;
  });

  const mode = httpHeaders.value.pollMode;
  if (mode === "off" || enabledSets.value.length < 2) return headers;

  const reqCount = props.provider.httpsHeaders.requestCount || 0;
  const interval = httpHeaders.value.strategy.pollInterval || 3;

  if (reqCount > 0 && reqCount % interval === 0) {
    let next;
    if (mode === "sequence") {
      const idx = enabledSets.value.findIndex(
        (s) => s.id === httpHeaders.value.currentSetId
      );
      next = enabledSets.value[(idx + 1) % enabledSets.value.length];
    } else {
      const others = enabledSets.value.filter(
        (s) => s.id !== httpHeaders.value.currentSetId
      );
      next = others[Math.floor(Math.random() * others.length)];
    }
    if (next) httpHeaders.value.currentSetId = next.id;
  }

  props.provider.httpsHeaders.requestCount = reqCount + 1;
  return headers;
});

// 重置计数
function resetRequestCount() {
  props.provider.requestCount = 0;
  ElMessage.success("请求计数已重置");
  emitChange();
}

function getHeadersList(collection) {
  if (!collection.headers) return [];
  if (!Array.isArray(collection.headers)) {
    if (collection._headers) return collection._headers;
    const arr = [];
    const disabled = collection._disabledHeaders || {};
    Object.entries(collection.headers).forEach(([name, val], i) => {
      arr.push({
        id: `${collection.id}_${i}`,
        enabled: !disabled[name],
        name,
        value: val,
        desc: "",
      });
    });
    collection._headers = arr;
    return arr;
  }
  return set.headers || [];
}

function ensureHeadersArray() {
  if (httpHeaders.value?.collection)
    httpHeaders.value.collection.forEach((collection) => {
      if (set.headers && !Array.isArray(set.headers) && !set._headers)
        getHeadersList(set);
    });
}

function syncHeadersToObject(set) {
  const arr = getHeadersList(set);
  const obj = {},
    disabled = {};
  arr.forEach((h) => {
    if (h.name?.trim()) {
      obj[h.name.trim()] = h.value;
      if (!h.enabled) disabled[h.name.trim()] = true;
    }
  });
  set.headers = obj;
  set._disabledHeaders = disabled;
  delete set._headers;
}

function updateHeaders(set) {
  syncHeadersToObject(set);
  emitChange();
}

function addHeaderToSet(collection) {
  const arr = getHeadersList(collection);
  arr.push({
    id: Date.now() + "",
    enabled: true,
    name: "",
    value: "",
    desc: "",
  });
  collection.headers = arr;
  emitChange();
}

function removeHeaderFromSet(set, i) {
  const arr = getHeadersList(set);
  arr.splice(i, 1);
  set._headers = arr;
  syncHeadersToObject(set);
  emitChange();
}

function addHeadersSet() {
  const newSet = {
    id: Date.now() + "",
    name: `配置${httpHeaders.value.sets.length + 1}`,
    enabled: true,
    headers: { "User-Agent": "Mozilla/5.0" },
  };
  httpHeaders.value.sets.push(newSet);
  activeTabId.value = newSet.id;
  ensureHeadersArray();
  emitChange();
  ElMessage.success("已添加");
}

function deleteSet(set) {
  if (httpHeaders.value.sets.length <= 1)
    return ElMessage.warning("至少保留一个");
  ElMessageBox.confirm(`确定删除 ${set.name}？`)
    .then(() => {
      const i = httpHeaders.value.sets.findIndex((s) => s.id === set.id);
      if (i !== -1) {
        httpHeaders.value.sets.splice(i, 1);
        if (httpHeaders.value.currentSetId === set.id)
          httpHeaders.value.currentSetId = httpHeaders.value.sets[0].id;
        emitChange();
        ElMessage.success("删除成功");
      }
    })
    .catch(() => {});
}

function duplicateSet(set) {
  const newSet = {
    ...set,
    id: Date.now() + "",
    name: `${set.name}(副本)`,
    headers: { ...set.headers },
  };
  httpHeaders.value.sets.push(newSet);
  activeTabId.value = newSet.id;
  ensureHeadersArray();
  emitChange();
  ElMessage.success("复制成功");
}

function setAsDefault(set) {
  httpHeaders.value.currentSetId = set.id;
  emitChange();
  ElMessage.success("已设为默认");
}

function handleTabCommand(cmd, set) {
  switch (cmd) {
    case "setDefault":
      setAsDefault(set);
      break;
    case "rename":
      renamingSet.value = set;
      renamingName.value = set.name;
      renameDialogVisible.value = true;
      break;
    case "duplicate":
      duplicateSet(set);
      break;
    case "delete":
      deleteSet(set);
      break;
  }
}

function confirmRename() {
  if (renamingSet.value && renamingName.value.trim()) {
    renamingSet.value.name = renamingName.value.trim();
    emitChange();
    ElMessage.success("重命名成功");
  }
  renameDialogVisible.value = false;
}

function handleTabClick() {}

function openPasteDialog(set) {
  currentPasteSet.value = set;
  pasteDialogRef.value?.open();
}

function handlePasteConfirm(headers, set) {
  if (!set) return;
  const h = set.headers || {};
  headers.forEach((i) => {
    if (i.name) h[i.name] = i.value;
  });
  set.headers = h;
  delete set._headers;
  emitChange();
  ElMessage.success(`导入 ${headers.length} 个`);
}

function openPresetSelector(set) {
  currentPresetSet.value = set;
  showPresetSelector.value = true;
}

function handlePresetConfirm(name) {
  if (!currentPresetSet.value) return;
  const pre = browserPresets[name];
  if (pre) {
    const h = currentPresetSet.value.headers || {};
    Object.entries(pre).forEach(([k, v]) => (h[k] = v));
    currentPresetSet.value.headers = h;
    delete currentPresetSet.value._headers;
    emitChange();
    ElMessage.success("已导入预设");
  }
  currentPresetSet.value = null;
}

function exportSet(set) {
  syncHeadersToObject(set);
  const data = { name: set.name, headers: set.headers };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${set.name}.json`;
  a.click();
  ElMessage.success("导出成功");
}

function previewHeaders() {
  const h = currentHeadersSet.value.headers;
  previewHeadersList.value = Object.entries(h).map(([name, value]) => ({
    name,
    value,
  }));
  previewDialogVisible.value = true;
}

function copyHeaders() {
  const obj = {};
  previewHeadersList.value.forEach((i) => (obj[i.name] = i.value));
  navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
  ElMessage.success("已复制");
}
function testCurrentHeaders() {
  ElMessage.info(
    `当前：${currentHeadersSet.value.name}，请求计数：${props.provider.requestCount || 0}`
  );
}
function getConfig() {
  return { httpHeaders: httpHeaders.value };
}
function emitChange() {
  emit("change", getConfig());
}
function resetConfig() {
  if (!props.provider.httpHeaders) {
    const def = {
      id: "default",
      name: "默认配置",
      enabled: true,
      headers: { "User-Agent": "Mozilla/5.0" },
    };
    props.provider.httpHeaders = {
      strategy: {
        pollMode: "off",
        pollInterval: 3,
        currentSetId: "default",
      },
      requestCount: 0,
      sets: [def],
    };
  }
  ensureHeadersArray();
  if (activeTabId.value === null && httpHeaders.value.sets.length) {
    activeTabId.value = httpHeaders.value.currentSetId;
  }
}
watch(
  () => props.provider,
  () => resetConfig(),
  { immediate: true, deep: true }
);
defineExpose({ getConfig, resetConfig });
</script>

<style scoped>
.config-card {
  margin-bottom: 0;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 500;
}
.poll-tag {
  margin-right: 12px;
}
.poll-bar {
  padding: 12px 0;
  border-bottom: 1px solid #ebeef5;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.headers-tabs {
  margin-bottom: 16px;
}
.headers-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}
.tab-label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.default-icon {
  font-size: 12px;
  color: #e6a23c;
}
.tab-more {
  font-size: 12px;
  color: #909399;
  opacity: 0;
  transition: opacity 0.2s;
}
.tab-label:hover .tab-more {
  opacity: 1;
}
.tab-add {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #409eff;
  cursor: pointer;
}
.headers-editor {
  padding: 16px;
}
.editor-toolbar {
  margin-bottom: 16px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.table-footer {
  margin-top: 16px;
  text-align: center;
}

.status-bar {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 6px;
  margin-top: 16px;
  gap: 8px;
}
.status-info {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  flex-wrap: wrap;
}
.poll-hint {
  color: #909399;
  font-size: 12px;
  margin-left: 8px;
}
.poll-stats {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  flex-wrap: wrap;
}
.status-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.editable-value-wrapper {
  position: relative;
  width: 100%;
  min-height: 32px;
}
.editable-value {
  width: 100%;
  min-height: 32px;
  padding: 4px 8px;
  font-size: 13px;
  line-height: 1.5;
  color: #606266;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  cursor: text;
  transition: all 0.2s;
  word-wrap: break-word;
  word-break: break-all;
  white-space: pre-wrap;
  outline: none;
  max-height: 200px;
}
.editable-value.is-long {
  max-height: 240px;
  background: #fafafa;
}
.editable-value:focus {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}
.editable-value:empty:before {
  content: attr(placeholder);
  color: #c0c4cc;
}
:deep(.el-table__cell) {
  vertical-align: top;
}
</style>
