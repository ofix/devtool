<template>
  <!-- 日志显示容器 -->
  <div
    ref="logContainerRef"
    class="log-container"
    :style="{ width: width, height: height }"
  >
    <div
      v-for="(log, index) in logList"
      :key="`log-${index}-${log.timestamp.getTime()}`"
      class="log-item"
    >
      <template
        v-for="(param, pIndex) in log.params"
        :key="`param-${index}-${pIndex}`"
      >
        <span v-if="pIndex > 0">&nbsp;</span>
        <span :class="[getParamClass(param), 'log-param']">
          {{ formatParamValue(param) }}
        </span>
      </template>
    </div>
    "ItemCount: " {{ logList.length }}
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, reactive } from "vue";
import logManager from "@/common/LogManager";

// 组件Props
const props = defineProps({
  width: {
    type: String,
    default: "100%",
  },
  height: {
    type: String,
    default: "400px",
  },
  autoScroll: {
    type: Boolean,
    default: true,
  },
});

// 响应式日志列表（改为数组形式，更适合增量push）
const logList = reactive([]);
// 容器DOM引用
const logContainerRef = ref(null);
// 标记是否需要自动滚动（避免手动滚动后被自动滚动打断）
const shouldAutoScroll = ref(true);

// 格式化参数类型样式类名
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

// 格式化参数显示值
const formatParamValue = (param) => {
  if (typeof param === "string") {
    return `"${param}"`;
  } else if (param === null) {
    return "null";
  } else if (typeof param === "undefined") {
    return "undefined";
  } else if (typeof param === "object") {
    return JSON.stringify(param, null, 2);
  } else if (typeof param === "function") {
    return "[Function]";
  }
  return String(param);
};

// 自动滚动到底部方法
const scrollToBottom = () => {
  if (props.autoScroll && shouldAutoScroll.value && logContainerRef.value) {
    const container = logContainerRef.value;
    // 使用requestAnimationFrame确保滚动时机准确
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }
};

// 监听手动滚动事件（优化体验：手动滚动后暂停自动滚动）
const handleScroll = () => {
  if (!logContainerRef.value) return;
  const container = logContainerRef.value;
  // 判断是否滚动到最底部（允许10px误差）
  const isAtBottom =
    container.scrollTop + container.clientHeight >= container.scrollHeight - 10;
  shouldAutoScroll.value = isAtBottom;
};

// 组件挂载时注册回调
onMounted(() => {
  // 初始化回调：全量同步历史日志
  const initCallback = (logs) => {
    logList.length = 0;
    logList.push(...logs);
    // 初始化完成后滚动到底部
    scrollToBottom();
  };

  // 增量更新回调：只添加新日志
  const addCallback = (newLog) => {
    logList.push(newLog);
    // 新增日志后滚动到底部
    scrollToBottom();
  };

  // 注册回调
  logManager.registerCallbacks(initCallback, addCallback);

  // 监听滚动事件（判断是否手动滚动）
  if (logContainerRef.value) {
    logContainerRef.value.addEventListener("scroll", handleScroll);
  }
});

// 组件卸载时移除回调和事件监听
onUnmounted(() => {
  logManager.unregisterCallbacks();
  if (logContainerRef.value) {
    logContainerRef.value.removeEventListener("scroll", handleScroll);
  }
});
</script>

<style scoped>
.log-container {
  background-color: #1e1e1e;
  color: #ffffff;
  padding: 10px;
  box-sizing: border-box;
  font-family: Consolas, monospace;
  font-size: 14px;
  line-height: 1.5;
  overflow-y: scroll;
  scrollbar-width: none;
  -ms-overflow-style: none;
  position: relative;
}

.log-container::-webkit-scrollbar {
  width: 0;
  height: 0;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.log-container:hover::-webkit-scrollbar {
  width: 8px;
  opacity: 1;
}

.log-container::-webkit-scrollbar-track {
  background: #2d2d2d;
  border-radius: 4px;
}

.log-container::-webkit-scrollbar-thumb {
  background: #666;
  border-radius: 4px;
}

.log-container::-webkit-scrollbar-thumb:hover {
  background: #888;
}

.log-item {
  margin: 4px 0;
  padding: 2px 4px;
  border-radius: 2px;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-primitive {
  color: #a8ff60;
}
.log-string {
  color: #66d9ef;
}
.log-object {
  color: #ff73fd;
}
.log-undefined {
  color: #888888;
}
.log-null {
  color: #888888;
}
.log-param {
  display: inline;
}
</style>
