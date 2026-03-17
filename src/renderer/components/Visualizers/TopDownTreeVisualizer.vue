<template>
  <div class="mp4-tree-visualizer">
    <!-- 按钮控制区（使用 Vue3 内置组件风格） -->
    <div class="control-bar">
      <button class="btn btn-primary" @click="handleZoomIn">放大 (+)</button>
      <button class="btn btn-primary" @click="handleZoomOut">缩小 (-)</button>
      <button class="btn btn-primary" @click="handleReset">重置视图</button>
      <button class="btn btn-success" @click="handleCenter">居中视图</button>
    </div>

    <!-- 画布容器（宽高可配置） -->
    <div class="canvas-container" ref="canvasContainer">
      <canvas ref="canvas"></canvas>
    </div>

    <!-- 悬浮提示 -->
    <teleport to="body">
      <div
        class="tooltip"
        v-if="hoveredNode"
        :style="{ left: `${tooltipX}px`, top: `${tooltipY}px` }"
      >
        {{ hoveredNode.desc }} | 值：{{ hoveredNode.value }}
      </div>
    </teleport>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from "vue";
import TopDownTreeVisualizer from "./TopDownTreeVisualizer.js";

// 定义 props（外部传入配置、数据）
const props = defineProps({
  // 树形数据（MP4 节点数据）
  treeData: {
    type: Object,
    required: true,
  },
  // 画布配置
  canvasConfig: {
    type: Object,
    default: () => ({
      width: "100%",
      height: "80vh",
    }),
  },
  // 可视化配置
  visualizerConfig: {
    type: Object,
    default: () => ({}),
  },
});

// 响应式数据
const canvas = ref(null);
const canvasContainer = ref(null);
const visualizer = ref(null);
const hoveredNode = ref(null);
const tooltipX = ref(0);
const tooltipY = ref(0);

// 方法定义
/**
 * 放大视图
 */
const handleZoomIn = () => {
  visualizer.value?.setScale(visualizer.value.state.scale + 0.1);
};

/**
 * 缩小视图
 */
const handleZoomOut = () => {
  visualizer.value?.setScale(visualizer.value.state.scale - 0.1);
};

/**
 * 重置视图
 */
const handleReset = () => {
  visualizer.value?.resetView();
};

/**
 * 居中视图
 */
const handleCenter = () => {
  visualizer.value?.centerView();
};

/**
 * 初始化可视化实例
 */
const initVisualizer = async () => {
  await nextTick();

  // 设置画布尺寸
  const container = canvasContainer.value;
  const canvasEl = canvas.value;
  canvasEl.width = container.clientWidth;
  canvasEl.height = container.clientHeight;

  // 创建可视化实例
  visualizer.value = new TopDownTreeVisualizer(
    canvasEl,
    props.treeData,
    props.visualizerConfig
  );

  // 初始化事件
  visualizer.value.initEvents();

  // 监听节点点击（可向外暴露）
  visualizer.value.onNodeClick = (node) => {
    console.log("节点点击：", node);
    // 可通过 emit 向外传递
    // emit('node-click', node);
  };

  // 监听节点悬浮
  visualizer.value.onNodeHover = (node) => {
    hoveredNode.value = node;
    if (node) {
      // 获取鼠标位置（需结合事件对象，这里简化处理）
      document.addEventListener("mousemove", (e) => {
        tooltipX.value = e.clientX + 10;
        tooltipY.value = e.clientY + 10;
      });
    }
  };
};

// 生命周期
onMounted(() => {
  initVisualizer();
});

onUnmounted(() => {
  // 销毁可视化实例
  visualizer.value?.destroy();
});

// 监听数据变化，更新可视化
watch(
  () => props.treeData,
  (newData) => {
    visualizer.value?.updateTreeData(newData);
  },
  { deep: true }
);

// 监听画布配置变化，更新尺寸
watch(
  () => props.canvasConfig,
  async () => {
    await nextTick();
    const container = canvasContainer.value;
    canvas.value.width = container.clientWidth;
    canvas.value.height = container.clientHeight;
    visualizer.value?.initCanvasSize();
  },
  { deep: true }
);
</script>

<style scoped>
/* 按钮样式（Vue3 内置组件风格） */
.control-bar {
  display: flex;
  gap: 10px;
  padding: 10px;
  background: #f5f5f5;
  border-radius: 8px;
  margin-bottom: 10px;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary {
  background: #409eff;
  color: white;
}

.btn-primary:hover {
  background: #6669ff;
}

.btn-success {
  background: #67c23a;
  color: white;
}

.btn-success:hover {
  background: #52c41a;
}

/* 画布容器 */
.canvas-container {
  width: v-bind("canvasConfig.width");
  height: v-bind("canvasConfig.height");
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  overflow: hidden;
  cursor: grab;
}

.canvas-container:active {
  cursor: grabbing;
}

canvas {
  width: 100%;
  height: 100%;
}

/* 悬浮提示 */
.tooltip {
  position: fixed;
  padding: 10px 15px;
  background: rgba(0, 0, 0, 0.85);
  color: white;
  font-size: 14px;
  border-radius: 6px;
  pointer-events: none;
  z-index: 9999;
  max-width: 400px;
}
</style>
