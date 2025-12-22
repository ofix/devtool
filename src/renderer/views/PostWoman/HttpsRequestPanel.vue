<template>
  <div class="postwoman-container">
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
      />

      <el-button type="primary" @click="sendRequest" icon="el-icon-send">
        发送
      </el-button>
      <el-button @click="clearRequest" icon="el-icon-refresh-left">
        清空
      </el-button>
    </div>

    <el-tabs v-model="activeTab" type="border-card" class="config-tabs">
      <!-- Params 配置面板 -->
      <el-tab-pane label="Params" name="params">
        <div v-if="!isHeaderBatchEdit" class="dynamic-items">
          <el-table
            ref="tableRef"
            :data="requestBuilder.headers"
            border
            @row-mouse-enter="handleRowMouseEnter"
            @row-mouse-leave="handleRowMouseLeave"
            style="width: 100%"
          >
            <!-- 复选框列 -->
            <el-table-column type="selection" width="55" align="center" />

            <!-- Key 列 -->
            <el-table-column label="Key" prop="key" min-width="150">
              <template #default="scope">
                <div
                  class="cell-content"
                  @click="handleEdit(scope.row, 'key', scope.$index)"
                >
                  <span v-if="!scope.row.editKey" class="text-content">
                    {{ scope.row.key || "" }}
                  </span>
                  <el-input
                    v-else
                    v-model="scope.row.key"
                    class="edit-input"
                    :ref="(el) => (inputRefs.key[scope.$index] = el)"
                    @blur="handleInputBlur(scope.row, 'editKey')"
                    @change="onParamKeyChange(scope.row, scope.$index)"
                    @keyup.enter="handleInputBlur(scope.row, 'editKey')"
                  />
                </div>
              </template>
            </el-table-column>

            <!-- Value 列 -->
            <el-table-column label="Value" prop="value" min-width="150">
              <template #default="scope">
                <div
                  class="cell-content"
                  @click="handleEdit(scope.row, 'value', scope.$index)"
                >
                  <span v-if="!scope.row.editValue" class="text-content">
                    {{ scope.row.value || "" }}
                  </span>
                  <el-input
                    v-else
                    v-model="scope.row.value"
                    class="edit-input"
                    :ref="(el) => (inputRefs.value[scope.$index] = el)"
                    @blur="handleInputBlur(scope.row, 'editValue')"
                    @change="onParamValChange(scope.row, scope.$index)"
                    @keyup.enter="handleInputBlur(scope.row, 'editValue')"
                  />
                </div>
              </template>
            </el-table-column>

            <!-- Description 列 -->
            <el-table-column label="Description" prop="desc" min-width="200">
              <template #default="scope">
                <div
                  class="cell-content"
                  @click="handleEdit(scope.row, 'desc', scope.$index)"
                >
                  <span v-if="!scope.row.editDesc" class="text-content">
                    {{ scope.row.desc || "" }}
                  </span>
                  <el-input
                    v-else
                    v-model="scope.row.desc"
                    class="edit-input"
                    :ref="(el) => (inputRefs.desc[scope.$index] = el)"
                    @blur="handleInputBlur(scope.row, 'editDesc')"
                    @change="onParamDescChange(scope.row, scope.$index)"
                    @keyup.enter="handleInputBlur(scope.row, 'editDesc')"
                  />
                </div>
              </template>
            </el-table-column>

            <!-- 操作列 -->
            <el-table-column label="操作" width="80" align="center">
              <template #default="scope">
                <Delete
                  class="delete-btn"
                  :class="{ show: hoveredRowIndex === scope.$index }"
                  @click="removeParam(scope.$index)"
                />
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
      <!-- Header 配置面板 -->
      <el-tab-pane label="Headers" name="headers">
        <div class="header-config">
          <!-- 批量编辑按钮 -->
          <div class="header-actions">
            <el-button size="small" @click="toggleHeaderBatchEdit">
              {{ isHeaderBatchEdit ? "退出批量编辑" : "批量编辑" }}
            </el-button>
          </div>

          <!-- 动态 Header 条目 -->
          <div v-if="!isHeaderBatchEdit" class="dynamic-items">
            <div
              class="item-row"
              v-for="(item, index) in requestBuilder.headers"
              :key="index"
            >
              <el-input
                v-model="item.key"
                placeholder="Key（如 Content-Type）"
                class="item-key"
              />
              <el-input
                v-model="item.value"
                placeholder="Value（如 application/json）"
                class="item-value"
              />
              <el-button
                size="small"
                icon="el-icon-delete"
                @click="removeHeader(index)"
              />
            </div>
            <el-button size="small" icon="el-icon-plus" @click="addHeader">
              添加 Header
            </el-button>
          </div>

          <!-- Header 批量编辑模式 -->
          <div v-else class="batch-edit">
            <JsonEditor
              v-model="headerBatchContent"
              language="json"
              :options="{ smallmap: { enabled: false }, wordWrap: 'on' }"
              height="200px"
            />
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
            <div
              class="item-row"
              v-for="(item, index) in requestBuilder.body.formData"
              :key="index"
            >
              <el-input v-model="item.key" placeholder="Key" class="item-key" />
              <el-input
                v-model="item.value"
                placeholder="Value"
                class="item-value"
              />
              <el-button
                size="small"
                icon="el-icon-delete"
                @click="removeBodyItem(index)"
              />
            </div>
            <el-button size="small" icon="el-icon-plus" @click="addBodyItem">
              添加参数
            </el-button>
          </div>

          <!-- Raw JSON 模式 -->
          <div v-else class="raw-body">
            <JsonEditor
              v-model="requestBuilder.body.raw"
              :read-only="false"
              theme="vs-dark"
              :indent="4"
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
        v-model="responseContent"
        :read-only="false"
        theme="vs-dark"
        :indent="4"
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

