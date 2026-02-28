<template>
  <TitleBar title="拾色器" wndKey="ColorPaletteWnd" />
  <div class="palette-container">
    <!-- 整体左右布局 -->
    <div class="palette-main">
      <!-- 左侧：ColorPickerPanel -->
      <div class="picker-panel-wrapper">
        <el-color-picker-panel
          v-model="pickerColor"
          show-alpha
          :border="false"
          :predefine="predefineColors"
          class="custom-picker-panel"
        />
      </div>

      <!-- 右侧：上下布局 -->
      <div class="color-info-panel">
        <!-- 右侧上半部分：原始色块 + 最新色块 -->
        <div class="color-blocks-wrapper">
          <!-- 原始色块 -->
          <div
            class="color-block init-color"
            :style="{ backgroundColor: initColor.rgba }"
            @click="resetCurrentColor"
            title="点击恢复初始颜色"
          >
            <div class="color-block-label">
              <span>初始色</span>
            </div>
          </div>

          <!-- 最新色块 -->
          <div
            class="color-block current-color"
            :style="{ backgroundColor: currentColor.rgba }"
          >
            <div class="color-block-label">
              <span>当前色</span>
            </div>
          </div>
        </div>

        <!-- 右侧下半部分：RGBA/HEX 颜色值 -->
        <div class="color-values-wrapper">
          <!-- RGBA 行 -->
          <div class="color-value-item">
            <label class="value-label">RGB</label>
            <span class="value-text">{{ currentColor.rgb }}</span>
            <IconCopy
              class="copy-btn"
              @click="copyToClipboard(currentColor.rgb)"
            />
          </div>
          <!-- RGBA 行 -->
          <div class="color-value-item">
            <label class="value-label">RGBA</label>
            <span class="value-text">{{ currentColor.rgba }}</span>
            <IconCopy
              class="copy-btn"
              @click="copyToClipboard(currentColor.rgba)"
            />
          </div>
          <!-- HEX 行（带透明度） -->
          <div class="color-value-item">
            <label class="value-label">HEX</label>
            <span class="value-text">{{ currentColor.hexWithAlpha }}</span>
            <IconCopy
              class="copy-btn"
              @click="copyToClipboard(currentColor.hexWithAlpha)"
            />
          </div>
          <!-- HEX 行（带透明度） -->
          <div class="color-value-item">
            <label class="value-label">HEX1</label>
            <span class="value-text">{{ currentColor.hex }}</span>
            <IconCopy
              class="copy-btn"
              @click="copyToClipboard(currentColor.hex)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from "vue";
import { ElColorPickerPanel } from "element-plus";
import "element-plus/dist/index.css";
import TitleBar from "@/components/TitleBar.vue";

// 预定义颜色（可选，提升体验）
const predefineColors = ref([
  "#FFFFFF", //（纯白）
  "#000000", //（纯黑）
  "#1677FF", //（主蓝）
  "#0066CC", //（链接蓝）
  "#00B42A", //（成功绿）
  "#FF7D00", //（警告橙）
  "#F53F3F", //（危险红）
  "#86909C", //（弱提示灰蓝）
  "#1D2129", //（正文黑）
  "#4E5969", //（二级文本）
  "#86909C", //（三级文本，同 "8"
  "#C9CDD4", //（禁用文本）
  "#E5E6EB", //（边框线灰）
  "#F2F3F5", //（浅背景灰）
  "#F7F8FA", //（超浅背景）
  "#722ED1", //（紫色）
  "#0FC6C4", //（青色）
  "#F53F9F", //（粉色）
  "#FAAD14", //（金色）
  "#0E429F", //（深蓝）
]);

// 初始颜色（响应式存储）
const initColor = ref({
  rgba: "rgba(0, 0, 0, 1)",
  hexWithAlpha: "#000000FF",
});

// 当前选择的颜色（响应式存储）
const currentColor = ref({
  rgb: "rgb(0, 0, 0)",
  rgba: "rgba(0, 0, 0, 1)",
  hex: "#000000",
  hexWithAlpha: "#000000FF",
});

const pickerColor = ref("rgba(0,0,0,1)");

// 初始化：获取主进程传递的初始颜色
onMounted(async () => {
  try {
    const initColorData = (await window.channel.getColorPickerColor()) || {
      r: 0,
      g: 0,
      b: 0,
      a: 1,
    };
    initColor.value = formatColor(initColorData);
    currentColor.value = { ...initColor.value };
    pickerColor.value = initColor.value.rgba;
  } catch (error) {
    console.error("初始化颜色失败：", error);
  }
});

