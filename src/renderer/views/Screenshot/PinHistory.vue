<!-- src/renderer/views/PinHistory.vue -->
<template>
  <div class="pin-history-container">
    <div class="history-header">
      <h3>历史钉图</h3>
      <el-button
        type="danger"
        size="small"
        icon="el-icon-delete"
        @click="handleClearAll"
        :disabled="loading"
      >
        清空所有
      </el-button>
    </div>

    <!-- 历史记录列表 -->
    <div class="history-list" v-loading="loading">
      <div
        class="history-item"
        v-for="item in historyList"
        :key="item.pinId"
        :class="{ active: item.isActive }"
      >
        <!-- 缩略图 -->
        <div class="item-thumbnail">
          <img
            :src="`data:image/png;base64,${item.imageData.base64}`"
            alt="截图缩略图"
          />
        </div>

        <!-- 信息和操作 -->
        <div class="item-info">
          <div class="create-time">{{ formatTime(item.createTime) }}</div>
          <div class="item-actions">
            <el-button
              size="mini"
              type="primary"
              icon="el-icon-refresh"
              @click="handleReopen(item.pinId)"
              :disabled="item.isActive || loading"
            >
              重新钉图
            </el-button>
            <el-button
              size="mini"
              type="danger"
              icon="el-icon-delete"
              @click="handleDelete(item.pinId)"
              :disabled="loading"
            >
              删除
            </el-button>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div class="empty-state" v-if="historyList.length === 0 && !loading">
        <el-empty description="暂无历史钉图记录"></el-empty>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { ipcRenderer } from "electron";
import { ElButton, ElEmpty } from "element-plus";
import dayjs from "dayjs"; // npm install dayjs

// 核心变量
const loading = ref(false);
const historyList = ref([]);

/**
 * 加载历史钉图记录
 */
const loadHistory = async () => {
  try {
    const history = await window.channel.getPinHistory(
      "pin-manager:get-history"
    );
    historyList.value = history;
  } catch (error) {
    console.error(error);
  } finally {
  }
};

/**
 * 格式化时间
 */
const formatTime = (timestamp) => {
  return dayjs(timestamp).format("YYYY-MM-DD HH:mm:ss");
};

/**
 * 重新打开历史钉图
 */
const handleReopen = async (pinId) => {
  try {
    await window.channel.reopenFromHistory(
      "pin-manager:reopen-from-history",
      pinId
    );
    // 重新加载列表
    await loadHistory();
  } catch (error) {
    console.error("重新钉图失败：", error);
  } finally {
    loading.value = false;
  }
};

/**
 * 删除单条历史记录
 */
const handleDelete = async (pinId) => {
  try {
    await ElMessageBox.confirm(
      // 需引入ElMessageBox
      "确定要删除这条历史记录吗？删除后无法恢复",
      "提示",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      }
    );
    await window.channel.deletePinImage("pin-manager:delete-history", pinId);
    // 重新加载列表
    await loadHistory();
  } catch (error) {
    console.error("删除历史记录失败：", error);
  } finally {
  }
};

/**
 * 清空所有历史记录
 */
const handleClearAll = async () => {
  try {
    await ElMessageBox.confirm(
      "确定要清空所有历史钉图记录吗？此操作无法恢复",
      "警告",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "error",
      }
    );

    await window.channel.clearHistory("pin-manager:clear-history");

    // 重新加载列表
    await loadHistory();
  } catch (error) {
    console.error("清空历史记录失败：", error);
  } finally {
  }
};

// 初始化加载
onMounted(() => {
  loadHistory();
});

onUnmounted(() => {
  // 清理资源
});
</script>

<style scoped>
.pin-history-container {
  padding: 16px;
  max-width: 800px;
  margin: 0 auto;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.history-list {
  gap: 12px;
  display: flex;
  flex-direction: column;
}

.history-item {
  display: flex;
  padding: 12px;
  border: 1px solid #e6e6e6;
  border-radius: 8px;
  align-items: center;
  transition: all 0.2s;
}

.history-item.active {
  border-color: #409eff;
  background-color: #f0f8ff;
}

.item-thumbnail {
  width: 120px;
  height: 80px;
  border-radius: 4px;
  overflow: hidden;
  margin-right: 16px;
}

.item-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.create-time {
  color: #666;
  font-size: 12px;
  margin-bottom: 8px;
}

.item-actions {
  display: flex;
  gap: 8px;
}

.empty-state {
  padding: 40px 0;
  text-align: center;
}
</style>
