<template>
  <div class="request-header-panel">
    <!-- 过滤 -->
    <el-input
      v-model="filterText"
      placeholder="过滤URL..."
      clearable
      class="filter-input"
    />

    <!-- 官方分割面板：水平方向 -->
    <el-splitter class="splitter-container">
      <!-- 左侧：请求列表 -->
      <el-splitter-panel :min="200" :max="480" size="360px" class="left-panel">
        <div
          v-for="(item, index) in filteredList"
          :key="index"
          :class="['request-item', { active: selectedItem === item }]"
          @click="selectedItem = item"
        >
          <span class="url" :title="item.url">{{ item.url }}</span>
          <span class="method" :class="item.method">{{ item.method }}</span>
        </div>
        <div v-if="filteredList.length === 0" class="empty">暂无请求</div>
      </el-splitter-panel>

      <!-- 右侧：请求头详情 -->
      <el-splitter-panel class="right-panel">
        <div v-if="selectedItem" class="detail-wrap">
          <div class="detail-toolbar">
            <span class="title">请求头详情</span>
            <el-button size="small" type="primary" @click="syncHeaders"
              >同步</el-button
            >
            <el-button size="small" @click="clearList">清空</el-button>
          </div>
          <div class="table-wrap">
            <table class="header-table">
              <tbody>
                <tr v-for="(val, key) in selectedItem.headers" :key="key">
                  <td class="key">{{ key }}</td>
                  <td class="val">{{ val }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div v-else class="empty-detail">请选择左侧请求</div>
      </el-splitter-panel>
    </el-splitter>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { ElMessage } from "element-plus";

const emit = defineEmits(["sync"]);

// 从 props 接收数据（正确）
const props = defineProps({
  captureRequests: {
    type: Array,
    default: () => [],
  },
});

const selectedItem = ref(null);
const filterText = ref("");

// 计算属性：直接用 props 过滤
const filteredList = computed(() => {
  if (!filterText.value) return props.captureRequests;
  return props.captureRequests.filter((item) =>
    item.url.toLowerCase().includes(filterText.value.toLowerCase()),
  );
});

// 同步
const syncHeaders = () => {
  if (!selectedItem.value) return ElMessage.warning("请先选择请求");
  // 把对象格式 转成 数组格式 { key: val } => [{ name, value }]
  const headers = Object.entries(selectedItem.value.headers).map(
    ([name, value]) => ({
      name: name.trim(),
      value: value || "",
      enabled: true,
    }),
  );
  emit("sync", headers);
  ElMessage.success("已同步");
};

// 清空（向父组件发射）
const clearList = () => {
  emit("update:captureRequests", []);
  selectedItem.value = null;
  ElMessage.success("已清空");
};

// 自动选中第一条
watch(
  () => props.captureRequests,
  (newList) => {
    if (newList.length > 0 && !selectedItem.value) {
      selectedItem.value = newList[0];
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.request-header-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  overflow: hidden;
  background: #fff;
}

.filter-input {
  padding: 8px;
}

.splitter-container {
  flex: 1;
  height: 0;
}

.left-panel {
  height: 100%;
  overflow-y: auto;
  background: #f9fafb;
  user-select: none;
}

.request-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
  border-bottom: 1px solid #f0f0f0;
}
.request-item:hover {
  background: #e5f0ff;
}
.request-item.active {
  background: #3b82f6;
  color: #fff;
}

.method {
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: bold;
  min-width: 50px;
  text-align: center;
  background: #ddd;
}
.method.GET {
  background: #d1fae5;
  color: #065f46;
}
.method.POST {
  background: #dbeafe;
  color: #1e40af;
}
.method.PUT {
  background: #fef3c7;
  color: #92400e;
}
.method.DELETE {
  background: #fee2e2;
  color: #991b1b;
}

.url {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.right-panel {
  height: 100%;
  overflow-y: auto;
  padding: 12px;
}

.detail-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.title {
  font-weight: bold;
  flex: 1;
}

.table-wrap {
  width: 100%;
}
.header-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.header-table tr {
  border-bottom: 1px solid #f0f0f0;
}
.header-table td {
  padding: 6px 8px;
  vertical-align: top;
}
.key {
  width: 200px;
  font-weight: 600;
  color: #1e40af;
}
.val {
  color: #374151;
  word-break: break-all;
}

.empty,
.empty-detail {
  padding: 40px;
  text-align: center;
  color: #999;
  font-size: 12px;
}
</style>