// 响应式状态
const activeTab = ref("params");
const bodyType = ref("raw");
const isHeaderBatchEdit = ref(false);
const responseContent = ref("");

// 请求配置（与 postwoman 结构对齐）
const requestBuilder = reactive({
  method: "GET",
  url: "",
  params: [
    {
      key: "",
      value: "",
      desc: "",
      editKey: false,
      editValue: false,
      editDesc: false,
    },
  ],
  headers: [
    {
      key: "",
      value: "",
      desc: "",
      editKey: false,
      editValue: false,
      editDesc: false,
    },
  ],
  body: {
    formData: [{ key: "", value: "" }],
    raw: '{\n  "key": "value"\n}',
  },
});

// 存储当前悬浮的行索引
const hoveredRowIndex = ref(-1);
// 输入框 refs（用于聚焦）
const inputRefs = ref({
  key: [], // key 列输入框 Ref 数组
  value: [], // value 列输入框 Ref 数组
  desc: [], // desc 列输入框 Ref 数组
});

/**
 * 核心编辑方法：直接使用模板传递的可靠索引，无需 findIndex
 * @param {Object} row - 当前行数据（代理对象不影响状态修改）
 * @param {String} prop - 列标识（key/value/desc）
 * @param {Number} rowIndex - 行索引（来自 scope.$index，绝对可靠，永不返回 -1）
 */
const handleEdit = async (row, prop, rowIndex) => {
  // 重置当前行所有编辑状态
  row.editKey = false;
  row.editValue = false;
  row.editDesc = false;

  // 激活对应列编辑状态
  switch (prop) {
    case "key":
      row.editKey = true;
      break;
    case "value":
      row.editValue = true;
      break;
    case "desc":
      row.editDesc = true;
      break;
    default:
      return;
  }

  // 等待输入框渲染完成后聚焦
  await nextTick();
  switch (prop) {
    case "key":
      console.log(
        "Key 列索引：",
        rowIndex,
        "输入框Ref：",
        inputRefs.value.key[rowIndex]
      );
      inputRefs.value.key[rowIndex]?.focus();
      break;
    case "value":
      inputRefs.value.value[rowIndex]?.focus();
      break;
    case "desc":
      inputRefs.value.desc[rowIndex]?.focus();
      break;
  }
};

// 输入框失焦事件：关闭编辑状态
const handleInputBlur = (row, editProp) => {
  // row[editProp] = false;
};

// 行鼠标进入事件：记录悬浮行索引
const handleRowMouseEnter = (row, column, event) => {
  hoveredRowIndex.value = row._index;
};

