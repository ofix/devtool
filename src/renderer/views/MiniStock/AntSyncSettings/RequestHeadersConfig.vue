<template>
  <el-card class="config-card" shadow="never">
    <template #header>
      <div class="card-header">
        <!-- 标题区域 -->
        <span class="icon-text"><IconRequestHeaders />请求头</span>
        <div class="header-actions">
          <!-- 轮询状态标签：开启时显示 -->
          <el-tag
            v-if="
              requestHeaders?.strategy?.pollMode &&
              requestHeaders.strategy.pollMode !== 'off'
            "
            type="success"
            size="small"
            class="poll-tag"
          >
            {{
              requestHeaders.strategy.pollMode === "sequence"
                ? "顺序轮询"
                : "随机轮询"
            }}
            (每{{ requestHeaders.strategy.pollInterval }}次)
          </el-tag>
          <!-- 展开/收起按钮 -->
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
          <!-- 轮询模式单选框 -->
          <el-radio-group
            v-model="localPollMode"
            @change="handlePollModeChange"
          >
            <el-radio label="off">关闭轮询</el-radio>
            <el-radio label="sequence">顺序轮询</el-radio>
            <el-radio label="random">随机轮询</el-radio>
          </el-radio-group>

          <!-- 轮询间隔滑块 -->
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

        <!-- Headers 配置集 Tab -->
        <div class="headers-tabs">
          <el-tabs
            v-model="activeTabId"
            type="border-card"
            @tab-click="handleTabClick"
            @tab-remove="deleteSet"
          >
            <!-- 遍历渲染所有配置集 -->
            <el-tab-pane
              v-for="set in requestHeaders.sets"
              :key="set.id"
              :name="set.id"
              :label="set.name"
              :closable="requestHeaders.sets.length > 1"
            >
              <template #label>
                <div class="tab-label">
                  <span>{{ set.name }}</span>
                  <!-- 当前默认使用的配置集标记 -->
                  <el-icon
                    v-if="set.id === requestHeaders.currentSetId"
                    class="default-icon"
                    title="当前使用"
                  >
                    <StarFilled />
                  </el-icon>
                  <!-- 配置集更多操作下拉菜单 -->
                  <el-dropdown
                    trigger="click"
                    @click.stop
                    @command="(cmd) => handleTabCommand(cmd, set)"
                  >
                    <el-icon class="tab-more" @click.stop>
                      <MoreFilled />
                    </el-icon>
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
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </template>

              <!-- Header 编辑表格 -->
              <div class="headers-editor">
                <div class="editor-toolbar">
                  <el-button type="primary" @click="addHeaderToSet(set)">
                    <el-icon><Plus /></el-icon>
                    添加 Header
                  </el-button>
                  <el-button @click="openPasteDialog(set)">
                    <el-icon><DocumentCopy /></el-icon>
                    从浏览器粘贴
                  </el-button>
                  <el-button @click="openPresetSelector(set)">
                    <el-icon><Upload /></el-icon>
                    导入预设
                  </el-button>
                  <el-button @click="exportSet(set)">
                    <el-icon><Download /></el-icon>
                    导出
                  </el-button>
                  <el-button @click="previewHeaders">
                    <el-icon><View /></el-icon>
                    预览当前 Headers
                  </el-button>
                </div>

                <!-- Header 表格 -->
                <el-table
                  :data="getReactiveHeaders(set)"
                  stripe
                  size="small"
                  border
                >
                  <!-- 启用开关 -->
                  <el-table-column label="启用" width="70" align="center">
                    <template #default="{ row }">
                      <el-switch
                        v-model="row.enabled"
                        size="small"
                        @change="updateHeaders(set)"
                      />
                    </template>
                  </el-table-column>
                  <!-- Header 名称 -->
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
                  <!-- Header 值（可编辑div） -->
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
                          placeholder="请输入Header值"
                        ></div>
                      </div>
                    </template>
                  </el-table-column>
                  <!-- 删除操作 -->
                  <el-table-column label="操作" width="100">
                    <template #default="{ $index }">
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

                <!-- 空状态提示 -->
                <div
                  class="table-footer"
                  v-if="getReactiveHeaders(set).length === 0"
                >
                  <el-empty
                    description="暂无 Header，点击上方按钮添加"
                    :image-size="80"
                  />
                </div>
              </div>
            </el-tab-pane>

            <!-- 新建配置 Tab -->
            <el-tab-pane name="__add__" :disabled="false">
              <template #label>
                <div class="tab-add" @click="addSet">
                  <el-icon><Plus /></el-icon>
                  <span>新建配置</span>
                </div>
              </template>
            </el-tab-pane>
          </el-tabs>
        </div>

        <!-- 预览对话框 -->
        <el-dialog
          v-model="previewDialogVisible"
          title="当前 Headers 预览"
          width="700px"
        >
          <el-table :data="previewSet" size="small" border>
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

        <!-- 粘贴解析弹窗组件 -->
        <PasteHeadersDialog
          ref="pasteDialogRef"
          @confirm="(headers) => handlePasteConfirm(headers, currentPasteSet)"
        />
        <!-- 预设选择器组件 -->
        <PresetSelector
          v-model="showPresetSelector"
          @confirm="handlePresetConfirm"
        />
      </div>
    </el-collapse-transition>
  </el-card>
