<template>
  <el-splitter-panel :size="400" :min-size="300">
    <el-splitter layout="vertical" style="height: 100%; width: 100%">
      <!-- 可视化面板（简化） -->
      <el-splitter-panel :size="300" :min-size="200">
        <div class="visual-top-panel">
          <div class="empty-visual">数据可视化区域</div>
        </div>
      </el-splitter-panel>

      <!-- 操作历史面板 -->
      <el-splitter-panel :size="300" :min-size="200">
        <div class="visual-bottom-panel">
          <div class="record-header">操作记录</div>
          <el-table
            :data="historyList"
            border
            size="small"
            style="width: 100%; height: calc(100% - 30px)"
            @row-click="handleHistoryClick"
          >
            <el-table-column prop="type" label="操作类型" width="80">
              <template #default="scope">
                <span
                  :class="[
                    'operation-type',
                    scope.row.isDisabled ? 'disabled' : '',
                    scope.row.type === '修改' ? 'modify' : '',
                    scope.row.type === '删除' ? 'delete' : '',
                    scope.row.type === '新增' ? 'add' : '',
                    scope.row.type === '剪切' ? 'cut' : '',
                    scope.row.type === '复制' ? 'copy' : '',
                  ]"
                >
                  {{ scope.row.type }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="change" label="数据变更" min-width="200">
              <template #default="scope">
                <div
                  class="change-content"
                  :class="{ disabled: scope.row.isDisabled }"
                >
                  <div
                    v-if="scope.row.expanded || scope.row.displayLines <= 3"
                    v-html="scope.row.formattedChange"
                  ></div>
                  <div v-else>
                    <div v-html="getFirstThreeLines(scope.row)"></div>
                    <button
                      class="expand-btn"
                      @click.stop="scope.row.expanded = true"
                    >
                      展开
                    </button>
                  </div>
                  <button
                    v-if="scope.row.expanded && scope.row.displayLines > 3"
                    class="expand-btn"
                    @click.stop="scope.row.expanded = false"
                  >
                    收起
                  </button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-splitter-panel>
    </el-splitter>
  </el-splitter-panel>
</template>

<script setup>
import { ref, computed } from "vue";

// 定义Props
const props = defineProps({
  historyList: {
    type: Array,
    default: () => [],
  },
});

// 定义事件
const emit = defineEmits(["history-click"]);

// 方法
const handleHistoryClick = (row) => {
  emit("history-click", row);
};

// 获取前3行数据
const getFirstThreeLines = (row) => {
  const lines = row.formattedChange.split("<br/>");
  if (lines.length <= 3) return row.formattedChange;

  // 取前3行
  let result = "";
  let count = 0;
  let lineCount = 0;

  for (let i = 0; i < lines.length && count < 3; i++) {
    result += lines[i] + "<br/>";
    if (lines[i].includes('<div class="data-line">')) {
      count++;
      lineCount = i;
    }
  }

  return result;
};
</script>

<style scoped>
.visual-top-panel,
.visual-bottom-panel {
  padding: 10px;
  height: 100%;
  overflow-y: auto;
}

.empty-visual {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #999;
}

.record-header {
  font-weight: bold;
  margin-bottom: 10px;
  color: #666;
}

.operation-type {
  font-weight: bold;
}

.operation-type.disabled {
  color: #999 !important;
}

.operation-type.modify {
  color: #ff9800;
}

.operation-type.delete {
  color: #f44336;
}

.operation-type.add {
  color: #4caf50;
}

.operation-type.cut {
  color: #9c27b0;
}

.operation-type.copy {
  color: #2196f3;
}

.change-content {
  font-family: monospace;
  font-size: 12px;
}

.change-content.disabled {
  opacity: 0.5;
}

.change-block {
  margin: 5px 0;
  padding: 5px;
  border-radius: 3px;
}

.change-block.original {
  background-color: #f5f5f5;
}

.change-block.modified {
  background-color: #fff8e1;
}

.change-block.deleted {
  background-color: #ffebee;
}

.change-block.added {
  background-color: #e8f5e9;
}

.data-line {
  white-space: pre;
  margin: 2px 0;
}

.expand-btn {
  background: none;
  border: none;
  color: #2196f3;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 5px;
}

.expand-btn:hover {
  text-decoration: underline;
}
</style>
