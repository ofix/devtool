<template>
    <div class="picker-container" @mousemove="handleMouseMove" @click="handleConfirm" @keydown.esc="handleCancel">
      <!-- 吸管光标 -->
      <div 
        class="sucker-cursor"
        :style="{ left: `${cursorX - 12}px`, top: `${cursorY - 12}px` }"
      ></div>
  
      <!-- 32*32 放大区域（边界自适应） -->
      <div 
        class="zoom-area"
        :style="{ 
          left: `${zoomX}px`, 
          top: `${zoomY}px`,
          backgroundImage: `url(${screenDataUrl})`,
          backgroundPosition: `-${cursorX - 16}px -${cursorY - 16}px`
        }"
      >
        <!-- 中心点十字线 -->
        <div class="crosshair"></div>
      </div>
  
      <!-- 颜色值显示 -->
      <div 
        class="color-info"
        :style="{ left: `${infoX}px`, top: `${infoY}px` }"
      >
        RGB: {{ currentColor.rgb }} <br/>
        HEX: {{ currentColor.hex }}
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref, onMounted, onUnmounted, watch } from 'vue'
  import { ElMessage } from 'element-plus'
  
  // 响应式数据
  const cursorX = ref(0)
  const cursorY = ref(0)
  const currentColor = ref({ r: 0, g: 0, b: 0, rgb: '0,0,0', hex: '#000000' })
  const screenDataUrl = ref('')
  const screenWidth = ref(0)
  const screenHeight = ref(0)
  
  // 放大区域/颜色信息位置（边界自适应）
  const zoomX = ref(0)
  const zoomY = ref(0)
  const infoX = ref(0)
  const infoY = ref(0)
  
  // 初始化屏幕数据
  onMounted(async () => {
    // 获取屏幕尺寸和快照
    const screenData = await window.channel.getDesktopScreenshot();
    screenWidth.value = screenData.width
    screenHeight.value = screenData.height
    screenDataUrl.value = screenData.screenDataUrl
  
    // 监听鼠标移动（阻止默认行为，避免穿透）
    document.addEventListener('mousemove', handleMouseMove, { passive: false })
    document.addEventListener('click', handleConfirm)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') handleCancel()
    })
  })
  
  onUnmounted(() => {
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('click', handleConfirm)
  })
  
  // 鼠标移动处理
  const handleMouseMove = async (e) => {
    // 更新光标坐标
    cursorX.value = e.clientX
    cursorY.value = e.clientY
  
    // 获取当前像素颜色
    const color = await window.channel.getColor({ x: cursorX.value, y: cursorY.value })
    currentColor.value = color
  
    // 计算放大区域位置（边界自适应）
    calculateZoomPosition()
  }
  
  // 计算放大区域/颜色信息位置（核心：始终可见）
  const calculateZoomPosition = () => {
    const zoomSize = 32 // 放大区域尺寸
    const infoHeight = 40 // 颜色信息高度
    const offset = 20 // 光标与放大区域的间距
  
    // 初始位置：光标右下方
    let x = cursorX.value + offset
    let y = cursorY.value + offset
  
    // 右边界检测：超出则移到光标左侧
    if (x + zoomSize > screenWidth.value) {
      x = cursorX.value - zoomSize - offset
    }
    // 下边界检测：超出则移到光标上方
    if (y + zoomSize + infoHeight > screenHeight.value) {
      y = cursorY.value - zoomSize - offset - infoHeight
    }
    // 左/上边界兜底
    if (x < 0) x = offset
    if (y < 0) y = offset
  
    // 更新放大区域位置
    zoomX.value = x
    zoomY.value = y
  
    // 更新颜色信息位置（放大区域下方）
    infoX.value = x
    infoY.value = y + zoomSize + 5
  }
  
  // 确认取色（点击左键）
  const handleConfirm = () => {
    window.electronAPI.confirmPick(currentColor.value)
    ElMessage.success('取色成功，色值已复制！')
  }
  
  // 取消取色（ESC键）
  const handleCancel = () => {
    window.electronAPI.cancelPick()
  }
  </script>
  
  <style scoped>
  .picker-container {
    width: 100vw;
    height: 100vh;
    cursor: none; /* 隐藏默认光标 */
    user-select: none;
  }
  
  /* 吸管光标样式 */
  .sucker-cursor {
    position: absolute;
    width: 24px;
    height: 24px;
    background: url('@/assets/sucker.png') no-repeat center;
    background-size: 100%;
    pointer-events: none;
    z-index: 9999;
  }
  
  /* 32*32 放大区域 */
  .zoom-area {
    position: absolute;
    width: 32px;
    height: 32px;
    border: 1px solid #ffffff;
    box-shadow: 0 0 8px rgba(0, 0, 0, 0.8);
    image-rendering: pixelated; /* 像素化放大，不模糊 */
    background-size: calc(100% * 8); /* 放大8倍，显示中心32*32区域 */
    pointer-events: none;
    z-index: 9998;
  }
  
  /* 中心点十字线 */
  .crosshair {
    position: absolute;
    width: 100%;
    height: 100%;
    &::before, &::after {
      content: '';
      position: absolute;
      background: #ffffff;
      box-shadow: 0 0 2px #000000;
    }
    &::before {
      width: 1px;
      height: 100%;
      left: 50%;
      top: 0;
    }
    &::after {
      width: 100%;
      height: 1px;
      left: 0;
      top: 50%;
    }
  }
  
  /* 颜色信息展示 */
  .color-info {
    position: absolute;
    padding: 4px 8px;
    background: rgba(0, 0, 0, 0.8);
    color: #ffffff;
    font-size: 12px;
    border-radius: 4px;
    pointer-events: none;
    z-index: 9997;
    white-space: nowrap;
  }
  </style>