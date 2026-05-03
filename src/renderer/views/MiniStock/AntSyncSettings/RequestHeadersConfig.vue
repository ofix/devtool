<template>
  <el-card class="config-card" shadow="never">
    <template #header>
      <div class="card-header">
        <span class="icon-text"><IconRequestHeaders />请求头</span>
        <div class="header-actions">
          <el-tag
            v-if="
              localConfig.strategy?.pollMode &&
              localConfig.strategy.pollMode !== 'off'
            "
            type="success"
            size="small"
            class="poll-tag"
          >
            {{
              localConfig.strategy.pollMode === "sequence"
                ? "顺序轮询"
                : "随机轮询"
            }}
            (每{{ localConfig.strategy.pollInterval }}次)
          </el-tag>
          <el-button link type="primary" @click="expanded = !expanded">
            {{ expanded ? "收起" : "展开" }}
          </el-button>
        </div>
      </div>
    </template>

    <el-collapse-transition>
      <div v-show="expanded">
        <div class="poll-bar">
          <el-radio-group
            v-model="localConfig.strategy.pollMode"
            @change="emitChange"
          >
            <el-radio label="off">关闭轮询</el-radio>
            <el-radio label="sequence">顺序轮询</el-radio>
            <el-radio label="random">随机轮询</el-radio>
          </el-radio-group>

          <div style="display: flex; align-items: center; margin-left: 20px">
            <span style="margin-right: 10px">轮询间隔：</span>
            <el-slider
              v-model="localConfig.strategy.pollInterval"
              :min="1"
              :max="20"
              :step="1"
              :marks="{ 1: '1次', 5: '5次', 10: '10次', 20: '20次' }"
              style="width: 260px"
              @change="emitChange"
            />
          </div>
        </div>

        <div class="headers-tabs">
          <el-tabs
            v-model="activeTabId"
            type="border-card"
            @tab-remove="handleTabRemove"
          >
            <el-tab-pane
              v-for="set in localConfig.sets"
              :key="set.id"
              :name="set.id"
              :label="set.name"
              :closable="localConfig.sets.length > 1"
            >
              <template #label>
                <div class="tab-label">
                  <span>{{ set.name }}</span>
                  <el-icon
                    v-if="set.id === localConfig.strategy.currentSetId"
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

              <div class="headers-editor">
                <div class="editor-toolbar">
                  <el-button type="primary" @click="addHeaderToSet(set.id)">
                    <el-icon><Plus /></el-icon>
                    添加 Header
                  </el-button>
                  <el-button @click="openPasteDialog(set.id)">
                    <el-icon><DocumentCopy /></el-icon>
                    从浏览器粘贴
                  </el-button>
                  <el-button @click="openPresetSelector(set.id)">
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

                <el-table
                  :data="mapSetHeaders[set.id] || []"
                  stripe
                  size="small"
                  border
                >
                  <el-table-column label="启用" width="70" align="center">
                    <template #default="{ row, $index }">
                      <el-switch
                        :model-value="row.enabled"
                        size="small"
                        @update:model-value="
                          (val) => toggleHeaderEnabled(set.id, $index, val)
                        "
                      />
                    </template>
                  </el-table-column>
                  <el-table-column label="Header 名称" width="200">
                    <template #default="{ row, $index }">
                      <el-input
                        :model-value="row.name"
                        size="small"
                        placeholder="如: User-Agent"
                        @update:model-value="
                          (val) => updateHeaderName(set.id, $index, val)
                        "
                      />
                    </template>
                  </el-table-column>
                  <el-table-column label="Header 值" min-width="350">
                    <template #default="{ row, $index }">
                      <el-input
                        :model-value="row.value"
                        type="textarea"
                        :autosize="{ minRows: 1, maxRows: 6 }"
                        size="small"
                        placeholder="请输入Header值"
                        @update:model-value="
                          (val) => updateHeaderValue(set.id, $index, val)
                        "
                      />
                    </template>
                  </el-table-column>
                  <el-table-column label="操作" width="100" fixed="right">
                    <template #default="{ $index }">
                      <el-button
                        link
                        type="danger"
                        size="small"
                        @click="removeHeaderFromSet(set.id, $index)"
                      >
                        删除
                      </el-button>
                    </template>
                  </el-table-column>
                </el-table>

                <div class="table-footer" v-if="!mapSetHeaders[set.id]?.length">
                  <el-empty
                    description="暂无 Header，点击上方按钮添加"
                    :image-size="80"
                  />
                </div>
              </div>
            </el-tab-pane>

            <el-tab-pane name="__add__">
              <template #label>
                <div class="tab-add" @click="addSet">
                  <el-icon><Plus /></el-icon>
                  <span>新建配置</span>
                </div>
              </template>
            </el-tab-pane>
          </el-tabs>
        </div>

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

        <el-dialog
          v-model="renameDialogVisible"
          title="重命名配置集"
          width="400px"
        >
          <el-input
            v-model="renamingName"
            placeholder="请输入新名称"
            @keyup.enter="confirmRename"
          />
          <template #footer>
            <el-button @click="renameDialogVisible = false">取消</el-button>
            <el-button type="primary" @click="confirmRename">确认</el-button>
          </template>
        </el-dialog>

        <PasteHeadersDialog
          ref="pasteDialogRef"
          @confirm="handlePasteConfirm"
        />
        <PresetSelector
          v-model="showPresetSelector"
          @confirm="handlePresetConfirm"
        />
      </div>
    </el-collapse-transition>
  </el-card>
