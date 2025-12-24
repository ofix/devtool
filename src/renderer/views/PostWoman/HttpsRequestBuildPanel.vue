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

    <el-splitter layout="vertical">
      <!-- 请求面板 -->
      <el-splitter-panel :min="160" :size="160">
        <el-tabs v-model="activeTab" type="border-card" class="config-tabs">
          <!-- Params 配置面板 -->
          <el-tab-pane label="Params" name="params">
            <DynamicEditTable
              v-if="!inParamBatchEdit"
              :columns="paramTableColumns"
              :data="requestBuilder.params"
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
                  :data="requestBuilder.headers"
                />
              </div>

              <!-- Header 批量编辑模式 -->
              <div v-else class="batch-edit">
                <JsonEditor :data="headerBatchContent" height="200px" />
                <el-button
                  size="small"
                  type="primary"
                  @click="saveHeaderBatchEdit"
                >
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
                  :data="requestBuilder.body.items"
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
      </el-splitter-panel>

      <!-- 响应面板 -->
      <el-splitter-panel>
        <!-- 响应内容面板 -->
        <div class="response-container">
          <!-- 主标签页：Body/Cookies/Headers（Postman主题色改造） -->
          <el-tabs
            v-model="activeResponseTab"
            class="response-main-tabs"
            tab-position="top"
          >
            <el-tab-pane label="Body" name="response-body">
              <div class="body-tab-content">
                <!-- Body子标签：图标+文字 互斥按钮组（核心调整） -->
                <div class="body-toolbar">
                  <el-radio-group
                    v-model="activeBodySubTab"
                    class="icon-text-button-group"
                  >
                    <el-radio-button label="pretty" class="icon-text-btn">
                      <IconSend class="btn-icon" />
                      <span class="btn-text">格式化</span>
                    </el-radio-button>
                    <el-radio-button label="raw" class="icon-text-btn">
                      <IconSend class="btn-icon" />
                      <span class="btn-text">原始数据</span>
                    </el-radio-button>
                    <el-radio-button label="preview" class="icon-text-btn">
                      <IconSend class="btn-icon" />
                      <span class="btn-text">预览</span>
                    </el-radio-button>
                  </el-radio-group>
                  <div class="body-format-select">
                    <el-select
                      v-model="responseFormat"
                      size="small"
                      @change="handleFormatChange"
                    >
                      <el-option label="JSON" value="json" />
                      <el-option label="XML" value="xml" />
                      <el-option label="HTML" value="html" />
                      <el-option label="Text" value="text" />
                    </el-select>
                  </div>
                </div>

                <div class="body-content-area">
                  <!-- Pretty模式 -->
                  <div
                    v-if="activeBodySubTab === 'pretty'"
                    class="content-pretty"
                  >
                    <JsonEditor
                      ref="prettyEditorRef"
                      :data="formattedResponse"
                      :read-only="true"
                      style="width: 100%; height: 75vh"
                    />
                  </div>

                  <!-- Raw模式 -->
                  <div v-if="activeBodySubTab === 'raw'" class="content-raw">
                    <JsonEditor
                      ref="rawEditorRef"
                      :data="requestBuilder.response.body"
                      :read-only="true"
                      style="width: 100%; height: 75vh"
                    />
                  </div>

                  <!-- Preview模式 -->
                  <div
                    v-if="activeBodySubTab === 'preview'"
                    class="content-preview"
                  >
                    <div
                      class="preview-container"
                      v-if="requestBuilder.response.previewData"
                    >
                      <vue-json-pretty
                        :data="requestBuilder.response.previewData"
                        :deep="3"
                        show-expand-all
                        show-copy
                        show-icon
                        show-length
                        theme="light"
                        class="json-pretty-container"
                      ></vue-json-pretty>
                    </div>
                    <div class="preview-empty" v-else>
                      {{
                        requestBuilder.response.body ||
                        "暂无响应数据，或无法预览该格式内容"
                      }}
                    </div>
                  </div>
                </div>
              </div>
            </el-tab-pane>

            <!-- Cookies 展示（标签带数量圆角矩形：Postman主题色） -->
            <el-tab-pane name="response-cookies">
              <template #label>
                <span class="tab-label">
                  Cookies
                  <span
                    class="count-badge"
                    v-if="requestBuilder.response.cookies.length"
                    >{{ requestBuilder.response.cookies.length }}</span
                  >
                </span>
              </template>
              <div class="cookies-content">
                <el-table
                  :data="requestBuilder.response.cookies"
                  border
                  stripe
                  style="width: 100%"
                  empty-text="暂无Cookie数据"
                >
                  <el-table-column prop="name" label="Name" min-width="150" />
                  <el-table-column prop="value" label="Value" min-width="200" />
                  <el-table-column
                    prop="domain"
                    label="Domain"
                    min-width="150"
                  />
                  <el-table-column prop="path" label="Path" min-width="100" />
                  <el-table-column
                    prop="expires"
                    label="Expires"
                    min-width="180"
                  />
                </el-table>
              </div>
            </el-tab-pane>

            <!-- Headers 展示（标签带数量圆角矩形：Postman主题色） -->
            <el-tab-pane name="response-headers">
              <template #label>
                <span class="tab-label">
                  Headers
                  <span
                    class="count-badge"
                    v-if="requestBuilder.response.headers.length"
                    >{{ requestBuilder.response.headers.length }}</span
                  >
                </span>
              </template>
              <div class="headers-content">
                <el-table
                  :data="requestBuilder.response.headers"
                  border
                  stripe
                  style="width: 100%"
                  empty-text="暂无Header数据"
                >
                  <el-table-column prop="key" label="Key" min-width="150" />
                  <el-table-column prop="value" label="Value" min-width="300" />
                </el-table>
              </div>
            </el-tab-pane>
          </el-tabs>
        </div>
      </el-splitter-panel>
    </el-splitter>
  </div>