</template>

<script setup>
import { ref, watch, computed, nextTick } from "vue";
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

//////////////////////////////////// Props & Emit ////////////////////////////////////
const props = defineProps({
  provider: { type: Object, required: true }, // 数据源
});
const emit = defineEmits(["change"]); // 数据变更事件

//////////////////////////////////// 响应式状态 ////////////////////////////////////
const expanded = ref(true); // 面板展开状态
const activeTabId = ref("default"); // 当前激活的Tab
const renameDialogVisible = ref(false); // 重命名弹窗
const renamingSet = ref(null); // 正在重命名的配置集
const renamingName = ref("");
const previewDialogVisible = ref(false); // 预览弹窗
const previewSet = ref([]); // 预览数据
const pasteDialogRef = ref(null); // 粘贴弹窗ref
const currentPasteSet = ref(null); // 当前粘贴目标
const showPresetSelector = ref(false); // 预设选择器
const currentPresetSet = ref(null); // 当前预设目标

const localPollMode = ref("off"); // 轮询模式本地值
const localPollInterval = ref(3); // 轮询间隔本地值

//////////////////////////////////// 浏览器预设Headers ////////////////////////////////////
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
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100100 Firefox/119.0",
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

//////////////////////////////////// 核心计算属性：HttpHeaders配置 ////////////////////////////////////
const requestHeaders = computed({
  get: () => {
    // 初始化默认值
    if (!props.provider.requestHeaders) {
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
      props.provider.requestHeaders = {
        strategy: {
          pollMode: "off",
          pollInterval: 3,
          currentSetId: "default",
        },
        requestCount: 0,
        sets: [defaultSet],
      };
      nextTick(() => {
        setTimeout(() => {
          activeTabId.value = defaultSet.id;
          console.log("activeTabId = ", defaultSet.id);
        }, 0);
      });
    }

    // 同步本地值
    localPollMode.value = props.provider.requestHeaders.strategy.pollMode;
    localPollInterval.value =
      props.provider.requestHeaders.strategy.pollInterval;
    return props.provider.requestHeaders;
  },
  set: (val) => {
    props.provider.requestHeaders = val;
    localPollMode.value = val.strategy?.pollMode;
    localPollInterval.value = val.strategy?.pollInterval;
    emitChange();
  },
});

// 已启用的配置集列表
const enabledSets = computed(
  () => requestHeaders.value.sets?.filter((s) => s.enabled) || []
);

