<template>
  <el-dialog v-model="visible" width="700px" @close="handleClose">
    <!-- 自定义标题：文字 + 右侧提示图标 -->
    <template #title>
      <div class="dialog-title">
        <span>从浏览器粘贴请求头</span>
        <el-tooltip
          content="从浏览器开发者工具复制请求头，支持两种格式：
  1. 原始格式（包含请求行）：
  GET /api/xxx HTTP/1.1
  Accept: */*
  Cookie: xxx=xxx
  
  2. 纯Headers格式：
  Accept: */*
  Cookie: xxx=xxx"
          placement="right"
          effect="dark"
          popper-class="tooltip-multiline"
        >
          <el-icon class="title-info-icon"><InfoFilled /></el-icon>
        </el-tooltip>
      </div>
    </template>

    <div class="paste-container">
      <el-input
        v-model="rawText"
        type="textarea"
        :rows="10"
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
import { InfoFilled } from "@element-plus/icons-vue";

const emit = defineEmits(["confirm"]);

const visible = ref(false);
const rawText = ref("");
const overwriteExisting = ref(true);
const includeRequestLine = ref(false);
const parsedHeaders = ref([]);

// 解析Headers（兼容 单行/分行/浏览器复制 全格式）
function parseHeaders(text) {
  const headers = [];
  const lines = text.split(/\r?\n/).map((line) => line.trimEnd()); // 保留缩进，只去除换行符

  let lastHeaderName = null; // 记录上一个header名称
  let skipRequestLine = !includeRequestLine.value;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (!line) continue;

    // 处理 分行Header（如 :authority: \n value）
    if (lastHeaderName !== null) {
      headers.push({
        name: lastHeaderName,
        value: line.trim(),
        desc: `从浏览器导入 - ${lastHeaderName}`,
      });
      lastHeaderName = null;
      continue;
    }

    // 跳过请求行（GET / POST ...）
    if (
      skipRequestLine &&
      /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s/i.test(line)
    ) {
      continue;
    }

    // 匹配 Header 名称（支持 :authority: 这种格式）
    const colonMatch = line.match(/^([^:\n]+):\s*$/);
    if (colonMatch) {
      lastHeaderName = colonMatch[1].trim();
      continue;
    }

    // 匹配单行 Header（name: value）
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const name = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      if (name && value) {
        headers.push({
          name,
          value,
          desc: `从浏览器导入 - ${name}`,
        });
      }
    }
  }

  return headers;
}

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
/* 标题布局：文字 + 提示图标 */
.dialog-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.title-info-icon {
  font-size: 16px;
  color: #409eff;
  cursor: pointer;
  transition: color 0.2s;
}
.title-info-icon:hover {
  color: #1677ff;
}
.paste-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.paste-textarea :deep(.el-textarea) {
  border: none !important;
  font-size: 14px;
  font-family: monospace;
}
.parse-options {
  display: flex;
  gap: 10px;
}
.preview {
  margin-top: -10px;
}
</style>

<!-- 让 tooltip 支持换行 -->
<style>
.tooltip-multiline {
  white-space: pre-line;
  line-height: 1.5;
}
/* 强制给内层textarea留滚动条空间 + 修复边框消失 */
.paste-textarea .el-textarea__inner {
  box-sizing: border-box !important;
  padding-right: 18px !important; /* 给滚动条留空间 */
  border: 1px solid #dcdfe6 !important;
  border-radius: 4px !important;
}
/* 美化滚动条 */
.paste-textarea .el-textarea__inner::-webkit-scrollbar {
  width: 6px;
}
.paste-textarea .el-textarea__inner::-webkit-scrollbar-track {
  background: #f5f7fa;
  border-radius: 3px;
}
.paste-textarea .el-textarea__inner::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}
</style>