</template>

<script setup>
import { ref, reactive, watch, nextTick } from "vue";
import { ElMessage } from "element-plus";
import JsonEditor from "./JsonEditor.vue";
import DynamicEditTable from "@/components/DynamicEditTable.vue";
import IconSend from "@/components/icons/IconSend.vue";
import IconLink from "@/components/icons/IconLink.vue";
import VueJsonPretty from "vue-json-pretty";
import "vue-json-pretty/lib/styles.css";
// ==================== 表格列配置（请求配置区） ====================
const headerTableColumns = ref([
  { label: "Key", prop: "key", required: true },
  { label: "Value", prop: "value", required: true },
]);

const paramTableColumns = ref([
  { label: "Key", prop: "key", required: true },
  { label: "Value", prop: "value", required: true },
  { label: "Desc", prop: "desc" },
]);

const bodyTableColumns = ref([
  { label: "Key", prop: "key", required: true },
  { label: "Value", prop: "value", required: true },
  { label: "Desc", prop: "desc" },
]);

// ==================== 响应式状态 ====================
const requestBuilder = reactive({
  name: "Untitled Request",
  method: "GET",
  url: "",
  params: [{ key: "", value: "", desc: "" }],
  headers: [{ key: "", value: "" }],
  // 修复：body改为对象类型，包含items（原数组数据）和raw（JSON字符串）
  body: {
    items: [{ key: "", value: "", desc: "" }],
    raw: "{}",
  },
  response: {
    body: "",
    cookies: [],
    headers: [],
    previewData: null,
  },
});

const activeTab = ref("params");
const bodyType = ref("raw");
const inParamBatchEdit = ref(false);
const inHeaderBatchEdit = ref(false);
const inBodyBatchEdit = ref(false);

// 响应区控制状态
const activeResponseTab = ref("response-body");
const activeBodySubTab = ref("pretty");
const responseFormat = ref("json");
const formattedResponse = ref("");

// 编辑器Ref
const prettyEditorRef = ref(null);
const rawEditorRef = ref(null);

// Header 批量编辑内容
const headerBatchContent = ref("");

// ==================== 工具函数（提前定义，避免初始化顺序问题） ====================
// 根据格式类型格式化响应数据（先定义函数，再使用）
const formatResponseByType = () => {
  const rawData = requestBuilder.response.body || "";
  if (!rawData) {
    formattedResponse.value = "";
    return;
  }

  try {
    switch (responseFormat.value) {
      case "json":
        const jsonObj = JSON.parse(rawData);
        formattedResponse.value = JSON.stringify(jsonObj, null, 2);
        break;
      case "xml":
        formattedResponse.value = formatXml(rawData);
        break;
      case "html":
        formattedResponse.value = formatHtml(rawData);
        break;
      case "text":
        formattedResponse.value = rawData;
        break;
      default:
        formattedResponse.value = rawData;
    }
  } catch (e) {
    formattedResponse.value = rawData;
    ElMessage.warning(
      `无法格式化${responseFormat.value}格式数据：${e.message}`
    );
  }
};

// 简易XML格式化
const formatXml = (xmlStr) => {
  if (!xmlStr) return "";
  let formatted = "";
  let indentLevel = 0;
  const indent = "  ";
  const lines = xmlStr.replace(/>\s*</g, ">\n<").split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^<\/[^>]+>/)) {
      indentLevel--;
    }
    formatted += indent.repeat(indentLevel) + line.trim() + "\n";
    if (line.match(/^<[^\/>]+>/)) {
      indentLevel++;
    }
  }
  return formatted.trim();
};