//////////////////////////////////// 轮询模式/间隔修改 ////////////////////////////////////
function handlePollModeChange(val) {
  requestHeaders.value.strategy.pollMode = val;
  emitChange();
}
function handlePollIntervalChange(val) {
  requestHeaders.value.strategy.pollInterval = val;
  emitChange();
}

// 当前使用的Header配置集
const currentSet = computed(() => {
  const cid = requestHeaders.value.currentSetId;
  return (
    requestHeaders.value.sets?.find((s) => s.id === cid) ||
    requestHeaders.value.sets?.[0]
  );
});

//////////////////////////////////// Header 数组/对象转换工具 ////////////////////////////////////
/**
 * 将配置集中的headers对象转为数组用于表格编辑
 */
function getReactiveHeaders(set) {
  if (!set) return [];
  if (!set.headers) set.headers = {};

  // 已有数组缓存直接返回
  if (set._headers) return set._headers;

  // 对象转数组
  const arr = [];
  const disabled = set._disabledHeaders || {};
  Object.entries(set.headers).forEach(([name, val], i) => {
    arr.push({
      id: `${set.id}_${i}`,
      enabled: !disabled[name],
      name,
      value: val,
      desc: "",
    });
  });
  set._headers = arr;
  return arr;
}

/**
 * 批量确保所有配置集为数组格式
 */
function ensureHeadersArray() {
  if (!requestHeaders.value?.sets) return;
  requestHeaders.value.sets.forEach((set) => {
    if (set.headers && !Array.isArray(set.headers)) getReactiveHeaders(set);
  });
}

/**
 * 将表格数组同步回对象格式（用于保存/接口）
 */
function syncHeadersToObject(set) {
  const arr = getReactiveHeaders(set);
  const obj = {};
  // const disabled = {};
  arr.forEach((h) => {
    if (h.name?.trim()) {
      if (h.enabled) {
        obj[h.name.trim()] = h.value;
      }
      // if (!h.enabled) disabled[h.name.trim()] = true;
    }
  });
  set.headers = obj;
  // set._disabledHeaders = disabled;
}

//////////////////////////////////// Header 增删改 ////////////////////////////////////
function updateHeaders(set) {
  syncHeadersToObject(set);
  emitChange();
}

function addHeaderToSet(set) {
  const arr = getReactiveHeaders(set);
  arr.push({
    id: Date.now() + "",
    enabled: true,
    name: "",
    value: "",
    desc: "",
  });
  set._headers = arr;
  emitChange();
}

function removeHeaderFromSet(set, i) {
  if (!set || !set._headers || i < 0) return;
  // 直接删除原数组
  set._headers.splice(i, 1);
  // 同步回对象
  syncHeadersToObject(set);
  emitChange();
}

//////////////////////////////////// 配置集 增删/复制/重命名 ////////////////////////////////////
function addSet() {
  const newSet = {
    id: Date.now() + "",
    name: `配置${requestHeaders.value.sets.length + 1}`,
    enabled: true,
    headers: [{ "User-Agent": "Mozilla/5.0" }],
  };
  // 创建新数组，整体赋值给 computed
  const newSets = [...requestHeaders.value.sets, newSet];
  requestHeaders.value.sets = newSets;

  nextTick(() => {
    setTimeout(() => {
      activeTabId.value = newSet.id;
    }, 0);
  });
  ensureHeadersArray();
  emitChange();
}

function deleteSet(setId) {
  const set = requestHeaders.value.sets.find((s) => s.id === setId);
  if (!set) return;

  if (requestHeaders.value.sets.length <= 1) {
    ElMessage.warning("至少保留一个配置集");
    return;
  }

  ElMessageBox.confirm(`确定删除【${set.name}】吗？`, "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(() => {
      // 创建新数组，不要用 splice
      const newSets = requestHeaders.value.sets.filter((s) => s.id !== setId);
      requestHeaders.value.sets = newSets;

      // 更新默认选中
      if (requestHeaders.value.currentSetId === setId) {
        requestHeaders.value.currentSetId = newSets[0].id;
      }

      // 删除后自动选中第一个
      nextTick(() => {
        activeTabId.value = newSets[0].id;
      });

      emitChange();
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
  const newSets = [...requestHeaders.value.sets, newSet];
  requestHeaders.value.sets = newSets;

  nextTick(() => {
    setTimeout(() => {
      activeTabId.value = newSet.id;
    }, 0);
  });
  ensureHeadersArray();
  emitChange();
}

function setAsDefault(set) {
  requestHeaders.value.currentSetId = set.id;
  emitChange();
  ElMessage.success("已设为默认使用");
}

// Tab 下拉命令处理
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
  }
}

