<template>
  <div class="debug-panel-page">
    <!-- 顶部操作栏（统一容器，和日志卡片对齐） -->
    <div class="debug-header">
      <div class="header-inner">
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
            @change="handleAutoScrollChange"
          />
        </el-space>
      </div>
    </div>

    <!-- 日志展示区域（修复滚动问题） -->
    <div class="debug-content">
      <el-card class="log-card" shadow="never" border="false">
        <div ref="logContainerRef" class="log-container" @scroll="handleScroll">
          <!-- 空日志提示 -->
          <el-empty
            v-if="logList.length === 0"
            description="暂无日志数据"
            class="empty-tip"
          />

          <!-- 日志列表 -->
          <div class="log-list">
            <div
              v-for="(log, index) in logList"
              :key="`log-${log.id || index}-${log.timestamp}`"
              class="log-item"
              :class="`log-type-${log.type || 'log'}`"
            >
              <!-- 日志头部（时间+类型，模拟console样式） -->
              <div class="log-header">
                <span class="timestamp-text">{{
                  formatTimestamp(log.timestamp)
                }}</span>
              </div>
              <!-- 日志内容（模拟console.log参数排版） -->
              <div class="log-content">
                <template
                  v-for="(param, pIndex) in log.args"
                  :key="`param-${index}-${pIndex}`"
                >
                  <span :class="[getParamClass(param), 'log-param']">
                    {{ formatParamValue(param) }}
                  </span>
                  <span
                    v-if="pIndex < log.args.length - 1"
                    class="param-separator"
                  >
                  </span>
                </template>
              </div>
            </div>
          </div>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, watch, nextTick } from "vue";
import { ElMessage } from "element-plus";

// ========== 常量配置 ==========
// 日志最大数量（防止内存溢出）
const MAX_LOG_COUNT = 1000;

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
 * 根据日志类型获取样式类名
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
 * 获取参数样式类名（模拟console颜色）
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
      return "log-function";
    default:
      return "";
  }
};

/**
 * 格式化参数显示值（更贴近console.log）
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
      const seen = new WeakSet();
      return JSON.stringify(
        param,
        (key, value) => {
          if (typeof value === "object" && value !== null) {
            if (seen.has(value)) return "[Circular]";
            seen.add(value);
          }
          return value;
        },
        2,
      );
    } catch (e) {
      return `[${e.name}] ${e.message}`;
    }
  } else if (typeof param === "function") {
    return "ƒ " + param.name || "anonymous()";
  }
  return String(param);
};

/**
 * 格式化时间戳（精准到毫秒，模拟console）
 */
const formatTimestamp = (timestampStr) => {
  if (!timestampStr) return new Date().toLocaleString();
  const date =
    typeof timestampStr === "string" ? new Date(timestampStr) : timestampStr;
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: false,
  });
};

/**
 * 滚动到底部（修复滚动失效问题）
 */
const scrollToBottom = () => {
  if (!autoScroll.value || !shouldAutoScroll.value || !logContainerRef.value)
    return;

  nextTick(() => {
    const container = logContainerRef.value;
    // 强制触发滚动（兼容所有场景）
    container.scrollTop = container.scrollHeight;
  });
};

/**
 * 处理滚动事件（精准判断是否到底部）
 */
const handleScroll = () => {
  if (!logContainerRef.value || !autoScroll.value) return;

  const container = logContainerRef.value;
  // 精准判断：滚动条距离底部小于20px视为到底部
  const scrollBottom =
    container.scrollHeight - (container.scrollTop + container.clientHeight);
  shouldAutoScroll.value = scrollBottom < 20;
};

/**
 * 自动滚动开关变化
 */
const handleAutoScrollChange = (val) => {
  if (val) {
    shouldAutoScroll.value = true;
    scrollToBottom();
  }
};

/**
 * 添加日志（控制数量，保证滚动）
 */
const addLog = (log) => {
  if (!log.timestamp) log.timestamp = new Date().toISOString();
  // 限制日志数量，超出则删除最旧的
  if (logList.length >= MAX_LOG_COUNT) {
    logList.shift();
  }
  logList.push(log);
  scrollToBottom();
};

/**
 * 清空日志
 */
const clearLogs = () => {
  logList.length = 0;
  window.channel?.clearDebugLogs();
  ElMessage.success("日志已清空");
};

// 监听自动滚动状态
watch(autoScroll, (val) => val && scrollToBottom());

