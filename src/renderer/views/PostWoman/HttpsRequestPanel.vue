<!-- HttpsRequestPanel.vue（保持原界面布局和交互，功能不变） -->
<template>
  <el-tabs v-model="activeTab" type="border-card" class="config-tabs">
    <!-- Params 配置面板 -->
    <el-tab-pane label="Params" name="params">
      <DynamicEditTable
        v-if="!inParamBatchEdit"
        :columns="paramTableColumns"
        :data="activeRequest.params"
      />
    </el-tab-pane>
    <!-- Header 配置面板 -->
    <el-tab-pane label="Headers" name="headers">
      <div class="header-config">
        <!-- 批量编辑按钮 -->
        <div class="header-actions">
          <el-button size="small" @click="toggleHeaderBatchEdit">
            {{ inHeaderBatchEdit ? "退出批量编辑" : "批量编辑" }}
          </el-button>
        </div>

        <!-- 动态 Header 条目（仅显示 Key/Value） -->
        <div v-if="!inHeaderBatchEdit" class="dynamic-items">
          <DynamicEditTable
            v-if="!inHeaderBatchEdit"
            :columns="headerTableColumns"
            :data="activeRequest.headers"
          />
        </div>

        <!-- Header 批量编辑模式 -->
        <div v-else class="batch-edit">
          <JsonEditor :data="headerBatchContent" height="200px" />
          <el-button size="small" type="primary" @click="saveHeaderBatchEdit">
            保存批量编辑
          </el-button>
        </div>
      </div>
    </el-tab-pane>

    <!-- Body 配置面板 -->
    <el-tab-pane label="Body" name="body">
      <div class="body-config">
        <!-- Body 类型切换 -->
        <el-radio-group v-model="bodyType" class="body-type-group">
          <el-radio label="form-data">form-data</el-radio>
          <el-radio label="x-www-form-urlencoded"
            >x-www-form-urlencoded</el-radio
          >
          <el-radio label="raw">raw (JSON)</el-radio>
        </el-radio-group>

        <!-- form-data / x-www-form-urlencoded 模式 -->
        <div v-if="bodyType !== 'raw'" class="dynamic-items">
          <DynamicEditTable
            v-if="!inBodyBatchEdit"
            :columns="bodyTableColumns"
            :data="activeRequest.body.form"
          />
        </div>

        <!-- Raw JSON 模式 -->
        <div v-else class="raw-body">
          <JsonEditor
            :data="activeRequest.body.raw"
            style="width: 100%; height: 80vh; margin-top: 20px"
          />
        </div>
      </div>
    </el-tab-pane>
  </el-tabs>
</template>

<script setup>
import { computed,ref } from "vue";
import { useHttpsRequestStore } from "@/stores/StoreHttpsRequests";
import JsonEditor from "./JsonEditor.vue";
import DynamicEditTable from "@/components/DynamicEditTable.vue";

// 获取Pinia仓库
const requestStore = useHttpsRequestStore();
const activeRequestId = computed(() => requestStore.activeRequestId);
const activeRequest = computed(() => requestStore.activeRequest);

// ==================== 表格列配置（请求配置区） ====================
const headerTableColumns = ref([
  { label: "Key", field: "key", required: true },
  { label: "Value", field: "value", required: true },
]);

const paramTableColumns = ref([
  { label: "Key", field: "key", required: true },
  { label: "Value", field: "value", required: true },
  { label: "Desc", field: "desc" },
]);

const bodyTableColumns = ref([
  { label: "Key", field: "key", required: true },
  { label: "Value", field: "value", required: true },
  { label: "Desc", field: "desc" },
]);

const activeTab = ref("params");
const bodyType = ref("raw");
const inParamBatchEdit = ref(false);
const inHeaderBatchEdit = ref(false);
const inBodyBatchEdit = ref(false);


// ==================== 请求头操作（完全还原原有逻辑） ====================
function handleAddHeader() {
  const newHeaders = [...activeRequest.value.headers, { key: "", value: "" }];
  requestStore.updateRequest(activeRequestId.value, { headers: newHeaders });
}

function handleRemoveHeader(index) {
  const newHeaders = activeRequest.value.headers.filter((_, i) => i !== index);
  requestStore.updateRequest(activeRequestId.value, { headers: newHeaders });
}

function handleHeaderChange() {
  requestStore.updateRequest(activeRequestId.value, {
    headers: [...activeRequest.value.headers],
  });
}



// 切换Header批量编辑模式
const toggleHeaderBatchEdit = () => {
  inHeaderBatchEdit.value = !inHeaderBatchEdit.value;
  return inHeaderBatchEdit.value;
};

// 保存Header批量编辑
const saveHeaderBatchEdit = () => {
  try {
    const headerObj = JSON.parse(headerBatchContent.value);
    requestBuilder.headers = Object.entries(headerObj).map(([key, value]) => ({
      key,
      value,
    }));
    inHeaderBatchEdit.value = false;
    ElMessage.success("Header 批量编辑保存成功");
  } catch (e) {
    ElMessage.error("JSON 格式错误，请检查");
  }
};

// ==================== 表单数据操作（完全还原原有逻辑） ====================
function handleAddFormData() {
  const newFormData = [
    ...activeRequest.value.body.formData,
    { key: "", value: "" },
  ];
  requestStore.updateRequest(activeRequestId.value, {
    body: { ...activeRequest.value.body, formData: newFormData },
  });
}

function handleRemoveFormData(index) {
  const newFormData = activeRequest.value.body.formData.filter(
    (_, i) => i !== index
  );
  requestStore.updateRequest(activeRequestId.value, {
    body: { ...activeRequest.value.body, formData: newFormData },
  });
}

function handleFormDataChange() {
  requestStore.updateRequest(activeRequestId.value, {
    body: {
      ...activeRequest.value.body,
      formData: [...activeRequest.value.body.formData],
    },
  });
}

// ==================== Raw JSON操作（完全还原原有逻辑） ====================
function handleRawChange() {
  requestStore.updateRequest(activeRequestId.value, {
    body: { ...activeRequest.value.body, raw: activeRequest.value.body.raw },
  });
}
</script>

<style scoped>
/* 保持原有样式，不破坏界面 */
:deep(.el-tabs--border-card) {
  height: 100%;
}
:deep(.el-textarea__inner) {
  height: 100%;
  resize: none;
}
</style>