// 确认重命名
function confirmRename() {
  if (renamingSet.value && renamingName.value.trim()) {
    renamingSet.value.name = renamingName.value.trim();
    emitChange();
  }
  renameDialogVisible.value = false;
}

// Tab点击（预留）
function handleTabClick(pane, event) {}

//////////////////////////////////// 粘贴/导入预设/导出 ////////////////////////////////////
function openPasteDialog(set) {
  currentPasteSet.value = set;
  pasteDialogRef.value?.open();
}

function handlePasteConfirm(headers, set) {
  if (!set) return;
  const h = set.headers || {};
  headers.forEach((item) => {
    if (item.name) h[item.name] = item.value;
  });
  set.headers = h;
  delete set._headers;
  emitChange();
  ElMessage.success(`成功导入 ${headers.length} 个Header`);
}

function openPresetSelector(set) {
  currentPresetSet.value = set;
  showPresetSelector.value = true;
}

// 导入浏览器预设
function handlePresetConfirm(name) {
  if (!currentPresetSet.value) return;
  const pre = browserPresets[name];
  if (pre) {
    const h = currentPresetSet.value.headers || {};
    Object.entries(pre).forEach(([k, v]) => (h[k] = v));
    currentPresetSet.value.headers = h;
    delete currentPresetSet.value._headers;
    getReactiveHeaders(currentPresetSet.value);
    ElMessage.success("已导入浏览器预设");
    emitChange();
  }
  currentPresetSet.value = null;
  showPresetSelector.value = false;
}

// 导出配置集
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

//////////////////////////////////// 预览 & 复制 ////////////////////////////////////
function previewHeaders() {
  const h = currentSet.value.headers || {};
  previewSet.value = Object.entries(h).map(([name, value]) => ({
    name,
    value,
  }));
  previewDialogVisible.value = true;
}

function copyHeaders() {
  const obj = {};
  previewSet.value.forEach((item) => (obj[item.name] = item.value));
  navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
  ElMessage.success("已复制到剪贴板");
}

// //////////////////////////////////// 配置暴露 & 事件 ////////////////////////////////////
function getConfig() {
  return requestHeaders.value;
}

function emitChange() {
  emit("change", getConfig());
}

// 初始化/重置配置
function resetConfig() {
  if (!props.provider.requestHeaders) {
    const def = {
      id: "default",
      name: "默认配置",
      enabled: true,
      headers: { "User-Agent": "Mozilla/5.0" },
    };
    props.provider.requestHeaders = {
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
  // 默认激活当前Tab
  if (activeTabId.value === null && requestHeaders.value.sets?.length) {
    activeTabId.value = requestHeaders.value.currentSetId;
  }
}

// 监听provider变化
watch(
  () => props.provider,
  () => resetConfig(),
  { immediate: true, deep: true }
);

// 暴露方法给父组件
defineExpose({ getConfig, resetConfig });
</script>

<style scoped>
/* 卡片整体样式 */
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

/* 轮询配置栏 */
.poll-bar {
  padding: 12px 0;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  /* flex-wrap: wrap; */
  gap: 10px;
}

/* Tab区域 */
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

/* 编辑器区域 */
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

/* 可编辑div样式 */
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
.editable-value:empty::before {
  content: attr(placeholder);
  color: #c0c4cc;
}
:deep(.el-table__cell) {
  vertical-align: top;
}
</style>
