<template>
  <el-card class="config-card" shadow="never">
    <template #header>
      <div class="card-header">
        <span class="icon-text"><IconRequestHeaders/> HTTP Headers</span>
        <div class="header-actions">
          <el-tag
            v-if="headersConfig?.enableRandom"
            type="success"
            size="small"
            class="random-tag"
          >
            🔄 随机轮换 (每{{ headersConfig.randomInterval }}次)
          </el-tag>
          <el-button link type="primary" @click="expanded = !expanded">
            {{ expanded ? "收起" : "展开" }}
          </el-button>
        </div>
      </div>
    </template>
    <el-collapse-transition>
      <div v-show="expanded">
        <!-- 随机轮换配置栏 -->
        <div class="random-bar">
          <el-checkbox
            v-model="localEnableRandom"
            @change="handleEnableRandomChange"
          >
            启用随机 Headers 轮换
          </el-checkbox>
          <el-slider
            v-if="localEnableRandom"
            v-model="localRandomInterval"
            :min="1"
            :max="20"
            :step="1"
            :marks="{ 1: '1次', 5: '5次', 10: '10次', 20: '20次' }"
            style="width: 300px; margin-left: 16px"
            @change="handleRandomIntervalChange"
          />
        </div>

        <!-- Tab 形式管理多套 Headers -->
        <div class="headers-tabs">
          <el-tabs
            v-model="activeTabId"
            type="border-card"
            @tab-click="handleTabClick"
          >
            <el-tab-pane
              v-for="set in headersConfig.sets"
              :key="set.id"
              :name="set.id"
              :label="set.name"
              :closable="headersConfig.sets.length > 1"
              @close="deleteSet(set)"
            >
              <template #label>
                <div class="tab-label">
                  <span>{{ set.name }}</span>
                  <el-icon
                    v-if="set.id === headersConfig.currentSetId"
                    class="default-icon"
                    title="默认"
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
                          v-if="headersConfig.sets.length > 1"
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

        <!-- 当前使用状态 -->
        <div class="status-bar">
          <div class="status-info">
            <el-icon><InfoFilled /></el-icon>
            <span>
              当前使用：<strong>{{ currentHeadersSet?.name }}</strong>
              <span v-if="headersConfig.enableRandom" class="random-hint">
                （将与其他配置集随机轮换）
              </span>
            </span>
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
import IconRequestHeaders from "@/icons/IconRequestHeaders.vue"
import PasteHeadersDialog from "./PasteHeadersDialog.vue";
import PresetSelector from "./PresetSelector.vue";