// 简易HTML格式化
const formatHtml = (htmlStr) => {
  if (!htmlStr) return "";
  const prettier = window.prettier || null;
  if (prettier && prettier.format) {
    try {
      return prettier.format(htmlStr, {
        parser: "html",
        tabWidth: 2,
        useTabs: false,
      });
    } catch (e) {
      console.warn("Prettier格式化HTML失败，使用原始格式");
    }
  }
  let formatted = "";
  let indentLevel = 0;
  const indent = "  ";
  const lines = htmlStr.replace(/>\s*</g, ">\n<").split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^<\/[^>]+>/)) {
      indentLevel--;
    }
    formatted += indent.repeat(indentLevel) + line.trim() + "\n";
    if (line.match(/^<[^\/>]+>/)) {
      indentLevel++;
    }
  }
  return formatted.trim();
};

// 生成Preview模式数据
const generatePreviewData = () => {
  const rawData = requestBuilder.response.body || "";
  if (!rawData) {
    requestBuilder.response.previewData = null;
    return;
  }

  try {
    switch (responseFormat.value) {
      case "json":
        requestBuilder.response.previewData = JSON.parse(rawData);
        break;
      case "xml":
        requestBuilder.response.previewData = {
          xml: "暂不支持XML预览，可引入xml2js库实现",
        };
        break;
      case "html":
        requestBuilder.response.previewData = {
          html: "HTML预览可扩展为iframe直接渲染，此处为JSON树形演示",
        };
        break;
      case "text":
        requestBuilder.response.previewData = { text: rawData };
        break;
      default:
        requestBuilder.response.previewData = null;
    }
  } catch (e) {
    requestBuilder.response.previewData = {
      error: "无法解析为可预览格式",
      raw: rawData,
    };
  }
};

// ==================== 监听逻辑（在工具函数之后定义） ====================
// 监听Header批量编辑模式切换
watch(inHeaderBatchEdit, (val) => {
  if (val) {
    const headerObj = {};
    requestBuilder.headers.forEach((item) => {
      if (item.key) headerObj[item.key] = item.value;
    });
    headerBatchContent.value = JSON.stringify(headerObj, null, 2);
  }
});

// 监听响应数据和格式变化（此时formatResponseByType已定义，不会报错）
watch(
  [() => requestBuilder.response.body, () => responseFormat.value],
  () => {
    formatResponseByType();
  },
  { immediate: true }
);

// 监听Body子Tab切换
watch(activeBodySubTab, async (newTab) => {
  await nextTick();
  if (newTab === "pretty" && prettyEditorRef.value) {
    prettyEditorRef.value.updateJson(formattedResponse.value);
  }
  if (newTab === "raw" && rawEditorRef.value) {
    rawEditorRef.value.updateJson(requestBuilder.response.body);
  }
  if (newTab === "preview") {
    generatePreviewData();
  }
});

// ==================== 业务逻辑函数 ====================
// 保存请求
function saveRequest() {
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
    requestBuilder.response.body = result.responseText;
    requestBuilder.response.headers = Object.entries(result.headers).map(
      ([key, value]) => ({ key, value })
    );
    requestBuilder.response.cookies = result.cookies || [];
    console.log("Response:", result.responseText);
  } catch (e) {
    requestBuilder.response = `请求失败: ${e.message}`;
  }
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

// 格式化响应
const formatResponse = () => {
  responseFormat.value = "json";
  formatResponseByType();
};

// 清空响应
const clearResponse = () => {
  requestBuilder.response.body = "";
  requestBuilder.response.previewData = null;
  requestBuilder.response.cookies = [
    { name: "", value: "", domain: "", path: "", expires: "" },
  ];
  requestBuilder.response.headers = [{ key: "", value: "" }];
  formattedResponse.value = "";
};

// 清空请求
const clearRequest = () => {
  requestBuilder.method = "GET";
  requestBuilder.url = "";
  requestBuilder.params = [{ key: "", value: "", desc: "" }];
  requestBuilder.headers = [{ key: "", value: "" }];
  // 同步清空body数据
  requestBuilder.body = {
    items: [{ key: "", value: "", desc: "" }],
    raw: "{}",
  };

  // 清空响应数据
  clearResponse();
};
</script>

<style scoped>
.postwoman-container {
  width: 100%;
  height: 100vh;
  display: flex;
  background-color: #f5f5f5;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  box-sizing: border-box;
  overflow: hidden;
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
  overflow: hidden;
}
.header-config,
.body-config {
  padding: 12px;
  height: 100%;
  box-sizing: border-box;
  overflow: auto;
}
.header-actions {
  margin-bottom: 12px;
}
.dynamic-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 表格单元格内容容器 */
.cell-content {
  width: 100%;
  height: 100%;
  position: relative;
}

