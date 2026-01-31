<template>
  <div class="debug-panel-page">
    <!-- 页面头部（使用Element Plus布局） -->
    <div>
      <el-space>
        <!-- 清空日志按钮 -->
        <el-button
          type="primary"
          size="small"
          @click="clearLogs"
          icon="el-icon-delete"
        >
          清空日志
        </el-button>
        <!-- 日志总数统计 -->
        <el-tag size="small" type="info">
          日志总数: {{ logList.length }}
        </el-tag>
        <!-- 自动滚动开关 -->
        <el-switch
          v-model="autoScroll"
          size="small"
          active-text="自动滚动"
          inactive-text="关闭滚动"
        />
      </el-space>
    </div>

    <!-- 日志展示区域（核心） -->
    <el-card class="log-card" shadow="never">
      <div ref="logContainerRef" class="log-container" @scroll="handleScroll">
        <!-- 空日志提示 -->
        <el-empty
          v-if="logList.length === 0"
          description="暂无日志数据"
          class="empty-tip"
        />

        <!-- 日志列表 -->
        <div
          v-for="(log, index) in logList"
          :key="`log-${index}-${log.timestamp}`"
          class="log-item"
          :class="`log-type-${log.type || 'log'}`"
        >
          <!-- 日志时间戳 -->
          <el-tag size="mini" type="warning" class="timestamp-tag">
            {{ formatTimestamp(log.timestamp) }}
          </el-tag>

          <!-- 日志类型标签（Element Plus标签） -->
          <el-tag
            size="mini"
            :type="getLogTypeTagType(log.type)"
            class="type-tag"
          >
            {{ (log.type || "log").toUpperCase() }}
          </el-tag>

          <!-- 日志参数内容 -->
          <template
            v-for="(param, pIndex) in log.args"
            :key="`param-${index}-${pIndex}`"
          >
            <span v-if="pIndex > 0">&nbsp;</span>
            <span :class="[getParamClass(param), 'log-param']">
              {{ formatParamValue(param) }}
            </span>
          </template>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from "vue";
import { ElMessage } from "element-plus";

// ========== 响应式数据 ==========
// 日志列表
const logList = reactive([]);
// 日志容器DOM引用
const logContainerRef = ref(null);
// 是否自动滚动（绑定开关）
const autoScroll = ref(true);
// 标记是否需要自动滚动（手动滚动后暂停）
const shouldAutoScroll = ref(true);

/**
 * 根据日志类型获取Element Plus标签类型
 * @param {string} type 日志类型 log/info/warn/error/debug
 * @returns {string} 标签类型 primary/success/warning/danger/info
 */
const getLogTypeTagType = (type) => {
  const typeMap = {
    log: "primary",
    info: "info",
    warn: "warning",
    error: "danger",
    debug: "success",
  };
  return typeMap[type] || "primary";
};

/**
 * 获取参数样式类名
 * @param {any} param 日志参数
 * @returns {string} 样式类名
 */
const getParamClass = (param) => {
  if (param === null) return "log-null";

  switch (typeof param) {
    case "string":
      return "log-string";
    case "number":
    case "boolean":
      return "log-primitive";
    case "undefined":
      return "log-undefined";
    case "object":
      return "log-object";
    case "function":
      return "log-primitive";
    default:
      return "";
  }
};

/**
 * 格式化参数显示值
 * @param {any} param 日志参数
 * @returns {string} 格式化后的值
 */
const formatParamValue = (param) => {
  if (typeof param === "string") {
    return `"${param}"`;
  } else if (param === null) {
    return "null";
  } else if (typeof param === "undefined") {
    return "undefined";
  } else if (typeof param === "object") {
    try {
      return JSON.stringify(
        param,
        (key, value) => {
          // 处理循环引用
          if (value === "[Circular]") return "[循环引用]";
          return value;
        },
        2,
      );
    } catch (e) {
      return `[序列化失败: ${e.message}]`;
    }
  } else if (typeof param === "function") {
    return "[Function]";
  }
  return String(param);
};

/**
 * 格式化时间戳
 * @param {string|Date} timestampStr 时间戳字符串/Date对象
 * @returns {string} 格式化后的时间
 */