</template>

<script setup>
import { ref, watch, onMounted, reactive, nextTick } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  Plus,
  Star,
  StarFilled,
  MoreFilled,
  Edit,
  CopyDocument,
  DocumentCopy,
  Download,
  Upload,
  View,
} from "@element-plus/icons-vue";
import IconRequestHeaders from "@/icons/IconRequestHeaders.vue";
import PasteHeadersDialog from "./PasteHeadersDialog.vue";
import PresetSelector from "./PresetSelector.vue";

const props = defineProps({
  provider: { type: Object, required: true },
});
const emit = defineEmits(["change"]);

// 响应式状态
const expanded = ref(true);
const activeTabId = ref("");
const renameDialogVisible = ref(false);
const renamingSet = ref(null);
const renamingName = ref("");
const previewDialogVisible = ref(false);
const previewSet = ref([]);
const pasteDialogRef = ref(null);
const currentPasteSetId = ref(null);
const showPresetSelector = ref(false);
const currentPresetSetId = ref(null);

// 本地配置
const localConfig = reactive({
  strategy: {
    pollMode: "off",
    pollInterval: 3,
    currentSetId: "",
  },
  requestCount: 0,
  sets: [],
});

// 存储每个配置集的 headers 数组（包含 enabled 状态）
// 数据结构: [{ id, name, value, enabled }]
const mapSetHeaders = reactive({});

// 浏览器预设
const browserPresets = {
  "Chrome (Windows)": {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  },
  "Firefox (Windows)": {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100100 Firefox/119.0",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.8,zh-TW;q=0.7,en-US;q=0.3,en;q=0.2",
  },
  "Safari (macOS)": {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh-Hans;q=0.9",
  },
};

