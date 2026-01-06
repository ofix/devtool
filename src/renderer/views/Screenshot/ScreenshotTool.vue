<template>
    <!-- 截图工具条容器：黑色半透明背景，白色前景色 -->
    <div class="screenshot-toolbar">
      <!-- 每个按钮父容器：64px*64px，子元素48px*48px居中 -->
      <!-- a. 截图按钮 -->
      <div class="tool-btn-wrapper" @click="onDefaultScreenshotClicked">
        <DefaultScreenshot class="tool-icon" />
        <!-- 截图子菜单 -->
        <div class="submenu" v-show="screenshotSubmenuVisible">
          <div class="submenu-item" @click="onWindowScreenshotClicked">活动窗口截图</div>
          <div class="submenu-item" @click="onLongScreenshotClicked">长截图</div>
          <div class="submenu-item" @click="onScrollScreenshotClicked">滚动截图</div>
        </div>
      </div>
  
      <!-- b. 线条按钮 -->
      <div class="tool-btn-wrapper" @mouseenter="onLineBtnMouseEnter" @mouseleave="onLineBtnMouseLeave">
        <Line class="tool-icon" />
        <!-- 线条子菜单 -->
        <div class="submenu" v-show="lineSubmenuVisible">
          <div class="submenu-item" @click="onArrowClicked">箭头</div>
          <div class="submenu-item" @click="onRectClicked">矩形</div>
          <div class="submenu-item" @click="onCircleClicked">圆形</div>
          <div class="submenu-item" @click="onIncrementNumberClicked">递增数字</div>
          <div class="submenu-item" @click="onRoundedStarClicked">圆角星形</div>
        </div>
      </div>
  
      <!-- c. 文字按钮 -->
      <div class="tool-btn-wrapper" @mouseenter="onTextBtnMouseEnter" @mouseleave="onTextBtnMouseLeave">
        <Text class="tool-icon" />
        <!-- 文字子菜单 -->
        <div class="submenu" v-show="textSubmenuVisible">
          <div class="submenu-item" @click="onFontSizeClicked">字体大小</div>
          <div class="submenu-item" @click="onFontFamilyClicked">字体家族</div>
          <div class="submenu-item" @click="onFontColorClicked">字体颜色</div>
        </div>
      </div>
  
      <!-- d. 选择按钮 -->
      <div class="tool-btn-wrapper" @click="onSelectClicked">
        <Select class="tool-icon" />
      </div>
  
      <!-- e. 录制按钮（禁用：灰白色） -->
      <div class="tool-btn-wrapper disabled">
        <Record class="tool-icon" />
        <!-- 录制子菜单（禁用状态不显示） -->
        <div class="submenu" v-show="false">
          <div class="submenu-item">选择录制窗口</div>
          <div class="submenu-item">开始录制</div>
          <div class="submenu-item">停止录制</div>
        </div>
      </div>
  
      <!-- f. 设置按钮（禁用：灰白色） -->
      <div class="tool-btn-wrapper disabled">
        <Setting class="tool-icon" />
      </div>
  
      <!-- g. 取消按钮 -->
      <div class="tool-btn-wrapper" @click="onCancelClicked">
        <Cancel class="tool-icon" />
      </div>
  
      <!-- h. 完成按钮 -->
      <div class="tool-btn-wrapper" @click="onFinishClicked">
        <Finish class="tool-icon" />
      </div>
    </div>
  
    <!-- 截图画布容器 -->
    <canvas ref="screenshotCanvas" class="screenshot-canvas" @mousedown="onCanvasMouseDown" @mousemove="onCanvasMouseMove" @mouseup="onCanvasMouseUp"></canvas>
  </template>
  
  <script setup>
  // 导入 SVG 图标组件（来自 @/components/icons）
  import DefaultScreenshot from '@/components/icons/DefaultScreenshot.vue';
  import Line from '@/components/icons/IconLine.vue';
  import Text from '@/components/icons/IconText.vue';
  import Select from '@/components/icons/IconSelect.vue';
  import Record from '@/components/icons/IconRecordVideo.vue';
  import Setting from '@/components/icons/IconSettings.vue';
  import Cancel from '@/components/icons/IconDelete.vue';
  import Finish from '@/components/icons/IconOk.vue';
  // 导入 MarkManager 类（标注管理）和各类图形类
  import MarkManager from '@/utils/MarkManager';
  import LineShape from '@/utils/shapes/LineShape';
  import ArrowShape from '@/utils/shapes/ArrowShape';
  import RectShape from '@/utils/shapes/RectShape';
  import CircleShape from '@/utils/shapes/CircleShape';
  import IncrementNumberShape from '@/utils/shapes/IncrementNumberShape';
  import RoundedStarShape from '@/utils/shapes/RoundedStarShape';
  import TextShape from '@/utils/shapes/TextShape';
  
  import { ref, reactive, onMounted, onUnmounted } from 'vue';
  
  // 响应式数据：子菜单显示状态
  const screenshotSubmenuVisible = ref(false);
  const lineSubmenuVisible = ref(false);
  const textSubmenuVisible = ref(false);
  
  // 响应式数据：画布相关
  const screenshotCanvas = ref(null);
  const canvasCtx = ref(null);
  const desktopScreenshotBase64 = ref('');
  const isDesktopFrozen = ref(false);
  const isEditing = ref(false); // 是否处于图形编辑模式
  const currentShapeType = ref(''); // 当前编辑的图形类型
  const dragStartPos = ref({ x: 0, y: 0 }); // 鼠标拖动起始位置
  const selectedShape = ref(null); // 选中的图形/文字
  
  // 响应式数据：滚动截图相关
  const scrollScreenshotList = ref([]);
  const scrollIntervalThreshold = ref(1000); // 滚动结束间隔阈值（1秒）
  let scrollTimer = null;
  
  // 初始化标注管理器
  const markManager = ref(new MarkManager());
  
  // ========== 事件函数：截图按钮相关 ==========
  // 默认截图按钮点击事件
  function onDefaultScreenshotClicked() {
    screenshotSubmenuVisible.value = !screenshotSubmenuVisible.value;
    // 关闭其他子菜单
    lineSubmenuVisible.value = false;
    textSubmenuVisible.value = false;
  }
  
  // 活动窗口截图点击事件
  async function onWindowScreenshotClicked() {
    screenshotSubmenuVisible.value = false;
    // 桌面冻住
    isDesktopFrozen.value = true;
    // 获取桌面截图和窗口列表
    await onGetDesktopAndWindowList();
    // 后续实现窗口高亮逻辑
  }
  
  // 长截图点击事件
  async function onLongScreenshotClicked() {
    screenshotSubmenuVisible.value = false;
    isDesktopFrozen.value = true;
    await onGetDesktopAndWindowList();
  }
  
  // 滚动截图点击事件
  async function onScrollScreenshotClicked() {
    screenshotSubmenuVisible.value = false;
    isDesktopFrozen.value = true;
    await onGetDesktopAndWindowList();
  }
  
  // ========== 事件函数：线条按钮相关 ==========
  // 线条按钮鼠标悬浮事件
  function onLineBtnMouseEnter() {
    lineSubmenuVisible.value = true;
    // 关闭其他子菜单
    screenshotSubmenuVisible.value = false;
    textSubmenuVisible.value = false;
  }
  
  // 线条按钮鼠标离开事件
  function onLineBtnMouseLeave() {
    lineSubmenuVisible.value = false;
  }
  
  // 箭头按钮点击事件
  function onArrowClicked() {
    onEnterShapeEditMode('arrow');
  }
  
  // 矩形按钮点击事件
  function onRectClicked() {
    onEnterShapeEditMode('rect');
  }
  
  // 圆形按钮点击事件
  function onCircleClicked() {
    onEnterShapeEditMode('circle');
  }
  
  // 递增数字按钮点击事件
  function onIncrementNumberClicked() {
    onEnterShapeEditMode('incrementNumber');
  }
  
  // 圆角星形按钮点击事件
  function onRoundedStarClicked() {
    onEnterShapeEditMode('roundedStar');
  }
  
  // ========== 事件函数：文字按钮相关 ==========
  // 文字按钮鼠标悬浮事件
  function onTextBtnMouseEnter() {
    textSubmenuVisible.value = true;
    // 关闭其他子菜单
    screenshotSubmenuVisible.value = false;
    lineSubmenuVisible.value = false;
  }
  
  // 文字按钮鼠标离开事件
  function onTextBtnMouseLeave() {
    textSubmenuVisible.value = false;
  }
  
  // 字体大小选择事件
  function onFontSizeClicked() {
    // 实现字体大小选择逻辑（可弹出 Element-plus Select 组件）
  }
  
  // 字体家族选择事件
  function onFontFamilyClicked() {
    // 实现字体家族选择逻辑
  }
  
  // 字体颜色选择事件
  function onFontColorClicked() {
    // 实现字体颜色选择逻辑（可弹出 Element-plus ColorPicker 组件）
  }
  
  // ========== 事件函数：选择按钮相关 ==========
  function onSelectClicked() {
    // 退出编辑模式，进入选择模式
    isEditing.value = false;
    currentShapeType.value = '';
    // 关闭所有子菜单
    screenshotSubmenuVisible.value = false;
    lineSubmenuVisible.value = false;
    textSubmenuVisible.value = false;
  }
  
  // ========== 事件函数：取消/完成按钮相关 ==========
  // 取消截图事件
  function onCancelClicked() {
    // 重置状态，关闭窗口
    isDesktopFrozen.value = false;
    screenshotSubmenuVisible.value = false;
    lineSubmenuVisible.value = false;
    textSubmenuVisible.value = false;
    isEditing.value = false;
    currentShapeType.value = '';
    // 关闭截图窗口
    window.electronIpc.closeScreenshotWindow();
  }
  
  // 完成截图事件
  function onFinishClicked() {
    // 完成截图，保存或复制到剪贴板
    const canvas = screenshotCanvas.value;
    const base64 = canvas.toDataURL('image/png');
    // 可实现复制到剪贴板逻辑
    navigator.clipboard.writeText(base64).then(() => {
      console.log('截图已复制到剪贴板');
    });
    // 重置状态并关闭窗口
    onCancelClicked();
  }
  
  // ========== 事件函数：画布相关 ==========
  // 画布鼠标按下事件
  function onCanvasMouseDown(e) {
    if (!isDesktopFrozen.value) return;
  
    // 获取鼠标在画布上的坐标
    const rect = screenshotCanvas.value.getBoundingClientRect();
    dragStartPos.value = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  
    // 如果处于编辑模式，创建对应图形
    if (isEditing.value && currentShapeType.value) {
      let shape = null;
      switch (currentShapeType.value) {
        case 'line':
          shape = new LineShape(dragStartPos.value.x, dragStartPos.value.y, 0, 0);
          break;
        case 'arrow':
          shape = new ArrowShape(dragStartPos.value.x, dragStartPos.value.y, 0, 0);
          break;
        case 'rect':
          shape = new RectShape(dragStartPos.value.x, dragStartPos.value.y, 0, 0);
          break;
        case 'circle':
          shape = new CircleShape(dragStartPos.value.x, dragStartPos.value.y, 0, 0);
          break;
        case 'incrementNumber':
          shape = new IncrementNumberShape(dragStartPos.value.x, dragStartPos.value.y);
          break;
        case 'roundedStar':
          shape = new RoundedStarShape(dragStartPos.value.x, dragStartPos.value.y);
          break;
        default:
          break;
      }
      if (shape) {
        markManager.value.addShape(shape);
        selectedShape.value = shape;
      }
    }
  }
  
  // 画布鼠标移动事件
  function onCanvasMouseMove(e) {
    if (!isDesktopFrozen.value || !isEditing.value || !selectedShape.value) return;
  
    // 获取鼠标当前坐标
    const rect = screenshotCanvas.value.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
  
    // 更新图形尺寸/位置
    selectedShape.value.updateSize(dragStartPos.value.x, dragStartPos.value.y, currentX, currentY);
    // 重绘画布
    onRedrawCanvas();
  }
  
  // 画布鼠标松开事件
  function onCanvasMouseUp() {
    // 结束图形拖动编辑
    selectedShape.value = null;
  }
  
  // ========== 辅助函数 ==========
  // 获取桌面截图和窗口列表
  async function onGetDesktopAndWindowList() {
    try {
      // 从主进程获取桌面截图
      desktopScreenshotBase64.value = await window.electronIpc.getDesktopScreenshot();
      // 获取窗口列表
      const windowList = await window.electronIpc.enumWindowList();
      console.log('窗口列表：', windowList);
      // 绘制桌面截图到画布
      onDrawDesktopScreenshot();
    } catch (error) {
      console.error('获取桌面和窗口列表失败：', error);
    }
  }
  
  // 绘制桌面截图到画布
  function onDrawDesktopScreenshot() {
    if (!screenshotCanvas.value || !desktopScreenshotBase64.value) return;
  
    const canvas = screenshotCanvas.value;
    const ctx = canvas.getContext('2d');
    canvasCtx.value = ctx;
  
    // 设置画布尺寸为屏幕分辨率
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    canvas.width = screenWidth;
    canvas.height = screenHeight;
  
    // 绘制桌面截图
    const img = new Image();
    img.onload = function() {
      ctx.drawImage(img, 0, 0, screenWidth, screenHeight);
      // 绘制所有标注图形
      markManager.value.drawAllShapes(ctx);
    };
    img.src = desktopScreenshotBase64.value;
  }
  
  // 重绘画布
  function onRedrawCanvas() {
    // 先清空画布，再重新绘制桌面截图和标注
    onDrawDesktopScreenshot();
  }
  
  // 进入图形编辑模式
  function onEnterShapeEditMode(shapeType) {
    lineSubmenuVisible.value = false;
    isEditing.value = true;
    currentShapeType.value = shapeType;
    // 注册右键结束编辑事件（此处通过监听全局右键事件）
    window.addEventListener('contextmenu', onExitEditMode);
  }
  
  // 退出图形编辑模式
  function onExitEditMode() {
    isEditing.value = false;
    currentShapeType.value = '';
    selectedShape.value = null;
    window.removeEventListener('contextmenu', onExitEditMode);
  }
  
  // 滚动截图处理（监听鼠标滚动事件）
  function onHandleScrollScreenshot(e) {
    if (!isDesktopFrozen.value || currentShapeType.value !== 'scrollScreenshot') return;
  
    // 清除之前的定时器
    clearTimeout(scrollTimer);
  
    // 暂存当前滚动后的截图
    const base64 = screenshotCanvas.value.toDataURL('image/png');
    window.electronIpc.saveScrollScreenshot(base64);
    scrollScreenshotList.value.push(base64);
  
    // 设置定时器，超过阈值则结束滚动截图
    scrollTimer = setTimeout(async () => {
      // 通知主进程拼接截图
      const mergedBase64 = await window.electronIpc.finishScrollScreenshot();
      if (mergedBase64) {
        desktopScreenshotBase64.value = mergedBase64;
        onDrawDesktopScreenshot();
      }
    }, scrollIntervalThreshold.value);
  }
  
  // ========== 生命周期 ==========
  onMounted(() => {
    // 监听键盘事件：Ctrl+Z 撤销，Ctrl+R 重做；Mac 下 Command+Z 撤销
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        // 撤销
        markManager.value.undo();
        onRedrawCanvas();
      } else if (e.ctrlKey && e.key === 'r') {
        // 重做
        markManager.value.redo();
        onRedrawCanvas();
      } else if (e.key === 'Delete' && selectedShape.value) {
        // 删除选中的图形
        markManager.value.removeShape(selectedShape.value);
        selectedShape.value = null;
        onRedrawCanvas();
      }
    });
  
    // 监听鼠标滚动事件（用于滚动截图）
    window.addEventListener('wheel', onHandleScrollScreenshot);
  });
  
  onUnmounted(() => {
    // 移除事件监听
    window.removeEventListener('keydown', () => {});
    window.removeEventListener('wheel', onHandleScrollScreenshot);
    clearTimeout(scrollTimer);
  });
  </script>
  
  <style scoped>
  /* 截图工具条样式：黑色半透明背景，白色前景色 */
  .screenshot-toolbar {
    position: fixed;
    top: 50%;
    left: 0;
    transform: translateY(-50%);
    background-color: rgba(0, 0, 0, 0.7);
    padding: 8px;
    border-radius: 0 8px 8px 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 9999;
  }
  
  /* 工具按钮父容器：64px*64px */
  .tool-btn-wrapper {
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 4px;
    transition: background-color 0.2s;
    position: relative;
  }
  
  /* 工具图标：48px*48px，白色 */
  .tool-icon {
    width: 48px;
    height: 48px;
    fill: #ffffff;
    stroke: #ffffff;
  }
  
  /* 按钮悬浮样式 */
  .tool-btn-wrapper:hover {
    background-color: rgba(255, 255, 255, 0.2);
  }
  
  /* 禁用状态：灰白色 */
  .tool-btn-wrapper.disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  
  .tool-btn-wrapper.disabled .tool-icon {
    fill: #cccccc;
    stroke: #cccccc;
  }
  
  /* 子菜单样式 */
  .submenu {
    position: absolute;
    left: 72px;
    top: 0;
    background-color: rgba(0, 0, 0, 0.9);
    border-radius: 4px;
    padding: 4px 0;
    min-width: 120px;
    z-index: 9999;
  }
  
  .submenu-item {
    padding: 8px 16px;
    color: #ffffff;
    font-size: 14px;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .submenu-item:hover {
    background-color: rgba(255, 255, 255, 0.2);
  }
  
  /* 截图画布样式 */
  .screenshot-canvas {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 9998;
    pointer-events: auto;
  }
  </style>