// ========== 生命周期 ==========
onMounted(() => {
  if (!window.channel) {
    ElMessage.warning("未检测到通信通道，无法接收日志");
    return;
  }

  // 监听历史日志
  const handleIncrementalLogs = (_, logs) => {
    try {
      if (Array.isArray(logs) && logs.length) {
        const newLogs = logs.filter(
          (l) => !logList.some((item) => item.id === l.id),
        );
        newLogs.forEach((log) => addLog(log));
      }
    } catch (e) {
      ElMessage.error(`处理历史日志异常: ${e.message}`);
    }
  };

  // 监听实时日志
  const handleNewLog = (_, newLog) => addLog(newLog);

  // 监听清空指令
  const handleClearLog = () => clearLogs();

  // 绑定监听
  window.channel.on("incremental-logs", handleIncrementalLogs);
  window.channel.on("new-log", handleNewLog);
  window.channel.on("clear-log", handleClearLog);

  // 修复：替换可选链赋值为条件判断（核心修改）
  if (logContainerRef.value) {
    logContainerRef.value._logListeners = {
      handleIncrementalLogs,
      handleNewLog,
      handleClearLog,
    };
  }
});

onUnmounted(() => {
  if (!window.channel || !logContainerRef.value?._logListeners) return;

  // 移除所有监听，防止内存泄漏
  const { handleIncrementalLogs, handleNewLog, handleClearLog } =
    logContainerRef.value._logListeners;
  window.channel.off("incremental-logs", handleIncrementalLogs);
  window.channel.off("new-log", handleNewLog);
  window.channel.off("clear-log", handleClearLog);

  logList.length = 0;
});
</script>

<style scoped lang="scss">
.debug-panel-page {
  width: 100%;
  height: 100vh;
  padding: 0; /* 移除全局padding，统一在内部容器控制 */
  margin: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column; /* 垂直布局，确保内容区占满剩余高度 */
}

// 顶部操作栏（和日志内容对齐）
.debug-header {
  width: 100%;
  padding: 16px;
  box-sizing: border-box;
  border-bottom: 1px solid #e8e8e8;

  .header-inner {
    max-width: 100%;
    width: 100%;
    // 和日志容器的padding保持一致，实现对齐
    padding: 0 4px;
  }
}

// 日志内容区（修复滚动核心）
.debug-content {
  flex: 1; /* 占满剩余高度，关键！ */
  width: 100%;
  overflow: hidden; /* 防止内容溢出 */
  padding: 0 16px 16px;
  box-sizing: border-box;

  .log-card {
    height: 100%;
    border: 0;
    box-shadow: none;
    margin: 0;

    :deep(.el-card__body) {
      padding: 0; /* 移除卡片默认内边距，避免嵌套padding导致对齐问题 */
      height: 100%;
    }

    .log-container {
      width: 100%;
      height: 100%; /* 必须设置100%高度，触发滚动 */
      overflow-x: auto;
      overflow-y: auto;
      background-color: #ffffff;
      border-radius: 4px;
      box-sizing: border-box;
      padding: 16px;

      // 空日志提示
      .empty-tip {
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #999;
      }

      // 日志列表容器（确保高度自适应）
      .log-list {
        width: 100%;
        min-height: 100%;
        box-sizing: border-box;
      }

      // 日志项（模拟console样式）
      .log-item {
        width: 100%;
        margin: 4px 0;
        padding: 8px 12px;
        border-radius: 4px;
        box-sizing: border-box;
        font-family: Consolas, "Microsoft YaHei UI", monospace;
        font-size: 14px;
        line-height: 1.5;

        // 不同类型日志背景色（贴近console）
        &.log-type-log {
          background-color: #f9f9f9;
        }
        &.log-type-info {
          background-color: #e6f7ff;
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

        // 日志头部（时间+类型）
        .log-header {
          display: flex;
          align-items: center;
          margin-bottom: 4px;
          font-size: 12px;

          .timestamp-text {
            color: #888;
            margin-right: 8px;
            font-family: Arial, sans-serif;
          }

          .type-badge {
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 600;
            color: #fff;

            &.type-log {
              background-color: #1890ff;
            }
            &.type-info {
              background-color: #52c41a;
            }
            &.type-warn {
              background-color: #faad14;
            }
            &.type-error {
              background-color: #f5222d;
            }
            &.type-debug {
              background-color: #722ed1;
            }
          }
        }

        // 日志内容（参数排版）
        .log-content {
          width: 100%;
          white-space: pre-wrap; /* 保留换行和空格，关键！ */
          word-break: break-all;
          padding-left: 4px;

          .param-separator {
            display: inline-block;
            width: 8px;
          }
        }

        // 参数样式（模拟console颜色）
        .log-param {
          display: inline;
          font-size: 14px;
        }
        .log-string {
          color: #008000; /* console字符串绿色 */
        }
        .log-primitive {
          color: #0000ff; /* 数字/布尔蓝色 */
        }
        .log-object {
          color: #800080; /* 对象紫色 */
        }
        .log-function {
          color: #795e26; /* 函数棕色 */
        }
        .log-undefined,
        .log-null {
          color: #888; /* 灰色 */
        }
      }
    }

    // 自定义滚动条（优化体验）
    .log-container::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }
    .log-container::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 5px;
    }
    .log-container::-webkit-scrollbar-thumb {
      background: #c1c1c1;
      border-radius: 5px;
      &:hover {
        background: #a8a8a8;
      }
    }
  }
}
</style>
