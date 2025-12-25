<!-- HttpsRequestBuildPanel.vue（核心面板：标签页+原有编辑布局，功能完全兼容） -->
<template>
  <div
    class="request-build-panel"
    style="
      height: 100%;
      display: flex;
      flex-direction: column;
      background-color: #fff;
    "
  >
    <!-- 新增标签页（不影响原有功能，+号新增请求，保持原有编辑区域不变） -->
    <el-tabs
      v-model="activeRequestId"
      type="card"
      closable
      @tab-add="handleAddTab"
      @tab-remove="handleRemoveTab"
      @tab-change="handleTabChange"
      style="border-bottom: 1px solid #e6e6e6; margin-bottom: 0"
    >
      <el-tab-pane
        v-for="request in requestStore.allRequests"
        :key="request.id"
        :label="request.alias || '未命名请求'"
      />
      <!-- 新增标签页按钮（+号，保持Postman样式） -->
      <template #append>
        <el-button
          icon="Plus"
          size="small"
          circle
          @click="handleAddTab"
          style="
            margin: 4px;
            margin-right: 10px;
            width: 28px;
            height: 28px;
            padding: 0;
          "
        />
      </template>
    </el-tabs>

    <!-- 原有编辑区域（拆分为子组件，但布局和功能与原一致） -->
    <div class="postwoman-container">
      <HttpsUrlPanel />
      <el-splitter layout="vertical">
        <el-splitter-panel :min="160" :size="160">
          <HttpsRequestPanel />
        </el-splitter-panel>
        <el-splitter-panel>
          <HttpsResponsePanel />
        </el-splitter-panel>
      </el-splitter>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useHttpsRequestStore } from "@/stores/StoreHttpsRequests";
import HttpsUrlPanel from "./HttpsUrlPanel.vue";
import HttpsRequestPanel from "./HttpsRequestPanel.vue";
import HttpsResponsePanel from "./HttpsResponsePanel.vue";

// 获取Pinia仓库
const requestStore = useHttpsRequestStore();

// 当前活动请求ID（双向绑定标签页，保持与原有功能联动）
const activeRequestId = computed({
  get: () => requestStore.activeRequestId || requestStore.allRequests[0]?.id,
  set: (val) => requestStore.setActiveRequest(val),
});

// 新增标签页（创建与原有请求结构一致的空请求，保持功能兼容）
const handleAddTab = () => {
  requestStore.addRequestTab();
};

// 关闭标签页（同时删除分组中的请求，保持数据一致性）
const handleRemoveTab = (requestId) => {
  requestStore.closeRequestTab(requestId);
};

// 切换标签页（同步更新当前活动请求，保持与左侧列表联动）
const handleTabChange = (requestId) => {
  requestStore.setActiveRequest(requestId);
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
.request-build-panel {
  height: 100%;
  background-color: #fff;
}
/* 保持原有标签页样式，不破坏界面 */
:deep(.el-tabs--card > .el-tabs__header .el-tabs__nav-wrap) {
  margin: 0;
}
:deep(.el-tabs--card > .el-tabs__header .el-tabs__item) {
  border-bottom: none;
}
</style>