// 生成唯一ID
function generateId() {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// 获取默认配置
function getDefaultConfig() {
  const defaultSetId = generateId();
  const defaultSet = {
    id: defaultSetId,
    name: "默认配置",
  };
  return {
    strategy: {
      pollMode: "off",
      pollInterval: 3,
      currentSetId: defaultSetId,
    },
    requestCount: 0,
    sets: [defaultSet],
  };
}

// 从 props 同步数据到本地
function syncFromProps() {
  const source = props.provider?.requestHeaders;

  if (!source || !source.sets || source.sets.length === 0) {
    const defaultConfig = getDefaultConfig();
    Object.assign(localConfig, defaultConfig);
    activeTabId.value = localConfig.sets[0]?.id || "";

    // 初始化默认 headers
    const defaultHeaders = [
      {
        id: generateId(),
        name: "User-Agent",
        value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        enabled: true,
      },
      {
        id: generateId(),
        name: "Accept",
        value: "*/*",
        enabled: true,
      },
      {
        id: generateId(),
        name: "Accept-Language",
        value: "zh-CN,zh;q=0.9",
        enabled: true,
      },
    ];
    mapSetHeaders[activeTabId.value] = defaultHeaders;
    syncArrayToObject(activeTabId.value);
  } else {
    // 深拷贝配置
    const copy = JSON.parse(JSON.stringify(source));
    Object.assign(localConfig, copy);
    activeTabId.value =
      localConfig.strategy.currentSetId || localConfig.sets[0]?.id || "";

    // 重建 headers 数组
    rebuildAllHeadersArrays();
  }
}

// 重建所有 headers 数组
function rebuildAllHeadersArrays() {
  Object.keys(mapSetHeaders).forEach((key) => {
    delete mapSetHeaders[key];
  });

  localConfig.sets?.forEach((set) => {
    // 检查是否已有 headers 数组格式（包含 enabled）
    if (
      set.headers &&
      Array.isArray(set.headers) &&
      set.headers[0]?.enabled !== undefined
    ) {
      // 已经是新格式
      mapSetHeaders[set.id] = set.headers.map((h) => ({ ...h }));
    } else if (
      set.headers &&
      typeof set.headers === "object" &&
      !Array.isArray(set.headers)
    ) {
      // 旧格式对象转数组
      mapSetHeaders[set.id] = objectToHeadersArray(set.headers);
    } else {
      mapSetHeaders[set.id] = [];
    }
  });
}

// 对象转数组（旧格式兼容）
function objectToHeadersArray(headersObj) {
  return Object.entries(headersObj).map(([name, value]) => ({
    id: generateId(),
    name,
    value: String(value),
    enabled: true, // 默认启用
  }));
}

// 数组转对象（只包含启用的 header）
function headersArrayToObject(arr) {
  const obj = {};
  arr.forEach((item) => {
    if (item.enabled && item.name && item.name.trim()) {
      obj[item.name.trim()] = item.value;
    }
  });
  return obj;
}

// 获取完整对象格式（包含禁用的，用于保存完整状态）
function getFullHeadersObject(arr) {
  const obj = {};
  arr.forEach((item) => {
    if (item.name && item.name.trim()) {
      obj[item.name.trim()] = {
        value: item.value,
        enabled: item.enabled,
      };
    }
  });
  return obj;
}

// 从完整对象恢复数组
function fullObjectToHeadersArray(fullObj) {
  return Object.entries(fullObj).map(([name, data]) => ({
    id: generateId(),
    name,
    value: data.value || data, // 兼容旧格式
    enabled: typeof data === "object" ? data.enabled !== false : true,
  }));
}

// 同步指定配置集的数组到对象（只保存启用的）
function syncArrayToObject(setId) {
  const set = localConfig.sets?.find((s) => s.id === setId);
  if (!set) return;

  const arr = mapSetHeaders[setId];
  if (arr) {
    // 只保存启用的 headers 到 headers 字段
    set.headers = headersArrayToObject(arr);

    // 可选：保存完整状态到另一个字段（用于保留禁用状态）
    // set._fullHeaders = getFullHeadersObject(arr);
  }
  emitChange();
}

// 切换 Header 启用状态
function toggleHeaderEnabled(setId, index, enabled) {
  const arr = mapSetHeaders[setId];
  if (!arr || index < 0 || index >= arr.length) return;

  arr[index].enabled = enabled;
  mapSetHeaders[setId] = [...arr]; // 触发响应式更新
  syncArrayToObject(setId);
}

// 添加 Header
function addHeaderToSet(setId) {
  const arr = mapSetHeaders[setId] || [];
  arr.push({
    id: generateId(),
    name: "",
    value: "",
    enabled: true,
  });
  mapSetHeaders[setId] = [...arr];
  syncArrayToObject(setId);
  ElMessage.success("已添加新的 Header");
}

// 删除 Header
function removeHeaderFromSet(setId, index) {
  const arr = mapSetHeaders[setId];
  if (!arr || index < 0 || index >= arr.length) return;

  arr.splice(index, 1);
  mapSetHeaders[setId] = [...arr];
  syncArrayToObject(setId);
  ElMessage.success("已删除 Header");
}

// 更新 Header 名称
function updateHeaderName(setId, index, newName) {
  const arr = mapSetHeaders[setId];
  if (!arr || index < 0 || index >= arr.length) return;

  if (!newName || !newName.trim()) {
    ElMessage.warning("Header 名称不能为空");
    return;
  }

  newName = newName.trim();
  const oldName = arr[index].name;

  // 检查是否重名（排除自身）
  if (oldName !== newName) {
    const isDuplicate = arr.some(
      (item, idx) => idx !== index && item.name === newName
    );
    if (isDuplicate) {
      ElMessage.warning(`Header "${newName}" 已存在`);
      return;
    }
  }

  arr[index].name = newName;
  mapSetHeaders[setId] = [...arr];
  syncArrayToObject(setId);
}

// 更新 Header 值
function updateHeaderValue(setId, index, newValue) {
  const arr = mapSetHeaders[setId];
  if (!arr || index < 0 || index >= arr.length) return;

  arr[index].value = newValue;
  syncArrayToObject(setId);
}

// 添加配置集
function addSet() {
  const newSet = {
    id: generateId(),
    name: `配置${localConfig.sets.length + 1}`,
    headers: { "User-Agent": "Mozilla/5.0" },
  };

  localConfig.sets.push(newSet);
  mapSetHeaders[newSet.id] = objectToHeadersArray(newSet.headers);

  // 等待 DOM 渲染完成
  setTimeout(() => {
    activeTabId.value = newSet.id;
    emitChange();
  }, 0);
}

// 删除配置集
function handleTabRemove(setId) {
  if (localConfig.sets.length <= 1) {
    ElMessage.warning("至少保留一个配置集");
    return;
  }

  const set = localConfig.sets.find((s) => s.id === setId);
  if (!set) return;

  ElMessageBox.confirm(`确定删除【${set.name}】吗？`, "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(() => {
      const index = localConfig.sets.findIndex((s) => s.id === setId);
      if (index !== -1) {
        localConfig.sets.splice(index, 1);
        delete mapSetHeaders[setId];

        if (localConfig.strategy.currentSetId === setId) {
          localConfig.strategy.currentSetId = localConfig.sets[0].id;
        }

        if (activeTabId.value === setId) {
          activeTabId.value = localConfig.sets[0].id;
        }

        emitChange();
        ElMessage.success("删除成功");
      }
    })
    .catch(() => {});
}

