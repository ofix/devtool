<template>
  <div class="postwoman-container">
    <div class="request-header">
      <el-input
        v-model="requestBuilder.name"
        placeholder="Untitled Request"
        class="url-input"
        clearable
      />
      <el-button type="primary" @click="saveRequest">
        <template #icon><IconLink /></template>
        保存
      </el-button>
    </div>
    <div class="request-header">
      <el-select v-model="requestBuilder.method" class="method-select">
        <el-option label="GET" value="GET" />
        <el-option label="POST" value="POST" />
        <el-option label="PUT" value="PUT" />
        <el-option label="PATCH" value="PATCH" />
        <el-option label="DELETE" value="DELETE" />
      </el-select>
      <el-input
        v-model="requestBuilder.url"
        placeholder="请输入请求URL（如 https://api.example.com/path）"
        class="url-input"
        @keyup.enter="sendRequest"
        clearable
      />
      <el-button type="primary" @click="sendRequest">
        <template #icon><IconSend /></template>
        发送
      </el-button>
    </div>

    <el-tabs v-model="activeTab" type="border-card" class="config-tabs">
      <!-- Params 配置面板 -->
      <el-tab-pane label="Params" name="params">
        <DynamicEditTable
          v-if="!inParamBatchEdit"
          :columns="requestBuilder.params"
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

          <!-- 动态 Header 条目 -->
          <div v-if="!inHeaderBatchEdit" class="dynamic-items">
            <DynamicEditTable
              v-if="!inHeaderBatchEdit"
              :columns="requestBuilder.headers"
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
              :columns="requestBuilder.body"
            />
          </div>

          <!-- Raw JSON 模式 -->
          <div v-else class="raw-body">
            <JsonEditor
              :data="requestBuilder.body.raw"
              style="width: 100%; height: 80vh; margin-top: 20px"
            />
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 底部响应展示区 -->
    <div class="response-container">
      <div class="response-header">
        <span>响应结果</span>
        <el-button size="small" @click="formatResponse">格式化JSON</el-button>
        <el-button size="small" @click="clearResponse">清空响应</el-button>
      </div>
      <JsonEditor
        :data="requestBuilder.response"
        :read-only="true"
        style="width: 100%; height: 80vh; margin-top: 20px"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, nextTick } from "vue";
import { ElMessage } from "element-plus";
import { ElTable, ElTableColumn, ElInput, ElButton } from "element-plus";
import JsonEditor from "./JsonEditor.vue";
import DynamicEditTable from "@/components/DynamicEditTable.vue";
import IconSend from "@/components/icons/IconSend.vue";
import IconLink from "@/components/icons/IconLink.vue";
// 响应式状态
const requestBuilder = reactive({
  name: "Untitled Request",
  method: "GET",
  url: "",
  params: [
    { field: "Key", label: "Key", type: "string", required: true },
    { field: "Value", label: "Value", type: "string", required: true },
    { field: "Desc", label: "Description", type: "string", required: true },
  ],
  headers: [
    { field: "Key", label: "Key", type: "string", required: true },
    { field: "Value", label: "Value", type: "string", required: true },
    { field: "Desc", label: "Description", type: "string", required: true },
  ],
  body: [
    { field: "Key", label: "Key", type: "string", required: true },
    { field: "Value", label: "Value", type: "string", required: true },
    { field: "Desc", label: "Description", type: "string", required: true },
  ],
  response: "",
});
const activeTab = ref("params");
const bodyType = ref("raw");
const inParamBatchEdit = ref(false);
const inHeaderBatchEdit = ref(false);
const inBodyBatchEdit = ref(false);

// Header 批量编辑内容（JSON 格式）
const headerBatchContent = ref("");

// 监听 Header 批量编辑模式切换
watch(inHeaderBatchEdit, (val) => {
  if (val) {
    // 进入批量编辑：将 Header 数组转为 JSON 字符串
    const headerObj = {};
    requestBuilder.headers.forEach((item) => {
      if (item.key) headerObj[item.key] = item.value;
    });
    headerBatchContent.value = JSON.stringify(headerObj, null, 2);
  }
});

// ------------------------  事件响应  ------------------------
// 保存请求
function saveRequest() {
  // 此处可实现保存请求逻辑，如保存到本地文件或数据库
  ElMessage.success("请求已保存（功能待实现）");
}