const formatTimestamp = (timestampStr) => {
  if (!timestampStr) return new Date().toLocaleString();
  const date =
    typeof timestampStr === "string" ? new Date(timestampStr) : timestampStr;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

/**
 * 滚动到底部
 */
const scrollToBottom = () => {
  if (autoScroll.value && shouldAutoScroll.value && logContainerRef.value) {
    const container = logContainerRef.value;
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }
};

/**
 * 处理滚动事件（手动滚动后暂停自动滚动）
 */
const handleScroll = () => {
  if (!logContainerRef.value || !autoScroll.value) return;

  const container = logContainerRef.value;
  // 判断是否滚动到最底部（允许10px误差）
  const isAtBottom =
    container.scrollTop + container.clientHeight >= container.scrollHeight - 10;
  shouldAutoScroll.value = isAtBottom;
};

/**
 * 清空日志
 */
const clearLogs = () => {
  logList.length = 0;
  window.channel.clearDebugLogs();
  ElMessage.success("日志已清空");
};

// ========== 生命周期 ==========
onMounted(() => {
  // 监听历史缓存日志
  window.channel.on("incremental-logs", (event, logs) => {
    try {
      console.log(logs);
      if (Array.isArray(logs) && logs.length > 0) {
        // 兜底去重：过滤已存在的日志（避免极端情况重复）
        const newLogs = logs.filter(
          (l) => !logList.some((item) => item.id === l.id),
        );

        if (newLogs.length > 0) {
          logList.push(...newLogs);
          scrollToBottom();
          ElMessage.info(`加载增量日志 ${newLogs.length} 条`);
        }
      }
    } catch (e) {
      ElMessage.info(`处理增量日志异常: ${e.message}`);
    }
  });
  // 监听实时新日志
  window.channel.on("new-log", (event, newLog) => {
    logList.push(newLog);
    scrollToBottom();
  });

  // 监听清空日志指令
  window.channel.on("clear-log", () => {
    clearLogs();
  });
});

onUnmounted(() => {});
</script>

<style scoped lang="scss">
.debug-panel-page {
  width: 100%;
  height: 100vh;
  padding: 16px;
  box-sizing: border-box;
  background-color: #f5f7fa;

  // 页面头部
  .page-header {
    margin-bottom: 16px;
  }

  // 日志卡片
  .log-card {
    height: calc(100% - 60px);
    display: flex;
    flex-direction: column;

    .log-container {
      flex: 1;
      overflow-x: auto;
      overflow-y: auto;
      padding: 16px;
      background-color: #ffffff;
      border-radius: 4px;

      // 空日志提示
      .empty-tip {
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      // 日志项
      .log-item {
        margin: 8px 0;
        padding: 8px 12px;
        border-radius: 6px;
        white-space: pre-wrap;
        word-break: break-all;
        line-height: 1.6;

        // 时间戳标签
        .timestamp-tag {
          margin-right: 8px;
          background-color: #faad14;
        }

        // 类型标签
        .type-tag {
          margin-right: 12px;
        }

        // 不同类型日志背景色
        &.log-type-log {
          background-color: #e6f7ff;
        }
        &.log-type-info {
          background-color: #f0f9ff;
        }
        &.log-type-warn {
          background-color: #fff7e6;
        }
        &.log-type-error {
          background-color: #fff2f0;
          color: #f5222d;
        }
        &.log-type-debug {
          background-color: #f6ffed;
        }
      }

      // 参数样式
      .log-primitive {
        color: #52c41a;
      }
      .log-string {
        color: #1890ff;
      }
      .log-object {
        color: #eb2f96;
      }
      .log-undefined,
      .log-null {
        color: #8c8c8c;
      }
      .log-param {
        display: inline;
        font-family: Consolas, monospace;
        font-size: 14px;
      }

      // 滚动条样式（Element Plus风格）
      &::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      &::-webkit-scrollbar-track {
        background: #f5f5f5;
        border-radius: 4px;
      }
      &::-webkit-scrollbar-thumb {
        background: #d9d9d9;
        border-radius: 4px;
        &:hover {
          background: #bfbfbf;
        }
      }
    }
  }
}
</style>