// 复制配置集
function duplicateSet(set) {
  const newSetId = generateId();
  const sourceArr = mapSetHeaders[set.id] || [];
  const newSet = {
    id: newSetId,
    name: `${set.name}(副本)`,
    headers: {},
  };
  localConfig.sets.push(newSet);

  // 深拷贝数组
  mapSetHeaders[newSetId] = sourceArr.map((item) => ({
    ...item,
    id: generateId(),
  }));

  syncArrayToObject(newSetId);
  activeTabId.value = newSetId;
  emitChange();
  ElMessage.success("复制成功");
}

// 设为默认
function setAsDefault(set) {
  localConfig.strategy.currentSetId = set.id;
  emitChange();
  ElMessage.success("已设为默认使用");
}

// Tab 命令处理
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
    ElMessage.success("重命名成功");
  }
  renameDialogVisible.value = false;
  renamingSet.value = null;
}

// 粘贴
function openPasteDialog(setId) {
  currentPasteSetId.value = setId;
  pasteDialogRef.value?.open();
}

function handlePasteConfirm(headers) {
  if (!currentPasteSetId.value) return;

  const arr = mapSetHeaders[currentPasteSetId.value] || [];

  headers.forEach((item) => {
    if (item.name && item.name.trim()) {
      const existing = arr.find((h) => h.name === item.name.trim());
      if (existing) {
        existing.value = item.value || "";
        existing.enabled = true;
      } else {
        arr.push({
          id: generateId(),
          name: item.name.trim(),
          value: item.value || "",
          enabled: true,
        });
      }
    }
  });

  mapSetHeaders[currentPasteSetId.value] = [...arr];
  syncArrayToObject(currentPasteSetId.value);
  ElMessage.success(`成功导入 ${headers.length} 个Header`);
  currentPasteSetId.value = null;
}