// 行鼠标离开事件：重置悬浮行索引
const handleRowMouseLeave = () => {
  hoveredRowIndex.value = -1;
};

// Header 批量编辑内容（JSON 格式）
const headerBatchContent = ref("");

// 监听 Header 批量编辑模式切换
watch(isHeaderBatchEdit, (val) => {
  if (val) {
    // 进入批量编辑：将 Header 数组转为 JSON 字符串
    const headerObj = {};
    requestBuilder.headers.forEach((item) => {
      if (item.key) headerObj[item.key] = item.value;
    });
    headerBatchContent.value = JSON.stringify(headerObj, null, 2);
  }
});

// 检查最后一行是否为空
function onParamKeyChange(event, item, index) {
  checkLastParamEmpty();
}
function onParamValChange(event, item, index) {
  checkLastParamEmpty();
}
function onParamDescChange(event, item, index) {
  checkLastParamEmpty();
}
function checkLastParamEmpty() {
  const lastParam = requestBuilder.params[requestBuilder.params.length - 1];
  if (lastParam.key || lastParam.value || lastParam.desc) {
    return;
  }
  requestBuilder.params.push({ key: "", value: "", desc: "" });
}

// Header 操作方法
const addHeader = () => requestBuilder.headers.push({ key: "", value: "" });
const removeHeader = (index) => requestBuilder.headers.splice(index, 1);

const addParam = () => requestBuilder.params.push({ key: "", value: "" });
const removeParam = (index) => requestBuilder.params.splice(index, 1);
const toggleHeaderBatchEdit = () =>
  (isHeaderBatchEdit.value = !isHeaderBatchEdit.value);
const saveHeaderBatchEdit = () => {
  try {
    const headerObj = JSON.parse(headerBatchContent.value);
    requestBuilder.headers = Object.entries(headerObj).map(([key, value]) => ({
      key,
      value,
    }));
    isHeaderBatchEdit.value = false;
    ElMessage.success("Header 批量编辑保存成功");
  } catch (e) {
    ElMessage.error("JSON 格式错误，请检查");
  }
};

// Body 操作方法
const addBodyItem = () =>
  requestBuilder.body.formData.push({ key: "", value: "" });
const removeBodyItem = (index) => requestBuilder.body.formData.splice(index, 1);

// 响应操作方法
const formatResponse = () => {
  try {
    const parsed = JSON.parse(responseContent.value);
    responseContent.value = JSON.stringify(parsed, null, 2);
  } catch (e) {
    ElMessage.warning("非 JSON 格式，无法格式化");
  }
};
const clearResponse = () => (responseContent.value = "");
const clearRequest = () => {
  requestBuilder.method = "GET";
  requestBuilder.url = "";
  requestBuilder.params = [{ key: "", value: "", desc: "" }];
  requestBuilder.headers = [{ key: "", value: "", desc: "" }];
  requestBuilder.body.formData = [{ key: "", value: "" }];
  requestBuilder.body.raw = '{\n  "key": "value"\n}';
  responseContent.value = "";
};

// 核心：发送请求方法
const sendRequest = async () => {
  if (!requestBuilder.url) {
    ElMessage.error("请输入请求 URL");
    return;
  }

  try {
    // 解析 URL（提取 host 和 path）
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
    let contentType = headers["Content-Type"] || "";
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
    let response = "";
    let options = {
      host,
      path,
      data,
      contentType,
      headers,
      ignoreSslError: true,
    };
    if (method == "get") {
      response = await window.channel.doGet(options);
    } else if (method == "post") {
      response = await window.channel.doPost(options);
    } else if (method == "patch") {
      response = await window.channel.doPatch(options);
    } else if (method == "put") {
      response = await window.channel.doPut(options);
    } else if (method == "delete") {
      response = await window.channel.doDelete(options);
    }

    // 展示响应结果
    responseContent.value = JSON.stringify(
      {
        status: response.status,
        statusMessage: response.statusMessage,
        headers: response.headers,
        data: response.data,
        redirectCount: response.redirectCount,
      },
      null,
      2
    );
  } catch (e) {
    responseContent.value = `请求失败: ${e.message}`;
  }
};
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