// 颜色格式化：{r,g,b,a} → {rgba, hexWithAlpha}
const formatColor = (colorData) => {
  const { r, g, b, a = 1 } = colorData;
  // RGBA 字符串（0-255 范围）
  const rgb = `rgb(${r}, ${g}, ${b})`;
  const rgba = `rgba(${r}, ${g}, ${b}, ${a})`;
  // 8位 HEX（带透明度）
  const hexR = r.toString(16).padStart(2, "0").toUpperCase();
  const hexG = g.toString(16).padStart(2, "0").toUpperCase();
  const hexB = b.toString(16).padStart(2, "0").toUpperCase();
  const hexA = Math.round(a * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  const hexWithAlpha = `#${hexR}${hexG}${hexB}${hexA}`;
  const hex = `#${hexR}${hexG}${hexB}`;
  return { rgb, rgba, hexWithAlpha, hex };
};

watch(
  () => pickerColor.value,
  (newVal) => {
    if (!newVal) return;
    handleColorChange(newVal);
  },
  { deep: true } // 深度监听对象属性变化（r/g/b/a）
);

// ColorPickerPanel 颜色变化处理
const handleColorChange = (color) => {
  // 正则提取 rgb/rgba 数值
  const colorMatch = color.match(
    /rgb(a?)\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+)\s*)?\)/i
  );
  if (!colorMatch) {
    console.warn("RGB/RGBA 格式解析失败：", color);
    return;
  }

  const [, hasAlpha, rStr, gStr, bStr, aStr] = colorMatch;
  const r = parseInt(rStr, 10);
  const g = parseInt(gStr, 10);
  const b = parseInt(bStr, 10);
  const a = hasAlpha ? parseFloat(aStr) || 1 : 1;

  currentColor.value = formatColor({ r, g, b, a });
};

// 点击初始色块重置当前颜色
const resetCurrentColor = () => {
  pickerColor.value = initColor.value.rgba;
};

// 复制到剪贴板
const copyToClipboard = async (text, successMsg) => {
  try {
    await navigator.clipboard.writeText(text);
    window.channel.closeWindow("ColorPaletteWnd");
  } catch (error) {
    console.error("复制失败：", error);
  }
};
</script>

<style scoped>
/* 整体容器 */
.palette-container {
  width: 100%;
  max-width: 700px;
  padding: 10px;
  height: calc(100vh - 40px);
  overflow-y: hidden;
  box-sizing: border-box;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background-color: #ffffff;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

/* 核心：左右布局容器 */
.palette-main {
  display: flex;
  gap: 20px;
  align-items: stretch; /* 左右高度对齐 */
}

/* 左侧：ColorPickerPanel 容器 */
.picker-panel-wrapper {
  flex: 0 0 324px;
  height: 320px;
}

/* 自定义 ColorPickerPanel 样式（隐藏自带输入框 + 调整尺寸） */
:deep(.custom-picker-panel) {
  width: 100% !important;
  box-sizing: border-box;
}
/* 隐藏 ColorPickerPanel 自带输入框（可选） */
:deep(.custom-picker-panel .el-color-picker-panel__footer) {
  display: none !important;
}

/* 右侧：上下布局容器 */
.color-info-panel {
  flex: 1; /* 占剩余宽度 */
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 右侧上半部分：色块容器（并排布局） */
.color-blocks-wrapper {
  display: flex;
  gap: 16px;
}

/* 色块通用样式 */
.color-block {
  width: 140px;
  height: 100px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.color-block:hover {
  transform: scale(1.02);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

/* 色块标签 */
.color-block-label {
  color: #fff;
  background: rgba(0, 0, 0, 0.6);
  padding: 4px 8px;
  border-radius: 6px;
  text-align: center;
  z-index: 1;
}

.color-block-label span {
  display: block;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 4px;
}

.color-block-label small {
  font-size: 12px;
  opacity: 0.8;
}

/* 右侧下半部分：颜色值容器 */
.color-values-wrapper {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  width: 296px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background-color: #fefefe;
}

/* 颜色值行样式 */
.color-value-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.value-label {
  font-size: 14px;
  color: #666;
  font-weight: 500;
  min-width: 40px;
}

.value-text {
  flex: 1;
  font-size: 14px;
  color: #333;
  padding: 6px 10px;
  background-color: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
}

.copy-btn:hover {
  cursor: pointer;
}

/* 响应式适配（小屏幕自动堆叠） */
@media (max-width: 600px) {
  .palette-main {
    flex-direction: column;
  }
  .picker-panel-wrapper {
    flex: none;
    width: 100%;
  }
  .color-blocks-wrapper {
    flex-direction: column;
    min-height: 300px;
  }
}
</style>
