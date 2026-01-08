<template>
  <div class="screenshot-container" @wheel="onHandleScrollScreenshot">
    <!-- 截图画布容器 -->
    <canvas
      ref="screenshotCanvas"
      class="screenshot-canvas"
      @mousedown="onCanvasMouseDown"
      @mousemove="onCanvasMouseMove"
      @mouseup="onCanvasMouseUp"
      @contextmenu.prevent="onCanvasContextMenu"
    ></canvas>

    <!-- 选区信息显示 -->
    <div v-if="selectionRect && isSelecting" class="selection-info">
      尺寸: {{ selectionRect.width }} × {{ selectionRect.height }}
    </div>

    <!-- 截图编辑标注工具条 -->
    <div class="capture-edit-toolbar" v-show="showEditToolbar">
      <div class="edit-toolbar-content">
        <BtnSelect
          @click="onSelect"
          :class="{ active: currentTool === 'select' }"
        />
        <BtnLine
          @click="onClickLine"
          :class="{ active: currentTool === 'line' }"
        />
        <BtnRect
          @click="onClickRect"
          :class="{ active: currentTool === 'rect' }"
        />
        <BtnArrow
          @click="onClickArrow"
          :class="{ active: currentTool === 'arrow' }"
        />
        <BtnIncrementNumber
          @click="onClickIncrementNumber"
          :class="{ active: currentTool === 'number' }"
        />
        <BtnEclipse
          @click="onClickEllipse"
          :class="{ active: currentTool === 'ellipse' }"
        />
        <BtnText
          @click="onClickText"
          :class="{ active: currentTool === 'text' }"
        />
        <div class="toolbar-divider"></div>
        <BtnCancel @click="onClickCancel" />
        <BtnFinish @click="onClickFinish" />
      </div>
    </div>
  </div>
</template>

<script setup>
// 编辑截图按钮
import BtnSelect from "@components/icons/IconSelect.vue";
import BtnLine from "@components/icons/IconLine.vue";
import BtnRect from "@components/icons/IconRect.vue";
import BtnArrow from "@components/icons/IconArrow.vue";
import BtnEclipse from "@components/icons/IconEclipse.vue";
import BtnIncrementNumber from "@components/icons/IconNumber.vue";
import BtnText from "@components/icons/IconText.vue";
import BtnCancel from "@components/icons/IconCloseBox.vue";
import BtnFinish from "@components/icons/IconOk.vue";

import { ref, reactive, onMounted, onUnmounted, nextTick } from "vue";

// 响应式数据
const screenshotCanvas = ref(null);
const canvasCtx = ref(null);
const screenshotImage = ref(null);
const isSelecting = ref(false);
const isDragging = ref(false);
const showEditToolbar = ref(false);
const currentTool = ref("select"); // 当前工具
// 添加截图模式变量
const screenshotMode = ref("rectangle"); // rectangle, window, scroll
// 初始化时监听截图模式
onMounted(() => {
  initScreenshot();

  // 监听来自主进程的截图模式
  if (window.electronAPI && window.electronAPI.onScreenshotMode) {
    window.electronAPI.onScreenshotMode((mode) => {
      console.log("接收到截图模式:", mode);
      screenshotMode.value = mode;

      // 根据模式调整功能
      switch (mode) {
        case "window":
          startWindowCaptureMode();
          break;
        case "scroll":
          startScrollCaptureMode();
          break;
        case "rectangle":
        default:
          startRectangleCaptureMode();
          break;
      }
    });
  }

  // 通知主进程窗口已就绪
  if (window.electronAPI && window.electronAPI.screenshotWindowReady) {
    window.electronAPI.screenshotWindowReady();
  }

  // 注册全局快捷键
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      onClickCancel();
    } else if (e.key === "Enter") {
      onClickFinish();
    }
  });
});

onUnmounted(() => {
  if (window.electronAPI && window.electronAPI.removeScreenshotModeListener) {
    window.electronAPI.removeScreenshotModeListener();
  }
  window.removeEventListener("keydown", (e) => {});
});

// 矩形截图模式
function startRectangleCaptureMode() {
  console.log("进入矩形截图模式");
  isSelecting.value = true;
  showEditToolbar.value = false;
  // 重置所有状态
  selectionRect.x = 0;
  selectionRect.y = 0;
  selectionRect.width = 0;
  selectionRect.height = 0;
  marks.value = [];
  currentMark.value = null;
  currentTool.value = "select";

  // 重新绘制
  drawScreenshot();
}

// 窗口截图模式
function startWindowCaptureMode() {
  console.log("进入窗口截图模式");
  isSelecting.value = false;
  showEditToolbar.value = false;
  marks.value = [];
  currentMark.value = null;
  currentTool.value = "select";

  // 获取窗口列表
  getWindowList();

  // 绘制窗口高亮
  drawWindowHighlights();
}

