<!-- HttpsResponsePanel.vue（保持原界面布局和交互，功能不变） -->
<template>
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
            <div v-if="activeBodySubTab === 'pretty'" class="content-pretty">
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
                :data="activeRequest.response.data"
                :read-only="true"
                style="width: 100%; height: 75vh"
              />
            </div>

            <!-- Preview模式 -->
            <div v-if="activeBodySubTab === 'preview'" class="content-preview">
              <div
                class="preview-container"
                v-if="activeRequest.response.data"
              >
                <vue-json-pretty
                  :data="activeRequest.response.data"
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
                  activeRequest.response.body ||
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
              v-if="activeRequest.response.cookies.length"
              >{{ activeRequest.response.cookies.length }}</span
            >
          </span>
        </template>
        <div class="cookies-content">
          <el-table
            :data="activeRequest.response.cookies"
            border
            stripe
            style="width: 100%"
            empty-text="暂无Cookie数据"
          >
            <el-table-column prop="name" label="Name" min-width="150" />
            <el-table-column prop="value" label="Value" min-width="200" />
            <el-table-column prop="domain" label="Domain" min-width="150" />
            <el-table-column prop="path" label="Path" min-width="100" />
            <el-table-column prop="expires" label="Expires" min-width="180" />
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
              v-if="activeRequest.response.headers.length"
              >{{ activeRequest.response.headers.length }}</span
            >
          </span>
        </template>
        <div class="headers-content">
          <el-table
            :data="activeRequest.response.headers"
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
</template>

<script setup>
import { computed,ref } from "vue";
import VueJsonPretty from "vue-json-pretty";
import "vue-json-pretty/lib/styles.css";
import JsonEditor from "./JsonEditor.vue";
import IconSend from "@/icons/IconSend.vue";
import { useHttpsRequestStore } from "@/stores/StoreHttpsRequests";

// 获取Pinia仓库
const requestStore = useHttpsRequestStore();
const activeRequest = computed(() => requestStore.activeRequest);


const activeResponseTab = ref("response-body");
const activeBodySubTab = ref("pretty");
const responseFormat = ref("json");
const formattedResponse = ref("");

// 编辑器Ref
const prettyEditorRef = ref(null);
const rawEditorRef = ref(null);

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

function handleFormatChange(){
    console.log("handleFormatChange");
}
</script>

<style scoped>
    
.response-panel {
  background-color: #fff;
}
/* 保持原有响应展示样式 */
pre {
  font-family: "Consolas", "Monaco", "Courier New", monospace;
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