const props = defineProps({
  provider: {
    type: Object,
    required: true,
  },
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
const currentPresetSet = ref(null); // 当前要导入的配置集

// 本地配置的副本，用于 v-model 绑定
const localEnableRandom = ref(false);
const localRandomInterval = ref(5);

// 获取值长度
function getValueLength(value) {
  if (!value) return 0;
  return String(value).length;
}

// 处理失焦保存
function handleValueBlur(event, row, set) {
  const newValue = event.target.innerText;
  if (row.value !== newValue) {
    row.value = newValue;
    updateHeaders(set);
  }
}

// 处理回车（不换行，而是保存）
function handleValueEnter(event) {
  event.preventDefault();
  event.target.blur();
}

// 浏览器预设配置
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

// 获取 headers 配置（新层次结构）
const headersConfig = computed({
  get: () => {
    // 如果还没有 headersConfig，初始化
    if (!props.provider.headersConfig) {
      const defaultSet = {
        id: "default",
        name: "默认配置",
        description: "默认浏览器配置",
        enabled: true,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "*/*",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
      };

      props.provider.headersConfig = {
        enableRandom: false,
        randomInterval: 5,
        currentSetId: "default",
        sets: [defaultSet],
      };
    }

    // 同步到本地变量
    localEnableRandom.value = props.provider.headersConfig.enableRandom;
    localRandomInterval.value = props.provider.headersConfig.randomInterval;

    return props.provider.headersConfig;
  },
  set: (val) => {
    props.provider.headersConfig = val;
    // 同步到本地变量
    localEnableRandom.value = val.enableRandom;
    localRandomInterval.value = val.randomInterval;
    emitChange();
  },
});

// 处理随机轮换开关变化
function handleEnableRandomChange(value) {
  headersConfig.value.enableRandom = value;
  emitChange();
}

// 处理随机间隔变化
function handleRandomIntervalChange(value) {
  headersConfig.value.randomInterval = value;
  emitChange();
}

// 当前使用的 headers 集
const currentHeadersSet = computed(() => {
  const currentId = headersConfig.value.currentSetId;
  return (
    headersConfig.value.sets.find((set) => set.id === currentId) ||
    headersConfig.value.sets[0]
  );
});

// 获取当前有效的 headers 对象（用于爬虫）
const currentHeaders = computed(() => {
  if (!currentHeadersSet.value) return {};

  // 返回对象格式的 headers，只包含启用的
  const headers = {};
  const headersArray = getHeadersList(currentHeadersSet.value);
  headersArray.forEach((header) => {
    if (header.enabled && header.name && header.name.trim()) {
      headers[header.name.trim()] = header.value;
    }
  });

  // 如果启用了随机轮换，自动切换
  if (headersConfig.value.enableRandom && headersConfig.value.sets.length > 1) {
    const requestCount = props.provider.requestCount || 0;
    const interval = headersConfig.value.randomInterval || 5;

    if (requestCount > 0 && requestCount % interval === 0) {
      // 随机选择一个不同的配置集
      const otherSets = headersConfig.value.sets.filter(
        (set) => set.id !== headersConfig.value.currentSetId && set.enabled
      );
      if (otherSets.length > 0) {
        const randomSet =
          otherSets[Math.floor(Math.random() * otherSets.length)];
        headersConfig.value.currentSetId = randomSet.id;
      }
    }
    props.provider.requestCount =
      (requestCount + 1) % (interval * headersConfig.value.sets.length);
  }

  return headers;
});

// 确保 getHeadersList 函数正确处理对象格式
function getHeadersList(set) {
  if (!set.headers) return [];

  // 如果是对象格式，转换为数组
  if (!Array.isArray(set.headers)) {
    if (set._headersArray) {
      return set._headersArray;
    }

    const headersArray = [];
    const disabledMap = set._disabledHeaders || {};

    Object.entries(set.headers).forEach(([name, value], index) => {
      headersArray.push({
        id: `${set.id}_${index}_${Date.now()}`,
        enabled: !disabledMap[name],
        name: name,
        value: value,
        desc: "",
      });
    });
    set._headersArray = headersArray;
    return headersArray;
  }

  return set.headers || [];
}

// 确保每个 set 都有正确的数组缓存
function ensureHeadersArray() {
  if (headersConfig.value && headersConfig.value.sets) {
    headersConfig.value.sets.forEach((set) => {
      if (set.headers && !Array.isArray(set.headers) && !set._headersArray) {
        getHeadersList(set);
      }
    });
  }
}

// 在 syncHeadersToObject 中不删除禁用的 header
function syncHeadersToObject(set) {
  const headersArray = getHeadersList(set);
  const headersObject = {};
  const disabledMap = {};

  headersArray.forEach((header) => {
    if (header.name && header.name.trim()) {
      headersObject[header.name.trim()] = header.value;
      if (!header.enabled) {
        disabledMap[header.name.trim()] = true;
      }
    }
  });

  set.headers = headersObject;
  set._disabledHeaders = disabledMap; // 单独存储禁用状态
  delete set._headersArray;
}

function updateHeaders(set) {
  syncHeadersToObject(set);
  emitChange();
}

// 添加 Header 时也要更新
function addHeaderToSet(set) {
  const headersArray = getHeadersList(set);
  headersArray.push({
    id: Date.now().toString() + Math.random(),
    enabled: true,
    name: "",
    value: "",
    desc: "",
  });
  set._headersArray = headersArray;
  // 不立即同步，等用户填写完再同步
  emitChange();
}

// 删除 Header 时同步
function removeHeaderFromSet(set, index) {
  const headersArray = getHeadersList(set);
  headersArray.splice(index, 1);
  set._headersArray = headersArray;
  syncHeadersToObject(set);
  emitChange();
}

function addHeadersSet() {
  const newSet = {
    id: Date.now().toString(),
    name: `配置 ${headersConfig.value.sets.length + 1}`,
    description: "",
    enabled: true,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  };
  headersConfig.value.sets.push(newSet);
  activeTabId.value = newSet.id;
  ensureHeadersArray();
  emitChange();
  ElMessage.success("已添加新配置集");
}

function deleteSet(set) {
  if (headersConfig.value.sets.length <= 1) {
    ElMessage.warning("至少需要保留一个配置集");
    return;
  }

  ElMessageBox.confirm(`确定要删除 "${set.name}" 吗？`, "提示", {
    type: "warning",
  })
    .then(() => {
      const index = headersConfig.value.sets.findIndex((s) => s.id === set.id);
      if (index !== -1) {
        headersConfig.value.sets.splice(index, 1);
        if (headersConfig.value.currentSetId === set.id) {
          headersConfig.value.currentSetId = headersConfig.value.sets[0].id;
          activeTabId.value = headersConfig.value.sets[0].id;
        }
        emitChange();
        ElMessage.success("删除成功");
      }
    })
    .catch(() => {});
}

function duplicateSet(set) {
  const newSet = {
    ...set,
    id: Date.now().toString(),
    name: `${set.name} (副本)`,
    headers: { ...set.headers },
  };
  headersConfig.value.sets.push(newSet);
  activeTabId.value = newSet.id;
  ensureHeadersArray();
  emitChange();
  ElMessage.success("复制成功");
}

function setAsDefault(set) {
  headersConfig.value.currentSetId = set.id;
  emitChange();
  ElMessage.success(`已将 "${set.name}" 设为默认`);
}

function handleTabCommand(command, set) {
  switch (command) {
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

function handleTabClick(tab) {
  // Tab 切换时的处理
}

function openPasteDialog(set) {
  currentPasteSet.value = set;
  pasteDialogRef.value?.open();
}

function handlePasteConfirm(headers, set) {
  if (!set) return;

  // 直接操作 headers 对象
  const currentHeaders = set.headers || {};

  headers.forEach((header) => {
    if (header.name) {
      currentHeaders[header.name] = header.value;
    }
  });

  set.headers = currentHeaders;
  // 清除缓存的数组
  delete set._headersArray;

  emitChange();
  ElMessage.success(`成功导入 ${headers.length} 个Header`);
}

// 打开预设选择器
function openPresetSelector(set) {
  currentPresetSet.value = set;
  showPresetSelector.value = true;
}

// 处理预设导入确认
function handlePresetConfirm(presetName) {
  if (!currentPresetSet.value) return;

  // 使用父组件的 browserPresets
  const preset = browserPresets[presetName];
  if (preset) {
    const currentHeaders = currentPresetSet.value.headers || {};

    // 合并预设到当前 headers
    Object.entries(preset).forEach(([name, value]) => {
      currentHeaders[name] = value;
    });

    currentPresetSet.value.headers = currentHeaders;
    delete currentPresetSet.value._headersArray;

    emitChange();
    ElMessage.success(
      `已导入 ${presetName} 的 ${Object.keys(preset).length} 个Headers`
    );
  }

  // 清空引用
  currentPresetSet.value = null;
}

// 导出功能也要适配
function exportSet(set) {
  // 先同步最新的 headers
  syncHeadersToObject(set);

  const exportData = {
    name: set.name,
    description: set.description || "",
    headers: set.headers,
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${set.name}_headers.json`;
  a.click();
  URL.revokeObjectURL(url);
  ElMessage.success("导出成功");
}

function previewHeaders() {
  const headers = currentHeadersSet.value.headers;
  previewHeadersList.value = Object.entries(headers).map(([name, value]) => ({
    name,
    value,
  }));
  previewDialogVisible.value = true;
}

function copyHeaders() {
  const headers = {};
  previewHeadersList.value.forEach((item) => {
    headers[item.name] = item.value;
  });
  navigator.clipboard.writeText(JSON.stringify(headers, null, 2));
  ElMessage.success("已复制到剪贴板");
}

function testCurrentHeaders() {
  const headerCount = Object.keys(currentHeadersSet.value.headers || {}).length;
  ElMessage.info(
    `当前使用配置集：${currentHeadersSet.value.name}，共 ${headerCount} 个启用的 Headers`
  );
}

function getConfig() {
  return {
    headers: currentHeaders.value,
    headersConfig: headersConfig.value,
  };
}

function emitChange() {
  emit("change", getConfig());
}

function resetConfig() {
  if (!props.provider.headersConfig) {
    const defaultSet = {
      id: "default",
      name: "默认配置",
      description: "默认浏览器配置",
      enabled: true,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "*/*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
    };

    props.provider.headersConfig = {
      enableRandom: false,
      randomInterval: 5,
      currentSetId: "default",
      sets: [defaultSet],
    };
  }

  // 确保每个 set 都有正确的数组缓存
  ensureHeadersArray();

  if (activeTabId.value === null && headersConfig.value.sets.length > 0) {
    activeTabId.value =
      headersConfig.value.currentSetId || headersConfig.value.sets[0].id;
  }
}

watch(
  () => props.provider,
  () => {
    resetConfig();
  },
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

.random-tag {
  margin-right: 12px;
}

.random-bar {
  padding: 12px 0;
  border-bottom: 1px solid #ebeef5;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
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
  cursor: pointer;
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
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background-color: #f5f7fa;
  border-radius: 6px;
  margin-top: 16px;
}

.status-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.random-hint {
  color: #909399;
  font-size: 12px;
  margin-left: 8px;
}

.status-actions {
  display: flex;
  gap: 8px;
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
  background-color: #ffffff;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  cursor: text;
  transition: all 0.2s ease;
  word-wrap: break-word;
  word-break: break-all;
  white-space: pre-wrap;
  overflow-y: auto;
  outline: none;
  max-height: 200px;
}

/* 短内容样式 */
.editable-value:not(.is-long) {
  max-height: 120px;
  overflow-y: auto;
}

/* 长内容样式 */
.editable-value.is-long {
  max-height: 240px;
  overflow-y: auto;
  background-color: #fafafa;
}

/* hover 效果 */
.editable-value:hover {
  border-color: #dcdfe6;
  background-color: #ffffff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.1);
}

/* 聚焦样式 */
.editable-value:focus {
  outline: none;
  border-color: #409eff;
  background-color: #ffffff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}

/* 针对不同浏览器的兼容性 */
.editable-value:focus-visible {
  outline: none;
}

/* 滚动条样式 */
.editable-value::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.editable-value::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.editable-value::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.editable-value::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* 空内容占位符提示 */
.editable-value:empty:before {
  content: attr(placeholder);
  color: #c0c4cc;
  pointer-events: none;
}

/* 长度提示 */
.value-length-tip {
  position: absolute;
  bottom: -18px;
  right: 4px;
  font-size: 10px;
  color: #909399;
  background: #f5f7fa;
  padding: 0 4px;
  border-radius: 4px;
  pointer-events: none;
}

/* 表格行内的特殊处理 */
:deep(.el-table__cell) {
  vertical-align: top;
}

/* 针对 Cookie 等长文本的特殊样式 */
.editable-value[data-type="cookie"] {
  font-family: "Monaco", "Menlo", "Consolas", monospace;
  font-size: 12px;
}
</style>
