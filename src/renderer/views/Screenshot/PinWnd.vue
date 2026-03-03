<template>
  <div class="pin-image-container" ref="containerRef">
    <!-- 截图展示 -->
    <img :src="imageUrl" class="screenshot-img" @mousedown="startDrag" />
    <!-- 操作按钮（悬浮显示，减少渲染开销） -->
    <div class="pin-controls" @mousedown.stop>
      <el-button
        icon="el-icon-close"
        size="small"
        @click="closeWindow"
      ></el-button>
      <el-button
        icon="el-icon-minus"
        size="small"
        @click="toggleOpacity"
      ></el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { ElButton } from "element-plus";
import { useRoute } from 'vue-router'

// 获取路由实例
const route = useRoute()
const pinId = ref(route.params.pinId);

//
const imageUrl = ref("");
const containerRef = ref(null);
let dragStartPos = { x: 0, y: 0 };
let windowStartPos = { x: 0, y: 0 };
let currentOpacity = ref(1);

// 监听路由参数变化（核心）
watch(
  () => route.params.pinId, // 监听 pinId 参数
  (newPinId, oldPinId) => {
    pinId.value = newPinId
    console.log('pinId变化：', oldPinId, '→', newPinId)
    // 这里可以重新加载对应pinId的钉图数据
  },
  { immediate: true } // 可选：立即执行一次，等同于初始化
)

// 接收主进程传递的截图数据
onMounted(async () => {
  let data = await window.channel.getPinImage(pinId);
  bounds = data.bounds;
  // 加载图片

  // 设置容器尺寸匹配截图
  if (containerRef.value) {
    containerRef.value.style.width = `${bounds.width}px`;
    containerRef.value.style.height = `${bounds.height}px`;
  }
});

// 拖拽逻辑（优化：仅在鼠标按下时监听移动，减少事件监听开销）
function startDrag(e) {
  // 记录初始位置
  dragStartPos = { x: e.clientX, y: e.clientY };
  const currentWindow = window.channel.sendSync("get-current-window");
  windowStartPos = { x: currentWindow.x, y: currentWindow.y };

  // 临时监听鼠标移动和松开
  const onMouseMove = (moveEvent) => {
    const dx = moveEvent.clientX - dragStartPos.x;
    const dy = moveEvent.clientY - dragStartPos.y;
    // 更新窗口位置（直接操作窗口，而非 DOM，减少卡顿）
    window.channel.setPinWindowBounds( {
      x: windowStartPos.x + dx,
      y: windowStartPos.y + dy,
    });
  };

  const onMouseUp = () => {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  };

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}

// 关闭钉图窗口
function closeWindow() {
  window.channel.closePinWnd(pinId);
}

// 切换透明度（可选功能）
function toggleOpacity() {
  currentOpacity.value = currentOpacity.value === 1 ? 0.7 : 1;
  containerRef.value.style.opacity = currentOpacity.value;
}

// 清理事件监听
onUnmounted(() => {
  ipcRenderer.removeAllListeners("set-pin-image");
});
</script>

<style scoped>
/* 核心样式：无背景、占满窗口 */
.pin-image-container {
  width: 100%;
  height: 100%;
  position: relative;
  user-select: none; /* 禁止选中文本，减少卡顿 */
}

.screenshot-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  cursor: move;
}

/* 操作按钮：悬浮显示，减少渲染 */
.pin-controls {
  position: absolute;
  top: 10px;
  right: 10px;
  opacity: 0;
  transition: opacity 0.2s;
  display: flex;
  gap: 5px;
}

.pin-image-container:hover .pin-controls {
  opacity: 1;
}
</style>