// 预设
function openPresetSelector(setId) {
  currentPresetSetId.value = setId;
  showPresetSelector.value = true;
}

function handlePresetConfirm(name) {
  const preset = browserPresets[name];
  if (!preset || !currentPresetSetId.value) return;

  const arr = mapSetHeaders[currentPresetSetId.value] || [];

  Object.entries(preset).forEach(([key, value]) => {
    const existing = arr.find((h) => h.name === key);
    if (existing) {
      existing.value = value;
      existing.enabled = true;
    } else {
      arr.push({
        id: generateId(),
        name: key,
        value,
        enabled: true,
      });
    }
  });

  mapSetHeaders[currentPresetSetId.value] = [...arr];
  syncArrayToObject(currentPresetSetId.value);
  ElMessage.success(`已导入预设: ${name}`);
  currentPresetSetId.value = null;
  showPresetSelector.value = false;
}

// 导出
function exportSet(set) {
  // 导出时只导出启用的 headers
  const enabledHeaders = {};
  const arr = mapSetHeaders[set.id] || [];
  arr.forEach((item) => {
    if (item.enabled && item.name && item.name.trim()) {
      enabledHeaders[item.name.trim()] = item.value;
    }
  });

  const data = {
    name: set.name,
    headers: enabledHeaders,
    exportTime: new Date().toISOString(),
  };

  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${set.name}_headers.json`;
    a.click();
    URL.revokeObjectURL(url);
    ElMessage.success("导出成功");
  } catch (error) {
    console.error("导出失败:", error);
    ElMessage.error("导出失败");
  }
}

// 预览（只显示启用的）
function previewHeaders() {
  const currentId = localConfig.strategy.currentSetId;
  const arr = mapSetHeaders[currentId] || [];

  previewSet.value = arr
    .filter((item) => item.enabled && item.name && item.name.trim())
    .map(({ name, value }) => ({ name, value }));

  previewDialogVisible.value = true;
}

// 复制 Headers（只复制启用的）
function copyHeaders() {
  try {
    const obj = {};
    previewSet.value.forEach((item) => {
      obj[item.name] = item.value;
    });
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    ElMessage.success("已复制到剪贴板");
  } catch (error) {
    ElMessage.error("复制失败");
  }
}

// 触发变更
function emitChange() {
  // 确保所有数据都已同步
  localConfig.sets.forEach((set) => {
    const arr = mapSetHeaders[set.id];
    if (arr) {
      set.headers = headersArrayToObject(arr);
    }
  });

  const copy = JSON.parse(JSON.stringify(localConfig));
  emit("change", copy);
}

// 获取配置
function getConfig() {
  return JSON.parse(JSON.stringify(localConfig));
}

// 重置配置
function resetConfig() {
  syncFromProps();
}

// 监听 props 变化
watch(
  () => props.provider?.requestHeaders,
  () => {
    syncFromProps();
  },
  { deep: true }
);

// 初始化
onMounted(() => {
  syncFromProps();
});

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
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.headers-tabs {
  margin-bottom: 16px;
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
</style>