// 发送请求
async function sendRequest() {
  if (!requestBuilder.url) {
    ElMessage.error("请输入请求 URL");
    return;
  }

  try {
    const urlObj = new URL(requestBuilder.url);
    const host = urlObj.hostname;
    const path = urlObj.pathname + urlObj.search;

    // 构造请求头
    const headers = {};
    requestBuilder.headers.forEach((item) => {
      if (item.key) headers[item.key] = item.value;
    });

    // 构造请求体
    let data = null;
    let contentType = headers["Content-Type"] || "application/json";
    if (["POST", "PUT", "PATCH"].includes(requestBuilder.method)) {
      if (bodyType.value === "raw") {
        data = JSON.parse(requestBuilder.body.raw);
        contentType = "application/json";
      } else {
        const formObj = {};
        requestBuilder.body.formData.forEach((item) => {
          if (item.key) formObj[item.key] = item.value;
        });
        data = formObj;
        contentType =
          bodyType.value === "form-data"
            ? "multipart/form-data"
            : "application/x-www-form-urlencoded";
      }
    }

    // 调用 httpsClient 发送请求
    let method = requestBuilder.method.toLowerCase();
    let result = {};
    let options = {
      host,
      path,
      data,
      contentType,
      headers,
      ignoreSslError: true,
    };
    if (method == "get") {
      result = await window.channel.doGet(options);
    } else if (method == "post") {
      result = await window.channel.doPost(options);
    } else if (method == "patch") {
      result = await window.channel.doPatch(options);
    } else if (method == "put") {
      result = await window.channel.doPut(options);
    } else if (method == "delete") {
      result = await window.channel.doDelete(options);
    }
    console.log(result);
    requestBuilder.response = result.responseText;
    console.log("Response:", result.responseText);
  } catch (e) {
    requestBuilder.response = `请求失败: ${e.message}`;
  }
}

function toggleHeaderBatchEdit() {
  return (inHeaderBatchEdit.value = !inHeaderBatchEdit.value);
}
function saveHeaderBatchEdit() {
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
}

// 响应操作方法
function formatResponse() {
  try {
    const parsed = JSON.parse(requestBuilder.response);
    requestBuilder.response = JSON.stringify(parsed, null, 2);
  } catch (e) {
    ElMessage.warning("非 JSON 格式，无法格式化");
  }
}
function clearResponse() {
  requestBuilder.response = "";
}
function clearRequest() {
  requestBuilder.method = "GET";
  requestBuilder.url = "";
  requestBuilder.params = [{ key: "", value: "", desc: "" }];
  requestBuilder.headers = [{ key: "", value: "", desc: "" }];
  requestBuilder.body.formData = [{ key: "", value: "" }];
  requestBuilder.body.raw = '{\n  "key": "value"\n}';
  requestBuilder.response = "";
}
</script>

<style scoped>
.postwoman-container {
  width: 100%;
  height: 100%;
  display: flex;
  background-color: #fff;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  box-sizing: border-box;
}

/* 请求控制栏样式 */
.request-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.method-select {
  width: 100px;
}
.url-input {
  flex: 1;
}

/* 配置标签页样式 */
.config-tabs {
  flex: 1;
}
.header-config,
.body-config {
  padding: 12px;
}
.header-actions {
  margin-bottom: 12px;
}
.dynamic-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 表格单元格内容容器：保证文字和输入框尺寸一致 */
.cell-content {
  width: 100%;
  height: 100%;
  position: relative;
}

/* 纯文字显示样式 */
.text-content {
  display: block;
  width: 100%;
  height: 38px; /* 与 Element Plus 输入框高度一致 */
  line-height: 38px;
  padding: 0 15px; /* 与输入框内边距一致 */
  box-sizing: border-box;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

/* 编辑输入框：与单元格完全贴合 */
.edit-input {
  top: 1px;
  left: 1px;
  width: calc(100% - 2px);
  height: 40px;
  padding: 0;
  margin: 0;
  border: none;
  box-shadow: none;
}

/* 消除输入框聚焦时的默认边框（可选，根据需求调整） */
.edit-input :deep(.el-input__wrapper) {
  box-shadow: none;
  border: none;
  padding: 0 15px;
  height: 100%;
  box-sizing: border-box;
}

/* 删除按钮：默认隐藏，悬浮时显示 */
.delete-btn {
  color: #f56c6c;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none; /* 隐藏时不触发点击 */
}

.delete-btn.show {
  opacity: 1;
  pointer-events: auto; /* 显示时允许点击 */
}

/* 表格行高度：与输入框匹配 */
:deep(.el-table__row) {
  height: 38px;
}

:deep(.el-table__cell) {
  padding: 0;
  height: 100%;
  box-sizing: border-box;
}

.item-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.item-key {
  width: 200px;
}
.item-value {
  width: 300px;
}
.item-desc {
  flex: 1;
}
.batch-edit {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.body-type-group {
  margin-bottom: 12px;
}
.raw-body {
  width: 100%;
}

/* 响应展示区样式 */
.response-container {
  width: 100%;
  border: 1px solid #e6e6e6;
  border-radius: 4px;
  overflow: hidden;
}
.response-header {
  padding: 8px 12px;
  background-color: #f5f5f5;
  border-bottom: 1px solid #e6e6e6;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