// 滚动截图模式
function startScrollCaptureMode() {
  console.log("进入滚动截图模式");
  isSelecting.value = true;
  showEditToolbar.value = false;
  currentTool.value = "scroll";

  // 显示滚动提示
  showScrollHint();
}

// 获取窗口列表
async function getWindowList() {
  try {
    const windowList = await window.electronAPI.enumWindowList();
    console.log("窗口列表:", windowList);
    // 这里可以绘制窗口边框
  } catch (error) {
    console.error("获取窗口列表失败:", error);
  }
}

// 绘制窗口高亮
function drawWindowHighlights() {
  // TODO: 实现窗口高亮绘制
  console.log("绘制窗口高亮");
}

// 显示滚动提示
function showScrollHint() {
  // TODO: 实现滚动提示
  console.log("显示滚动截图提示");
}

// 修改鼠标按下事件处理
function onCanvasMouseDown(e) {
  if (!screenshotCanvas.value) return;

  const rect = screenshotCanvas.value.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  mouseStartPos.value = { x, y };
  mouseCurrentPos.value = { x, y };

  if (screenshotMode.value === "window") {
    // 窗口模式：选择窗口
    handleWindowSelect(x, y);
  } else {
    // 矩形/滚动模式：开始选区
    handleRectangleStart(x, y);
  }

  e.preventDefault();
}

// 处理窗口选择
function handleWindowSelect(x, y) {
  console.log("选择窗口:", x, y);
  // TODO: 实现窗口选择逻辑
  // 1. 找到鼠标位置下的窗口
  // 2. 高亮显示选中的窗口
  // 3. 显示编辑工具栏
}

// 处理矩形开始
function handleRectangleStart(x, y) {
  if (!isSelecting.value) {
    // 开始选区
    isSelecting.value = true;
    isDragging.value = true;
    selectionRect.x = x;
    selectionRect.y = y;
    selectionRect.width = 0;
    selectionRect.height = 0;
  } else {
    // 在选区内
    if (isInSelection(x, y)) {
      // 开始移动选区
      isDragging.value = true;
    }
  }
}

// 修改鼠标移动事件处理
function onCanvasMouseMove(e) {
  if (!screenshotCanvas.value) return;

  const rect = screenshotCanvas.value.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  mouseCurrentPos.value = { x, y };

  if (screenshotMode.value === "window") {
    // 窗口模式：高亮鼠标下的窗口
    highlightWindowUnderCursor(x, y);
  } else if (isDragging.value && isSelecting.value) {
    // 更新选区尺寸
    const width = x - mouseStartPos.value.x;
    const height = y - mouseStartPos.value.y;

    selectionRect.width = width;
    selectionRect.height = height;

    // 重绘
    drawScreenshot();
  }

  // 更新鼠标样式
  updateCursorStyle(x, y);
}

// 高亮鼠标下的窗口
function highlightWindowUnderCursor(x, y) {
  // TODO: 实现窗口高亮逻辑
  console.log("高亮窗口:", x, y);
}

// 选区相关
const selectionRect = reactive({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
});

// 鼠标位置
const mouseStartPos = ref({ x: 0, y: 0 });
const mouseCurrentPos = ref({ x: 0, y: 0 });

// 标注图形管理器
const marks = ref([]);
const currentMark = ref(null);

// 初始化截图
async function initScreenshot() {
  try {
    // 获取桌面截图
    const base64 = await window.electronAPI.getDesktopScreenshot();
    if (!base64) {
      console.error("获取截图失败");
      return;
    }

    // 创建图片对象
    screenshotImage.value = new Image();
    screenshotImage.value.onload = () => {
      drawScreenshot();
    };
    screenshotImage.value.src = base64;

    // 启用鼠标事件
    window.electronAPI.enableMouseEvents?.();
  } catch (error) {
    console.error("初始化截图失败:", error);
  }
}

// 绘制截图
function drawScreenshot() {
  if (!screenshotCanvas.value || !screenshotImage.value) return;

  const canvas = screenshotCanvas.value;
  const ctx = canvas.getContext("2d");
  canvasCtx.value = ctx;

  // 设置画布尺寸
  canvas.width = screenshotImage.value.width;
  canvas.height = screenshotImage.value.height;

  // 绘制截图
  ctx.drawImage(screenshotImage.value, 0, 0);

  // 绘制选区
  if (isSelecting.value || selectionRect.width > 0) {
    drawSelection(ctx);
  }

  // 绘制标注
  drawMarks(ctx);
}

