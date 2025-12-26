<template>
  <div class="request-panel">
    <!-- Params 配置面板 -->
    <div v-if="activeTab == '1'">
      <div class="request-sub-bar">
        <div>Params</div>
        <ToggleButton :values="batchEditButton" @click="toggleParamBatchEdit" />
      </div>
      <DynamicEditTable
        class="dynamic-edit-table"
        :columns="paramTableColumns"
        :data="activeRequest.params"
      />
    </div>

    <!-- Header 配置面板 -->
    <div v-if="activeTab == '2'">
      <div class="header-config">
        <div class="request-sub-bar">
          <div>Headers</div>
          <ToggleButton
            :values="batchEditButton"
            @click="toggleHeaderBatchEdit"
          />
        </div>
        <div v-if="!inHeaderBatchEdit" class="dynamic-items">
          <DynamicEditTable
            class="dynamic-edit-table"
            :columns="headerTableColumns"
            :data="activeRequest.headers"
          />
        </div>
        <div v-else class="batch-edit">
          <JsonEditor v-model="headerBatchContent" height="200px" />
          <el-button size="small" type="primary" @click="saveHeaderBatchEdit">
            保存批量编辑
          </el-button>
        </div>
      </div>
    </div>

    <!-- Body 配置面板 -->
    <div v-if="activeTab == '3'">
      <div class="request-sub-bar">
        <el-radio-group v-model="bodyType" class="body-type-group">
          <el-radio label="form-data">form-data</el-radio>
          <el-radio label="x-www-form-urlencoded"
            >x-www-form-urlencoded</el-radio
          >
          <el-radio label="raw">raw (JSON)</el-radio>
        </el-radio-group>
        <ToggleButton :values="batchEditButton" @click="toggleBodyBatchEdit" />
      </div>

      <div class="body-config">
        <div v-if="bodyType !== 'raw'" class="dynamic-items">
          <DynamicEditTable
            class="dynamic-edit-table"
            v-if="!inBodyBatchEdit"
            :columns="bodyTableColumns"
            :data="activeRequest.body.form"
          />
        </div>

        <div v-else class="raw-body">
          <JsonEditor
            :model-value="activeRequest.body.raw"
            @input="handleRawChange"
            style="width: 100%; height: 80vh; margin-top: 20px"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick } from "vue";
import { useHttpsRequestStore } from "@/stores/StoreHttpsRequests";
import { ElMessage } from "element-plus";
import JsonEditor from "./JsonEditor.vue";
import DynamicEditTable from "@/components/DynamicEditTable.vue";
import ToggleButton from "@/components/ToggleButton.vue";

const requestStore = useHttpsRequestStore();
const activeRequestId = computed(() => requestStore.activeRequestId);
const activeRequest = computed(() => requestStore.activeRequest);

const props = defineProps({
  activeTab: {
    type: String,
    required: true,
    default: "1",
  },
});
// 表格列配置（保持不变，改为 const 更规范）
const paramTableColumns = ref([
  { label: "Key", field: "key", required: true },
  { label: "Value", field: "value", required: true },
  { label: "Desc", field: "desc" },
]);

const headerTableColumns = ref([
  { label: "Key", field: "key", required: true },
  { label: "Value", field: "value", required: true },
]);

const bodyTableColumns = ref([
  { label: "Key", field: "key", required: true },
  { label: "Value", field: "value", required: true },
  { label: "Desc", field: "desc" },
]);

const batchEditButton = ref(["批量编辑", "单个编辑"]);

// 响应式状态（改为 const 更规范）
const bodyType = ref("raw");
const inParamBatchEdit = ref(false);
const inHeaderBatchEdit = ref(false);
const inBodyBatchEdit = ref(false);
const headerBatchContent = ref("");

// 监听Header批量编辑模式切换，初始化/清空批量编辑内容（完善空值保护）
watch(inHeaderBatchEdit, (newVal) => {
  if (newVal && activeRequest.value) {
    // 增加 activeRequest.value 存在性判断
    // 进入批量编辑：将headers数组转换为JSON对象字符串
    const headerObj = {};
    // 兜底：若 headers 不是数组，默认赋值为空数组
    const headers = Array.isArray(activeRequest.value.headers)
      ? activeRequest.value.headers
      : [];
    headers.forEach((item) => {
      if (item?.key) {
        // 增加 item 空值判断
        headerObj[item.key] = item.value || "";
      }
    });
    headerBatchContent.value = JSON.stringify(headerObj, null, 2);
  } else {
    // 退出批量编辑：清空内容
    headerBatchContent.value = "";
  }
});
// 切换Header批量编辑模式
function toggleParamBatchEdit() {
  inHeaderBatchEdit.value = !inHeaderBatchEdit.value;
}
function toggleHeaderBatchEdit() {
  inHeaderBatchEdit.value = !inHeaderBatchEdit.value;
}
function toggleBodyBatchEdit() {
  inHeaderBatchEdit.value = !inHeaderBatchEdit.value;
}

// 保存Header批量编辑（逻辑优化，增加 activeRequest 判空）
function saveHeaderBatchEdit() {
  if (!headerBatchContent.value) {
    ElMessage.warning("请输入Header JSON内容");
    return;
  }

  try {
    const headerObj = JSON.parse(headerBatchContent.value);
    // 转换为数组格式，并更新到仓库
    const newHeaders = Object.entries(headerObj).map(([key, value]) => ({
      key,
      value: value || "",
    }));

    const currentRequestId = activeRequestId.value;
    if (currentRequestId && activeRequest.value) {
      requestStore.updateRequest(currentRequestId, {
        headers: newHeaders,
      });
      inHeaderBatchEdit.value = false;
      ElMessage.success("Header 批量编辑保存成功");
    } else {
      ElMessage.warning("当前无有效请求，无法保存");
    }
  } catch (e) {
    ElMessage.error("JSON 格式错误，请检查");
    console.error("Header批量编辑解析错误：", e);
  }
}

// 优化Raw模式更新逻辑（确保参数有效）
function handleRawChange(newRawValue) {
  const currentRequestId = activeRequestId.value;
  if (!currentRequestId || !activeRequest.value) {
    ElMessage.warning("当前无有效请求，无法更新Raw内容");
    return;
  }

  requestStore.updateRequest(currentRequestId, {
    body: {
      ...activeRequest.value.body,
      raw: newRawValue, // 使用传入的新值，同步到仓库
    },
  });
}
</script>

<style type="scss" scoped>
.request-panel {
  padding-left: 15px;
  padding-right:10px;
}
.request-sub-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  height: 40px;
  margin-bottom: 10px;
  &div {
    font-size:8px;
  }
}
:deep(.el-tabs--border-card) {
  height: 60%;
}
:deep(.el-textarea__inner) {
  height: 60%;
  resize: none;
}

:deep(.el-table__header-wrapper .el-table__header th) {
  height: 36px;
  line-height: 40px;
}

.body-type-group {
  margin-bottom: 15px;
}

.batch-edit {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
