<template>
  <div class="postwoman-container">
    <div class="request-header">
      <el-select v-model="requestConfig.method" class="method-select">
        <el-option label="GET" value="GET" />
        <el-option label="POST" value="POST" />
        <el-option label="PUT" value="PUT" />
        <el-option label="PATCH" value="PATCH" />
        <el-option label="DELETE" value="DELETE" />
      </el-select>

      <el-input
        v-model="requestConfig.url"
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

    <!-- 中部配置标签页 -->
    <el-tabs v-model="activeTab" type="border-card" class="config-tabs">
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
              v-for="(item, index) in requestConfig.headers"
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
                size="mini"
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
            <monaco-editor
              v-model="headerBatchContent"
              language="json"
              :options="{ minimap: { enabled: false }, wordWrap: 'on' }"
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
              v-for="(item, index) in requestConfig.body.formData"
              :key="index"
            >
              <el-input v-model="item.key" placeholder="Key" class="item-key" />
              <el-input
                v-model="item.value"
                placeholder="Value"
                class="item-value"
              />
              <el-button
                size="mini"
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
              v-model="requestConfig.body.raw"
              :read-only="false"
              theme="vs-dark"
              :indent="4"
              @change="handleJsonChange"
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
        @change="handleJsonChange"
        style="width: 100%; height: 80vh; margin-top: 20px"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch } from "vue";
import { ElMessage } from "element-plus";
import JsonEditor from "./JsonEditor.vue";

// 响应式状态
const activeTab = ref("headers");
const bodyType = ref("raw");
const isHeaderBatchEdit = ref(false);
const responseContent = ref("");

// 请求配置（与 postwoman 结构对齐）
const requestConfig = reactive({
  method: "GET",
  url: "",
  headers: [{ key: "", value: "" }],
  body: {
    formData: [{ key: "", value: "" }],
    raw: '{\n  "key": "value"\n}',
  },
});

// Header 批量编辑内容（JSON 格式）
const headerBatchContent = ref("");

// 监听 Header 批量编辑模式切换
watch(isHeaderBatchEdit, (val) => {
  if (val) {
    // 进入批量编辑：将 Header 数组转为 JSON 字符串
    const headerObj = {};
    requestConfig.headers.forEach((item) => {
      if (item.key) headerObj[item.key] = item.value;
    });
    headerBatchContent.value = JSON.stringify(headerObj, null, 2);
  }
});

// Header 操作方法
const addHeader = () => requestConfig.headers.push({ key: "", value: "" });
const removeHeader = (index) => requestConfig.headers.splice(index, 1);
const toggleHeaderBatchEdit = () =>
  (isHeaderBatchEdit.value = !isHeaderBatchEdit.value);
const saveHeaderBatchEdit = () => {
  try {
    const headerObj = JSON.parse(headerBatchContent.value);
    requestConfig.headers = Object.entries(headerObj).map(([key, value]) => ({
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
  requestConfig.body.formData.push({ key: "", value: "" });
const removeBodyItem = (index) => requestConfig.body.formData.splice(index, 1);

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
  requestConfig.method = "GET";
  requestConfig.url = "";
  requestConfig.headers = [{ key: "", value: "" }];
  requestConfig.body.formData = [{ key: "", value: "" }];
  requestConfig.body.raw = '{\n  "key": "value"\n}';
  responseContent.value = "";
};

// 核心：发送请求方法
const sendRequest = async () => {
  if (!requestConfig.url) {
    ElMessage.error("请输入请求 URL");
    return;
  }

  try {
    // 解析 URL（提取 host 和 path）
    const urlObj = new URL(requestConfig.url);
    const host = urlObj.hostname;
    const path = urlObj.pathname + urlObj.search;

    // 构造请求头
    const headers = {};
    requestConfig.headers.forEach((item) => {
      if (item.key) headers[item.key] = item.value;
    });

    // 构造请求体
    let data = null;
    let contentType = headers["Content-Type"] || "";
    if (["POST", "PUT", "PATCH"].includes(requestConfig.method)) {
      if (bodyType.value === "raw") {
        data = JSON.parse(requestConfig.body.raw);
        contentType = "application/json";
      } else {
        const formObj = {};
        requestConfig.body.formData.forEach((item) => {
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
    let method = requestConfig.method.toLowerCase();
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
.item-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.item-key {
  width: 200px;
}
.item-value {
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
