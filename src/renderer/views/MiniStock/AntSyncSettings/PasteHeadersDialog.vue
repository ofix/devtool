<template>
  <el-dialog
    v-model="visible"
    title="从浏览器粘贴 Headers"
    width="700px"
    @close="handleClose"
  >
    <div class="paste-container">
      <div class="paste-tip">
        <el-alert type="info" :closable="false" show-icon>
          <template #title>
            从浏览器开发者工具复制请求头，支持两种格式：
          </template>
          <div class="tip-content">
            <p>1. 原始格式（包含请求行）：</p>
            <pre>
GET /api/xxx HTTP/1.1
  Accept: */*
  Cookie: xxx=xxx
  User-Agent: Mozilla/5.0...</pre
            >
            <p>2. 纯Headers格式：</p>
            <pre>
Accept: */*
  Cookie: xxx=xxx
  User-Agent: Mozilla/5.0...</pre
            >
          </div>
        </el-alert>
      </div>

      <el-input
        v-model="rawText"
        type="textarea"
        :rows="12"
        placeholder="请粘贴从浏览器复制的Headers文本..."
        class="paste-textarea"
      />

      <div class="parse-options">
        <el-checkbox v-model="overwriteExisting"
          >覆盖现有同名Header</el-checkbox
        >
        <el-checkbox v-model="includeRequestLine"
          >包含请求行（GET/POST等）</el-checkbox
        >
      </div>

      <div class="preview" v-if="parsedHeaders.length > 0">
        <el-divider>解析预览</el-divider>
        <el-table :data="parsedHeaders" size="small" max-height="200">
          <el-table-column prop="name" label="Header名称" width="150">
            <template #default="{ row }">
              <el-tag size="small" type="info">{{ row.name }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column
            prop="value"
            label="Header值"
            show-overflow-tooltip
          />
        </el-table>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        @click="handleConfirm"
        :disabled="parsedHeaders.length === 0"
      >
        确认导入 ({{ parsedHeaders.length }})
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from "vue";

const emit = defineEmits(["confirm"]);

const visible = ref(false);
const rawText = ref("");
const overwriteExisting = ref(true);
const includeRequestLine = ref(false);
const parsedHeaders = ref([]);

// 解析Headers
function parseHeaders(text) {
  const headers = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 跳过请求行（GET /path HTTP/1.1）
    if (
      !includeRequestLine.value &&
      /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s/i.test(trimmed)
    ) {
      continue;
    }

    // 解析 Header: Name: Value
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex > 0) {
      const name = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();
      if (name && value) {
        headers.push({ name, value, desc: `从浏览器导入 - ${name}` });
      }
    }
  }

  return headers;
}

// 监听文本变化自动解析
watch(rawText, (newVal) => {
  if (newVal.trim()) {
    parsedHeaders.value = parseHeaders(newVal);
  } else {
    parsedHeaders.value = [];
  }
});

function open() {
  visible.value = true;
  rawText.value = "";
  parsedHeaders.value = [];
}

function handleClose() {
  rawText.value = "";
  parsedHeaders.value = [];
}

function handleConfirm() {
  emit("confirm", parsedHeaders.value, {
    overwriteExisting: overwriteExisting.value,
  });
  visible.value = false;
}

defineExpose({ open });
</script>

<style scoped>
.paste-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tip-content {
  font-size: 12px;
  margin-top: 8px;
}

.tip-content pre {
  background-color: #f5f7fa;
  padding: 8px;
  border-radius: 4px;
  font-size: 11px;
  margin: 8px 0;
  overflow-x: auto;
}

.paste-textarea :deep(textarea) {
  font-family: monospace;
  font-size: 12px;
}

.parse-options {
  display: flex;
  gap: 20px;
}

.preview {
  margin-top: 8px;
}
</style>
