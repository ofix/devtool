<template>
    <div class="palette-container">
      <!-- 标题栏（模拟系统标题栏，可选） -->
      <div class="palette-header">
        <h3>取色结果</h3>
      </div>
  
      <!-- 颜色预览 -->
      <div class="color-preview" :style="{ backgroundColor: color.hex }"></div>
  
      <!-- 颜色值编辑区域 -->
      <div class="color-editor">
        <!-- RGB 输入 -->
        <div class="rgb-group">
          <label>RGB</label>
          <div class="rgb-inputs">
            <input 
              type="number" 
              v-model.number="color.r" 
              min="0" 
              max="255" 
              @input="updateHexFromRgb"
            >
            <input 
              type="number" 
              v-model.number="color.g" 
              min="0" 
              max="255" 
              @input="updateHexFromRgb"
            >
            <input 
              type="number" 
              v-model.number="color.b" 
              min="0" 
              max="255" 
              @input="updateHexFromRgb"
            >
          </div>
        </div>
  
        <!-- HEX 输入 -->
        <div class="hex-group">
          <label>HEX</label>
          <input 
            type="text" 
            v-model="color.hex" 
            @blur="updateRgbFromHex"
            placeholder="#FFFFFF"
          >
        </div>
      </div>
  
      <!-- 操作按钮 -->
      <div class="palette-actions">
        <button class="btn" @click="copyHex">复制 HEX</button>
        <button class="btn" @click="copyRgb">复制 RGB</button>
        <button class="btn primary" @click="closeWindow">关闭</button>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref, onMounted, watch } from 'vue'
  
  // 响应式颜色数据
  const color = ref({
    r: 0,
    g: 0,
    b: 0,
    hex: '#000000'
  })
  
  // 初始化：获取取色结果
  onMounted(async () => {
    // 获取主进程传递的初始颜色
    const initColor = await window.channel.getInitColor()
    color.value = { ...initColor }
  
    // 监听颜色更新（窗口复用场景）
    window.channel.onColorUpdate((newColor) => {
      color.value = { ...newColor }
    })
  })
  
  // 从 RGB 更新 HEX
  const updateHexFromRgb = () => {
    const r = color.value.r.toString(16).padStart(2, '0')
    const g = color.value.g.toString(16).padStart(2, '0')
    const b = color.value.b.toString(16).padStart(2, '0')
    color.value.hex = `#${r}${g}${b}`.toUpperCase()
  }
  
  // 从 HEX 更新 RGB
  const updateRgbFromHex = () => {
    let hex = color.value.hex.replace('#', '').trim()
    if (hex.length !== 6) {
      alert('请输入有效的6位16进制色值')
      hex = '000000'
      color.value.hex = '#000000'
    }
  
    color.value.r = parseInt(hex.substring(0, 2), 16)
    color.value.g = parseInt(hex.substring(2, 4), 16)
    color.value.b = parseInt(hex.substring(4, 6), 16)
  }
  
  // 复制 HEX
  const copyHex = () => {
    window.channel.copyToClipboard(color.value.hex)
  }
  
  // 复制 RGB
  const copyRgb = () => {
    const rgbStr = `${color.value.r},${color.value.g},${color.value.b}`
    window.channel.copyToClipboard(rgbStr)
  }
  
  // 关闭窗口
  const closeWindow = () => {
    // Electron 渲染进程关闭当前窗口
    window.channel.closeWindow('ColorPaletteWnd');
  }
  
  // 简易提示框
  const showToast = (msg) => {
    const toast = document.createElement('div')
    toast.className = 'palette-toast'
    toast.textContent = msg
    document.body.appendChild(toast)
    
    setTimeout(() => {
      toast.classList.add('show')
    }, 10)
    
    setTimeout(() => {
      toast.classList.remove('show')
      setTimeout(() => {
        document.body.removeChild(toast)
      }, 300)
    }, 2000)
  }
  </script>
  
  <style scoped>
  /* 整体容器 */
  .palette-container {
    width: 100%;
    height: 100%;
    padding: 16px;
    box-sizing: border-box;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background-color: #ffffff;
  }
  
  /* 标题栏 */
  .palette-header {
    margin-bottom: 20px;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 8px;
  }
  
  .palette-header h3 {
    margin: 0;
    font-size: 16px;
    color: #333;
    font-weight: 600;
  }
  
  /* 颜色预览块 */
  .color-preview {
    width: 100px;
    height: 100px;
    margin: 0 auto 20px;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  
  /* 颜色编辑区域 */
  .color-editor {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 24px;
  }
  
  .rgb-group, .hex-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .rgb-group label, .hex-group label {
    font-size: 14px;
    color: #666;
    font-weight: 500;
  }
  
  .rgb-inputs {
    display: flex;
    gap: 8px;
  }
  
  .rgb-inputs input {
    flex: 1;
    height: 36px;
    padding: 0 8px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 14px;
    outline: none;
  }
  
  .rgb-inputs input:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }
  
  .hex-group input {
    width: 100%;
    height: 36px;
    padding: 0 8px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 14px;
    outline: none;
  }
  
  .hex-group input:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }
  
  /* 操作按钮 */
  .palette-actions {
    display: flex;
    gap: 8px;
    justify-content: center;
  }
  
  .btn {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .btn:hover {
    opacity: 0.9;
  }
  
  .btn.primary {
    background-color: #3b82f6;
    color: white;
  }
  
  .btn:not(.primary) {
    background-color: #f3f4f6;
    color: #333;
  }
  
  /* 提示框 */
  .palette-toast {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%) translateY(-20px);
    padding: 8px 16px;
    background-color: rgba(0,0,0,0.8);
    color: white;
    border-radius: 4px;
    font-size: 14px;
    opacity: 0;
    transition: all 0.3s;
    pointer-events: none;
  }
  
  .palette-toast.show {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
  }
  </style>