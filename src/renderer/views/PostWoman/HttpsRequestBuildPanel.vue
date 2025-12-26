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
    <!-- 新增标签页 -->
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
      <!-- 新增标签页按钮 -->
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
    <!-- 请求编辑面板 -->
    <div class="postwoman-container">
      <HttpsUrlPanel />
      <el-menu
        :default-active="activeIndex"
        class="request-tabs"
        mode="horizontal"
        @select="handleSelect"
      >
        <el-menu-item index="1">Params</el-menu-item>
        <el-menu-item index="2">Headers</el-menu-item>
        <el-menu-item index="3">Body</el-menu-item>
      </el-menu>
      <el-splitter layout="vertical">
        <el-splitter-panel :min="160" :size="160">
          <HttpsRequestPanel :activeTab="activeIndex" />
        </el-splitter-panel>
        <el-splitter-panel>
          <HttpsResponsePanel />
        </el-splitter-panel>
      </el-splitter>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { useHttpsRequestStore } from "@/stores/StoreHttpsRequests";
import HttpsUrlPanel from "./HttpsUrlPanel.vue";
import HttpsRequestPanel from "./HttpsRequestPanel.vue";
import HttpsResponsePanel from "./HttpsResponsePanel.vue";

const requestStore = useHttpsRequestStore();

// 当前活动请求ID
const activeRequestId = computed({
  get: () => requestStore.activeRequestId || requestStore.allRequests[0]?.id,
  set: (val) => requestStore.setActiveRequest(val),
});

const activeIndex = ref("1");
function handleSelect(key, keyPath) {
  activeIndex.value = key;
}

// 新增标签页
function handleAddTab() {
  requestStore.addRequestTab();
}

// 关闭标签页
function handleRemoveTab(requestId) {
  requestStore.closeRequestTab(requestId);
}

// 切换标签页
function handleTabChange(requestId) {
  requestStore.setActiveRequest(requestId);
}
</script>

<style scoped>
.postwoman-container {
  width: 100%;
  height: 100vh;
  display: flex;
  background-color: #fff;
  flex-direction: column;
  padding: 16px;
  box-sizing: border-box;
  overflow: hidden;
}
.request-build-panel {
  height: 100%;
  background-color: #fff;
}
.request-tabs {
  margin-bottom: 20px;
  height: 46px;
}
:deep(.el-tabs--card > .el-tabs__header .el-tabs__nav-wrap) {
  margin: 0;
}
:deep(.el-tabs--card > .el-tabs__header .el-tabs__item) {
  border-bottom: none;
}
</style>
