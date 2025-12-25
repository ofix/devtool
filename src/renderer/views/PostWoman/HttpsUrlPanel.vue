<!-- HttpsUrlPanel.vue（保持原界面布局和交互，功能不变） -->
<template>
  <div class="request-header">
    <el-input
      v-model="activeRequest.name"
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
    <el-select v-model="activeRequest.method" class="method-select">
      <el-option label="GET" value="GET" />
      <el-option label="POST" value="POST" />
      <el-option label="PUT" value="PUT" />
      <el-option label="PATCH" value="PATCH" />
      <el-option label="DELETE" value="DELETE" />
    </el-select>
    <el-input
      v-model="activeRequest.url"
      placeholder="请输入请求URL（如 https://api.example.com/path）"
      class="url-input"
      @keyup.enter="handleSendRequest"
      clearable
    />
    <el-button type="primary" @click="handleSendRequest">
      <template #icon><IconSend /></template>
      发送
    </el-button>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { ElMessage } from "element-plus";
import { useHttpsRequestStore } from "@/stores/StoreHttpsRequests";
import IconSend from "@/components/icons/IconSend.vue";
import IconLink from "@/components/icons/IconLink.vue";

// 获取Pinia仓库
const requestStore = useHttpsRequestStore();
const activeRequestId = computed(() => requestStore.activeRequestId);
const activeRequest = computed(() => requestStore.activeRequest);

// 请求方法变更（同步更新到Pinia，保持原有逻辑）
function handleMethodChange(method) {
  requestStore.updateRequest(activeRequestId.value, { method });
}

// URL变更（同步更新到Pinia，保持原有逻辑）
function handleUrlChange(url) {
  requestStore.updateRequest(activeRequestId.value, { url });
}

function saveRequest() {
  ElMessage.success("请求已保存（功能待实现）");
}

// 发送请求（完全还原原有逻辑，保持功能不变）
async function handleSendRequest() {
  const { id, method, url, headers, body } = activeRequest.value;
  if (!url.trim()) {
    ElMessage.warning("请输入请求URL");
    return;
  }

  try {
    // 处理请求头（原有逻辑不变）
    const headerObj = {};
    headers.forEach((item) => {
      if (item.key.trim() && item.value.trim()) {
        headerObj[item.key.trim()] = item.value.trim();
      }
    });

    // 处理请求体（原有逻辑不变，兼容Form Data和Raw JSON）
    let contentType = headers["Content-Type"] || "application/json";
    let requestBody = null;
    if (method !== "GET") {
      if (body.raw) {
        try {
          requestBody = JSON.parse(body.raw);
        } catch (e) {
          ElMessage.warning("JSON格式错误，请检查后重试");
          return;
        }
      } else if (body.formData.length) {
        requestBody = {};
        body.formData.forEach((item) => {
          if (item.key.trim()) {
            requestBody[item.key.trim()] = item.value.trim();
          }
        });
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

    requestStore.updateRequestResponse(id, {
      status: result.status,
      statusText: result.statusText,
      data: result.responseText,
      headers: result.headers,
      cookies: result.cookies,
    });

    ElMessage.success("请求发送成功");
  } catch (error) {
    ElMessage.error(`请求失败：${error.message}`);
    // 更新错误响应（原有逻辑不变）
    requestStore.updateRequestResponse(id, {
      status: null,
      statusText: "请求异常",
      data: error.message,
      headers: {},
      cookies: {},
    });
  }
}
</script>

<style scoped>
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
.url-panel {
  background-color: #f8f9fa;
}
/* 保持原有输入框和按钮样式 */
:deep(.el-input__inner) {
  border-radius: 4px;
}
:deep(.el-select .el-input__inner) {
  border-radius: 4px;
}
</style>