/* 纯文字显示样式 */
.text-content {
  display: block;
  width: 100%;
  height: 38px;
  line-height: 38px;
  padding: 0 15px;
  box-sizing: border-box;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

/* 编辑输入框 */
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

.edit-input :deep(.el-input__wrapper) {
  box-shadow: none;
  border: none;
  padding: 0 15px;
  height: 100%;
  box-sizing: border-box;
}

/* 删除按钮 */
.delete-btn {
  color: #f56c6c;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}

.delete-btn.show {
  opacity: 1;
  pointer-events: auto;
}

/* 表格样式（请求配置区） */
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
  height: calc(100% - 50px);
  overflow: hidden;
}

/* 响应展示区样式 */
.response-container {
  width: 100%;
  border: 1px solid #e6e6e6;
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
  height: 400px;
}

/* 主标签页样式改造：白色背景、选中Postman主题色文字+下划线 */
.response-main-tabs {
  --el-tabs-header-height: 36px;
  --el-tabs-nav-item-height: 36px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

:deep(.response-main-tabs .el-tabs__header) {
  background-color: #ffffff; /* 标签页背景白色 */
  border-bottom: 1px solid #e6e6e6;
  margin: 0;
}

:deep(.response-main-tabs .el-tabs__nav) {
  padding-left: 16px;
}

/* 普通标签样式 */
:deep(.response-main-tabs .el-tabs__item) {
  color: #666;
  font-size: 14px;
  position: relative;
  margin-right: 20px;
}

/* 选中标签样式：Postman主题色（蓝色）文字 + 下划线 */
:deep(.response-main-tabs .el-tabs__item.is-active) {
  color: #007bff; /* Postman主色调：亮蓝色 */
  font-weight: 500;
}

:deep(.response-main-tabs .el-tabs__item.is-active::after) {
  content: "";
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background-color: #0066cc; /* Postman辅助色：深一点的蓝色，增强层次感 */
  border-radius: 1px;
}

:deep(.response-main-tabs .el-tabs__content) {
  flex: 1;
  overflow: hidden;
  background-color: #ffffff; /* 标签内容区背景白色 */
}

/* 数量圆角矩形：Postman主题色背景、白色文字 */
.tab-label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.count-badge {
  background-color: #007bff; /* Postman主题色背景 */
  color: #ffffff; /* 白色文字 */
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px; /* 圆角矩形 */
  min-width: 20px;
  text-align: center;
  /* hover轻微加深，增强交互感 */
  transition: background-color 0.2s ease;
}

.count-badge:hover {
  background-color: #0066cc;
}

/* Body子标签：图标+文字 互斥按钮组样式（选中浅灰色底纹） */
.body-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background-color: #fafafa;
  border-bottom: 1px solid #e6e6e6;
  gap: 16px;
}

/* 图标+文字按钮组容器 */
.icon-text-button-group {
  display: flex;
  gap: 0;
}

/* 图标+文字按钮样式 */
:deep(.icon-text-button-group .el-radio-button) {
  border: none;
  background-color: transparent;
  padding: 8px 16px;
  border-radius: 4px;
  transition: background-color 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px; /* 图标和文字间距 */
}

/* 选中图标+文字按钮：浅灰色底纹 */
:deep(.icon-text-button-group .el-radio-button.is-active) {
  background-color: #eeeeee; /* 浅灰色 */
  color: #007bff; /* 选中时文字用Postman主题色 */
}

/* 图标样式 */
.btn-icon {
  font-size: 14px;
  display: inline-block;
}

/* 文字样式 */
.btn-text {
  font-size: 14px;
  white-space: nowrap;
}

.body-format-select {
  flex-shrink: 0;
}

:deep(.body-format-select .el-select) {
  width: 120px;
}

.body-content-area {
  flex: 1;
  overflow: hidden;
  padding: 8px;
}

.content-pretty,
.content-raw {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* Preview模式样式 */
.content-preview {
  width: 100%;
  height: 100%;
  overflow: auto;
  padding: 16px;
  box-sizing: border-box;
  background-color: #fff;
}

.preview-container {
  width: 100%;
  min-height: 300px;
  overflow: auto;
}

.preview-empty {
  color: #999;
  font-size: 14px;
  text-align: center;
  padding-top: 20px;
}

.cookies-content,
.headers-content {
  padding: 16px;
  height: 100%;
  box-sizing: border-box;
  overflow: auto;
  background-color: #fff;
}

:deep(.response-container .el-table) {
  --el-table-header-text-color: #606266;
  --el-table-row-hover-bg-color: #f5f7fa;
  font-size: 14px;
}

:deep(.response-container .el-table__empty-text) {
  color: #909399;
  font-size: 13px;
}
.json-pretty-container {
  padding: 16px;
  font-size: 14px;
  line-height: 1.6;
}
</style>