// 绘制选区
function drawSelection(ctx) {
  const { x, y, width, height } = selectionRect;

  if (width > 0 && height > 0) {
    // 绘制选区外部蒙层
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(0, 0, ctx.canvas.width, y);
    ctx.fillRect(0, y, x, height);
    ctx.fillRect(x + width, y, ctx.canvas.width - x - width, height);
    ctx.fillRect(
      0,
      y + height,
      ctx.canvas.width,
      ctx.canvas.height - y - height
    );
    ctx.restore();

    // 绘制选区边框
    ctx.strokeStyle = "#1890ff";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(x, y, width, height);
    ctx.setLineDash([]);

    // 绘制控制点
    drawControlPoints(ctx, x, y, width, height);
  }
}

// 绘制控制点
function drawControlPoints(ctx, x, y, width, height) {
  const points = [
    { x: x, y: y }, // 左上
    { x: x + width / 2, y: y }, // 上中
    { x: x + width, y: y }, // 右上
    { x: x + width, y: y + height / 2 }, // 右中
    { x: x + width, y: y + height }, // 右下
    { x: x + width / 2, y: y + height }, // 下中
    { x: x, y: y + height }, // 左下
    { x: x, y: y + height / 2 }, // 左中
  ];

  ctx.fillStyle = "#1890ff";
  points.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

// 绘制标注
function drawMarks(ctx) {
  marks.value.forEach((mark) => {
    mark.draw(ctx);
  });

  if (currentMark.value) {
    currentMark.value.draw(ctx);
  }
}

// 鼠标按下事件
function onCanvasMouseDown(e) {
  if (!screenshotCanvas.value) return;

  const rect = screenshotCanvas.value.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  mouseStartPos.value = { x, y };
  mouseCurrentPos.value = { x, y };

  if (!isSelecting.value) {
    // 开始选区
    isSelecting.value = true;
    isDragging.value = true;
    selectionRect.x = x;
    selectionRect.y = y;
    selectionRect.width = 0;
    selectionRect.height = 0;
  } else {
    // 在选区内
    if (isInSelection(x, y)) {
      // 开始移动选区
      isDragging.value = true;
    }
  }

  e.preventDefault();
}

// 鼠标移动事件
function onCanvasMouseMove(e) {
  if (!screenshotCanvas.value) return;

  const rect = screenshotCanvas.value.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  mouseCurrentPos.value = { x, y };

  if (isDragging.value && isSelecting.value) {
    // 更新选区尺寸
    const width = x - mouseStartPos.value.x;
    const height = y - mouseStartPos.value.y;

    selectionRect.width = width;
    selectionRect.height = height;

    // 重绘
    drawScreenshot();
  }

  // 更新鼠标样式
  updateCursorStyle(x, y);
}

// 鼠标松开事件
function onCanvasMouseUp(e) {
  if (!screenshotCanvas.value) return;

  if (isDragging.value && isSelecting.value) {
    const width = mouseCurrentPos.value.x - mouseStartPos.value.x;
    const height = mouseCurrentPos.value.y - mouseStartPos.value.y;

    // 确保宽度和高度为正
    if (width < 0) {
      selectionRect.x = mouseCurrentPos.value.x;
      selectionRect.width = Math.abs(width);
    } else {
      selectionRect.width = width;
    }

    if (height < 0) {
      selectionRect.y = mouseCurrentPos.value.y;
      selectionRect.height = Math.abs(height);
    } else {
      selectionRect.height = height;
    }

    // 完成选区
    isDragging.value = false;

    // 显示编辑工具栏
    if (selectionRect.width > 10 && selectionRect.height > 10) {
      showEditToolbar.value = true;
      positionEditToolbar();
    }
  }

  e.preventDefault();
}

// 右键菜单
function onCanvasContextMenu(e) {
  e.preventDefault();
  onClickCancel();
}

// 判断点是否在选区内
function isInSelection(x, y) {
  return (
    x >= selectionRect.x &&
    x <= selectionRect.x + selectionRect.width &&
    y >= selectionRect.y &&
    y <= selectionRect.y + selectionRect.height
  );
}

// 更新鼠标样式
function updateCursorStyle(x, y) {
  if (!screenshotCanvas.value || !isSelecting.value) return;

  let cursor = "default";

  if (isInSelection(x, y)) {
    cursor = "move";
  } else if (isNearEdge(x, y)) {
    cursor = getEdgeCursor(x, y);
  }

  screenshotCanvas.value.style.cursor = cursor;
}

// 判断是否靠近边缘
function isNearEdge(x, y) {
  const threshold = 8;
  const { x: sx, y: sy, width, height } = selectionRect;

  return (
    Math.abs(x - sx) < threshold ||
    Math.abs(x - (sx + width)) < threshold ||
    Math.abs(y - sy) < threshold ||
    Math.abs(y - (sy + height)) < threshold
  );
}

// 获取边缘光标
function getEdgeCursor(x, y) {
  const { x: sx, y: sy, width, height } = selectionRect;
  const threshold = 8;

  const nearLeft = Math.abs(x - sx) < threshold;
  const nearRight = Math.abs(x - (sx + width)) < threshold;
  const nearTop = Math.abs(y - sy) < threshold;
  const nearBottom = Math.abs(y - (sy + height)) < threshold;

  if (nearLeft && nearTop) return "nwse-resize";
  if (nearRight && nearTop) return "nesw-resize";
  if (nearLeft && nearBottom) return "nesw-resize";
  if (nearRight && nearBottom) return "nwse-resize";
  if (nearLeft || nearRight) return "ew-resize";
  if (nearTop || nearBottom) return "ns-resize";

  return "default";
}

// 定位编辑工具栏
function positionEditToolbar() {
  nextTick(() => {
    const toolbar = document.querySelector(".capture-edit-toolbar");
    if (!toolbar) return;

    const { x, y, width, height } = selectionRect;

    // 在选区下方显示工具栏
    const toolbarHeight = 50;
    const margin = 10;

    let toolbarX = x;
    let toolbarY = y + height + margin;

    // 确保工具栏不超出屏幕
    if (toolbarY + toolbarHeight > window.innerHeight) {
      toolbarY = y - toolbarHeight - margin;
    }

    if (toolbarX + toolbar.offsetWidth > window.innerWidth) {
      toolbarX = window.innerWidth - toolbar.offsetWidth;
    }

    toolbar.style.left = toolbarX + "px";
    toolbar.style.top = toolbarY + "px";
  });
}

// 工具按钮点击事件
function onSelect() {
  currentTool.value = "select";
}

function onClickLine() {
  currentTool.value = "line";
  // 进入线条绘制模式
}

function onClickRect() {
  currentTool.value = "rect";
  // 进入矩形绘制模式
}

function onClickArrow() {
  currentTool.value = "arrow";
  // 进入箭头绘制模式
}

function onClickEllipse() {
  currentTool.value = "ellipse";
  // 进入椭圆绘制模式
}

function onClickIncrementNumber() {
  currentTool.value = "number";
  // 进入数字标注模式
}

function onClickText() {
  currentTool.value = "text";
  // 进入文本标注模式
}

// 取消截图
function onClickCancel() {
  window.electronAPI.cancelScreenshot();
}

// 完成截图
async function onClickFinish() {
  if (
    !screenshotCanvas.value ||
    !selectionRect.width ||
    !selectionRect.height
  ) {
    return;
  }

  try {
    // 裁剪选区
    const canvas = document.createElement("canvas");
    canvas.width = selectionRect.width;
    canvas.height = selectionRect.height;
    const ctx = canvas.getContext("2d");

    // 绘制选区内容
    ctx.drawImage(
      screenshotCanvas.value,
      selectionRect.x,
      selectionRect.y,
      selectionRect.width,
      selectionRect.height,
      0,
      0,
      selectionRect.width,
      selectionRect.height
    );

    // 添加标注
    // TODO: 在截图上绘制标注

    // 获取图片数据
    const imageData = canvas.toDataURL("image/png");

    // 发送到主进程处理
    await window.electronAPI.finishScreenshot(imageData);
  } catch (error) {
    console.error("完成截图失败:", error);
  }
}

// 滚动截图处理
function onHandleScrollScreenshot(e) {
  if (currentTool.value !== "scroll") return;
  // TODO: 实现滚动截图逻辑
}

onMounted(() => {
  initScreenshot();

  // 注册全局快捷键
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      onClickCancel();
    } else if (e.key === "Enter") {
      onClickFinish();
    }
  });
});

onUnmounted(() => {
  window.removeEventListener("keydown", (e) => {});
});
</script>

<style scoped>
.screenshot-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 2147483647;
  cursor: crosshair;
}

.screenshot-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.selection-info {
  position: fixed;
  top: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-family: monospace;
  z-index: 2147483647;
}

.capture-edit-toolbar {
  position: fixed;
  background: rgba(0, 0, 0, 0.85);
  border-radius: 8px;
  padding: 8px;
  z-index: 2147483647;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.edit-toolbar-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.edit-toolbar-content ::v-deep(svg) {
  width: 24px;
  height: 24px;
  cursor: pointer;
  fill: #ffffff;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.edit-toolbar-content ::v-deep(svg:hover) {
  background: rgba(255, 255, 255, 0.1);
  fill: #409eff;
}

.edit-toolbar-content ::v-deep(svg.active) {
  background: rgba(64, 158, 255, 0.2);
  fill: #409eff;
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: rgba(255, 255, 255, 0.2);
  margin: 0 8px;
}
</style>
