<template>
  <!-- 外层容器：包含标题栏 + 主体内容 -->
  <div class="converter-root" ref="rootRef">
    <!-- 1. 新增标题栏组件：支持拖拽、渐变背景、隐藏/关闭按钮 -->
    <!-- <div class="title-bar" ref="titleBarRef">
      <div class="title-drag-area">
        <span class="title-text">单位换算</span>
      </div>
      <div class="title-buttons">
        <el-button
          type="text"
          icon="el-icon-minus"
          class="title-btn hide-btn"
          @click="handleHide"
        />
        <el-button
          type="text"
          icon="el-icon-close"
          class="title-btn close-btn"
          @click="handleClose"
        />
      </div>
    </div> -->

    <!-- 原有主体内容 -->
    <el-container class="converter-container">
      <!-- 2. 左侧菜单宽度缩小一半：240px → 120px -->
      <el-aside width="120px" class="menu-aside">
        <div class="menu-wrapper" ref="menuRef">
          <div
            class="menu-item"
            v-for="(item, index) in converterTypes"
            :key="index"
            :class="{ active: activeType === item.key }"
            @click="switchConverter(item.key)"
          >
            <el-icon class="menu-icon"><component :is="item.icon" /></el-icon>
            <span class="menu-text">{{ item.name }}</span>
          </div>
        </div>
      </el-aside>

      <!-- 右侧换算区域 -->
      <el-container class="converter-main">
        <el-main v-if="activeType" class="converter-content">
          <div class="converter-title">
            {{ converterTypes.find((t) => t.key === activeType).name }}换算
          </div>

          <el-row :gutter="20" class="converter-row">
            <!-- 左侧：待转换值 -->
            <el-col :span="12" class="converter-column">
              <div class="input-label">待转换值</div>
              <!-- 优化1：新增清空图标按钮 -->
              <el-input
                v-model.number="sourceValue"
                type="number"
                placeholder="请输入数值"
                class="value-input"
                @input="calculateResult"
                clearable
                @clear="handleSourceClear"
              />

              <div class="unit-selector">
                <div class="selector-label">当前单位：</div>
                <el-select
                  v-model="sourceUnit"
                  class="unit-select"
                  @change="calculateResult"
                >
                  <el-option
                    v-for="unit in currentUnits"
                    :key="unit.key"
                    :label="unit.name"
                    :value="unit.key"
                  />
                </el-select>

                <div class="unit-list">
                  <div class="list-title">支持的单位：</div>
                  <!-- 3. 优化单位标签样式：区分选中/未选中 -->
                  <div class="unit-tags">
                    <div
                      v-for="unit in currentUnits"
                      :key="unit.key"
                      class="unit-tag"
                      :class="{
                        'unit-tag-active': sourceUnit === unit.key,
                        'unit-tag-normal': sourceUnit !== unit.key,
                      }"
                      @click="sourceUnit = unit.key"
                    >
                      {{ unit.name }}
                    </div>
                  </div>
                </div>
              </div>
            </el-col>

            <!-- 右侧：转换后值 -->
            <el-col :span="12" class="converter-column">
              <div class="input-label">转换后值</div>
              <!-- 优化2：新增复制图标按钮 + 修复禁用状态颜色 -->
              <el-input
                v-model.number="targetValue"
                type="number"
                placeholder="换算结果"
                class="value-input target-input"
                readonly
                :suffix-icon="Copy"
                @click.suffix="handleCopyTargetValue"
              ></el-input>

              <div class="unit-selector">
                <div class="selector-label">当前单位：</div>
                <el-select
                  v-model="targetUnit"
                  class="unit-select"
                  @change="calculateResult"
                >
                  <el-option
                    v-for="unit in currentUnits"
                    :key="unit.key"
                    :label="unit.name"
                    :value="unit.key"
                  />
                </el-select>

                <div class="unit-list">
                  <div class="list-title">支持的单位：</div>
                  <!-- 3. 优化单位标签样式：区分选中/未选中 -->
                  <div class="unit-tags">
                    <div
                      v-for="unit in currentUnits"
                      :key="unit.key"
                      class="unit-tag"
                      :class="{
                        'unit-tag-active': targetUnit === unit.key,
                        'unit-tag-normal': targetUnit !== unit.key,
                      }"
                      @click="targetUnit = unit.key"
                    >
                      {{ unit.name }}
                    </div>
                  </div>
                </div>
              </div>
            </el-col>
          </el-row>
        </el-main>

        <el-main v-else class="empty-tip">
          <el-empty description="请选择左侧的换算类型开始换算" />
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue";
// 引入复制图标
import Copy from "@/icons/IconCapture.vue";
import Scale from "@/icons/IconCapture.vue";
import Monitor from "@/icons/IconCapture.vue";
import Timer from "@/icons/IconCapture.vue";
import Thermometer from "@/icons/IconCapture.vue";
import Volume from "@/icons/IconCapture.vue";
import Weight from "@/icons/IconCapture.vue";
import Area from "@/icons/IconCapture.vue";
import Money from "@/icons/IconCapture.vue";
import Speed from "@/icons/IconCapture.vue";
import Energy from "@/icons/IconCapture.vue";
import Power from "@/icons/IconCapture.vue";
import DataStorage from "@/icons/IconCapture.vue";
import { ElMessage } from "element-plus";

// 响应式引用：用于拖拽标题栏
const rootRef = ref(null);
const titleBarRef = ref(null);
let isDragging = ref(false);
let dragStartPos = ref({ x: 0, y: 0 });

// 1. 定义所有换算类型及单位配置
const converterConfig = {
  length: {
    name: "长度",
    icon: Scale,
    baseUnit: "meter",
    units: [
      { key: "millimeter", name: "毫米(mm)", factor: 0.001 },
      { key: "centimeter", name: "厘米(cm)", factor: 0.01 },
      { key: "meter", name: "米(m)", factor: 1 },
      { key: "kilometer", name: "千米(km)", factor: 1000 },
      { key: "inch", name: "英寸(in)", factor: 0.0254 },
      { key: "foot", name: "英尺(ft)", factor: 0.3048 },
      { key: "yard", name: "码(yd)", factor: 0.9144 },
      { key: "mile", name: "英里(mi)", factor: 1609.34 },
    ],
  },
  area: {
    name: "面积",
    icon: Area,
    baseUnit: "square_meter",
    units: [
      { key: "square_millimeter", name: "平方毫米(mm²)", factor: 0.000001 },
      { key: "square_centimeter", name: "平方厘米(cm²)", factor: 0.0001 },
      { key: "square_meter", name: "平方米(m²)", factor: 1 },
      { key: "square_kilometer", name: "平方千米(km²)", factor: 1000000 },
      { key: "square_inch", name: "平方英寸(in²)", factor: 0.00064516 },
      { key: "square_foot", name: "平方英尺(ft²)", factor: 0.092903 },
      { key: "acre", name: "英亩(acre)", factor: 4046.86 },
      { key: "square_mile", name: "平方英里(mi²)", factor: 2589988.11 },
    ],
  },
  weight: {
    name: "重量",
    icon: Weight,
    baseUnit: "kilogram",
    units: [
      { key: "milligram", name: "毫克(mg)", factor: 0.000001 },
      { key: "gram", name: "克(g)", factor: 0.001 },
      { key: "kilogram", name: "千克(kg)", factor: 1 },
      { key: "ton", name: "吨(t)", factor: 1000 },
      { key: "ounce", name: "盎司(oz)", factor: 0.0283495 },
      { key: "pound", name: "磅(lb)", factor: 0.453592 },
      { key: "stone", name: "英石(st)", factor: 6.35029 },
    ],
  },
  volume: {
    name: "体积",
    icon: Volume,
    baseUnit: "cubic_meter",
    units: [
      { key: "milliliter", name: "毫升(mL)", factor: 0.000001 },
      { key: "liter", name: "升(L)", factor: 0.001 },
      { key: "cubic_centimeter", name: "立方厘米(cm³)", factor: 0.000001 },
      { key: "cubic_meter", name: "立方米(m³)", factor: 1 },
      { key: "fluid_ounce", name: "液盎司(fl oz)", factor: 0.0000295735 },
      { key: "gallon", name: "加仑(gal)", factor: 0.00378541 },
      { key: "cubic_foot", name: "立方英尺(ft³)", factor: 0.0283168 },
    ],
  },
  temperature: {
    name: "温度",
    icon: Thermometer,
    baseUnit: "celsius",
    units: [
      {
        key: "celsius",
        name: "摄氏度(℃)",
        toBase: (val) => val,
        fromBase: (val) => val,
      },
      {
        key: "fahrenheit",
        name: "华氏度(℉)",
        toBase: (val) => ((val - 32) * 5) / 9,
        fromBase: (val) => (val * 9) / 5 + 32,
      },
      {
        key: "kelvin",
        name: "开尔文(K)",
        toBase: (val) => val - 273.15,
        fromBase: (val) => val + 273.15,
      },
    ],
  },
  time: {
    name: "时间",
    icon: Timer,
    baseUnit: "second",
    units: [
      { key: "millisecond", name: "毫秒(ms)", factor: 0.001 },
      { key: "second", name: "秒(s)", factor: 1 },
      { key: "minute", name: "分钟(min)", factor: 60 },
      { key: "hour", name: "小时(h)", factor: 3600 },
      { key: "day", name: "天(d)", factor: 86400 },
      { key: "week", name: "周(w)", factor: 604800 },
      { key: "month", name: "月(30天)", factor: 2592000 },
      { key: "year", name: "年(365天)", factor: 31536000 },
    ],
  },
  speed: {
    name: "速度",
    icon: Speed,
    baseUnit: "meter_per_second",
    units: [
      { key: "meter_per_second", name: "米/秒(m/s)", factor: 1 },
      { key: "kilometer_per_hour", name: "千米/小时(km/h)", factor: 0.277778 },
      { key: "mile_per_hour", name: "英里/小时(mph)", factor: 0.44704 },
      { key: "knot", name: "节(kn)", factor: 0.514444 },
      { key: "foot_per_second", name: "英尺/秒(ft/s)", factor: 0.3048 },
    ],
  },
  energy: {
    name: "能量",
    icon: Energy,
    baseUnit: "joule",
    units: [
      { key: "joule", name: "焦耳(J)", factor: 1 },
      { key: "kilojoule", name: "千焦(kJ)", factor: 1000 },
      { key: "calorie", name: "卡路里(cal)", factor: 4.184 },
      { key: "kilocalorie", name: "千卡(kcal)", factor: 4184 },
      { key: "british_thermal_unit", name: "英热单位(BTU)", factor: 1055.06 },
      { key: "kilowatt_hour", name: "千瓦时(kWh)", factor: 3600000 },
    ],
  },
  power: {
    name: "功率",
    icon: Power,
    baseUnit: "watt",
    units: [
      { key: "watt", name: "瓦特(W)", factor: 1 },
      { key: "kilowatt", name: "千瓦(kW)", factor: 1000 },
      { key: "horsepower", name: "马力(hp)", factor: 745.7 },
      {
        key: "british_thermal_unit_per_hour",
        name: "英热单位/小时(BTU/h)",
        factor: 0.293071,
      },
    ],
  },
  storage: {
    name: "数据存储",
    icon: DataStorage,
    baseUnit: "byte",
    units: [
      { key: "byte", name: "字节(B)", factor: 1 },
      { key: "kilobyte", name: "千字节(KB)", factor: 1024 },
      { key: "megabyte", name: "兆字节(MB)", factor: 1048576 },
      { key: "gigabyte", name: "吉字节(GB)", factor: 1073741824 },
      { key: "terabyte", name: "太字节(TB)", factor: 1099511627776 },
      { key: "bit", name: "比特(bit)", factor: 0.125 },
      { key: "kilobit", name: "千比特(kb)", factor: 128 },
    ],
  },
  display: {
    name: "显示器尺寸",
    icon: Monitor,
    baseUnit: "inch",
    units: [
      { key: "inch", name: "英寸(in)", factor: 1 },
      { key: "centimeter", name: "厘米(cm)", factor: 0.393701 },
      { key: "millimeter", name: "毫米(mm)", factor: 0.0393701 },
    ],
  },
  currency: {
    name: "货币",
    icon: Money,
    baseUnit: "cny",
    units: [
      { key: "cny", name: "人民币(CNY)", factor: 1 },
      { key: "usd", name: "美元(USD)", factor: 0.14 },
      { key: "eur", name: "欧元(EUR)", factor: 0.13 },
      { key: "gbp", name: "英镑(GBP)", factor: 0.11 },
      { key: "jpy", name: "日元(JPY)", factor: 20 },
    ],
  },
};

// 2. 响应式数据
const menuRef = ref(null);
const activeType = ref("");
const sourceValue = ref(0);
const targetValue = ref(0);
const sourceUnit = ref("");
const targetUnit = ref("");

// 新增：清空待转换值方法
const handleSourceClear = () => {
  sourceValue.value = 0;
  calculateResult();
};

// 新增：复制转换后值到剪贴板方法
const handleCopyTargetValue = () => {
  // 无有效值时不执行复制
  if (!targetValue || targetValue.value === 0) return;
  // 写入剪贴板
  navigator.clipboard
    .writeText(targetValue.value.toString())
    .then(() => {
      // 可按需添加复制成功提示
      ElMessage({
        type: "success",
        message: "复制成功",
        duration: 2000, // 提示显示时长（毫秒），默认3000
        center: true, // 提示居中显示
        showClose: true, // 显示关闭按钮
      });
      console.log("转换后值已复制到剪贴板：", targetValue.value);
    })
    .catch((err) => {
      console.error("复制失败：", err);
    });
};

// 3. 计算属性：转换类型列表
const converterTypes = computed(() => {
  return Object.keys(converterConfig).map((key) => ({
    key,
    name: converterConfig[key].name,
    icon: converterConfig[key].icon,
  }));
});

// 4. 计算属性：当前类型的单位列表
const currentUnits = computed(() => {
  if (!activeType.value) return [];
  return converterConfig[activeType.value].units;
});

// 6. 窗口控制：隐藏/关闭
const handleHide = () => {
  window.channel.hideWindow("UnitConvertWnd"); // 通知主进程隐藏窗口
};
const handleClose = () => {
  window.channel.closeWindow("UnitConvertWnd"); // 通知主进程关闭窗口
};

// 7. 切换换算类型
const switchConverter = (type) => {
  activeType.value = type;
  if (currentUnits.value.length > 0) {
    sourceUnit.value = currentUnits.value[0].key;
    targetUnit.value = currentUnits.value[1]?.key || currentUnits.value[0].key;
  }
  sourceValue.value = 0;
  targetValue.value = 0;
};

// 8. 核心换算逻辑
const calculateResult = () => {
  if (
    !activeType.value ||
    !sourceUnit.value ||
    !targetUnit.value ||
    isNaN(sourceValue.value)
  ) {
    targetValue.value = 0;
    return;
  }

  const config = converterConfig[activeType.value];
  const sourceUnitConfig = currentUnits.value.find(
    (u) => u.key === sourceUnit.value
  );
  const targetUnitConfig = currentUnits.value.find(
    (u) => u.key === targetUnit.value
  );

  if (config.baseUnit === "celsius") {
    const baseValue = sourceUnitConfig.toBase(sourceValue.value);
    targetValue.value = targetUnitConfig.fromBase(baseValue);
  } else {
    const baseValue = sourceValue.value * sourceUnitConfig.factor;
    targetValue.value = baseValue / targetUnitConfig.factor;
  }
  targetValue.value = parseFloat(targetValue.value.toFixed(6));
};

// 9. 监听与初始化
watch([sourceValue, sourceUnit, targetUnit], () => {
  calculateResult();
});

watch(
  converterTypes,
  () => {
    if (converterTypes.value.length > 0) {
      switchConverter(converterTypes.value[0].key);
    }
  },
  { immediate: true }
);

onMounted(() => {});
</script>

<style scoped>
/* 根容器：包含标题栏 + 主体 */
.converter-root {
  height: 100vh;
  width: 100vw;
  background-color: #f5f7fa;
}

/* 1. 标题栏样式：Windows 11 紫色渐变 */
.title-bar {
  -webkit-app-region: drag;
  user-select: none;
  height: 38px;
  background: #fff; /* Windows文件夹选中渐变 */
  border-bottom: 1px solid #ccc;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  -webkit-app-region: drag; /* Electron拖拽支持 */
  user-select: none; /* 禁止选中文字 */
}

.title-drag-area {
  flex: 1;
  display: flex;
  justify-content: center; /* 标题居中 */
}

.title-text {
  color: #8b5cf6;
  font-size: 14px;
  font-weight: bold;
  /* font-weight: 500; */
}

.title-buttons {
  -webkit-app-region: no-drag; /* 按钮区域禁止拖拽 */
  display: flex;
  gap: 5px;
}

.title-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #fff;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.title-btn:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

.close-btn:hover {
  background-color: #e74c3c; /* 关闭按钮hover红色 */
}

/* 2. 主体容器样式 */
.converter-container {
  height: calc(100vh - 38px); /* 减去标题栏高度 */
}

/* 左侧菜单：宽度缩小为120px */
.menu-aside {
  background-color: #fff;
  border-right: 1px solid #e6e8eb;
  height: 100%;
  padding: 16px 0;
}

.menu-wrapper {
  height: 100%;
  overflow-y: auto;
  scrollbar-width: none; /* Firefox 默认隐藏 */
}

.menu-wrapper::-webkit-scrollbar {
  width: 0; /* Chrome 默认隐藏 */
}

.menu-wrapper:hover::-webkit-scrollbar {
  width: 6px; /* 悬浮显示 */
}

.menu-wrapper::-webkit-scrollbar-thumb {
  background-color: #c0c4cc;
  border-radius: 3px;
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 12px 10px; /* 适配窄宽度，减少内边距 */
  cursor: pointer;
  transition: background-color 0.2s;
  margin: 0 4px;
  border-radius: 4px;
  font-size: 12px; /* 缩小文字 */
}

.menu-item.active {
  background-color: #e8f4ff;
  color: #409eff;
}

.menu-item:hover:not(.active) {
  background-color: #f5f7fa;
}

.menu-icon {
  margin-right: 8px; /* 缩小图标间距 */
  font-size: 14px;
}

/* 右侧换算区域 */
.converter-main {
  padding: 20px;
  height: 100%;
}

.empty-tip {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.converter-content {
  background-color: #fff;
  border-radius: 8px;
  padding: 24px;
  height: 100%;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.08);
  overflow-y: auto;
  /* 4. 优化右侧滚动条：仅需要时显示 + 美化 */
  scrollbar-width: thin; /* Firefox */
  scrollbar-color: #b8c2cc #f5f7fa;
}

/* 右侧滚动条美化（Chrome/Safari） */
.converter-content::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.converter-content::-webkit-scrollbar-thumb {
  background-color: #b8c2cc;
  border-radius: 3px;
  visibility: hidden; /* 默认隐藏 */
}

.converter-content:hover::-webkit-scrollbar-thumb {
  visibility: visible; /* 悬浮显示 */
}

.converter-content::-webkit-scrollbar-track {
  background-color: #f5f7fa;
  border-radius: 3px;
}

.converter-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 24px;
  color: #303133;
}

.converter-row {
  height: calc(100% - 40px);
}

.converter-column {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.input-label {
  font-size: 14px;
  color: #606266;
  margin-bottom: 8px;
  font-weight: 500;
}

.value-input {
  margin-bottom: 20px;
}

/* 优化3：修复禁用输入框文字颜色 */
:deep(.target-input .el-input__inner) {
  color: #303133 !important; /* 正常文字颜色 */
  background-color: #f8f9fa !important; /* 轻微背景区分，可选 */
  opacity: 1 !important; /* 取消透明度 */
}

/* 优化2：复制图标样式 + 禁用状态 */
:deep(.copy-icon-disabled) {
  color: #c0c4cc !important;
  cursor: not-allowed !important;
}
:deep(.el-input__suffix) {
  cursor: pointer;
}

.unit-selector {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.selector-label {
  font-size: 13px;
  color: #606266;
  margin-bottom: 8px;
}

.unit-select {
  width: 200px;
  margin-bottom: 16px;
}

.unit-list {
  flex: 1;
}

.list-title {
  font-size: 13px;
  color: #909399;
  margin-bottom: 8px;
}

.unit-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
  /* 单位标签滚动条美化 */
  scrollbar-width: thin;
}

.unit-tags::-webkit-scrollbar {
  width: 4px;
}

.unit-tags::-webkit-scrollbar-thumb {
  background-color: #dcdfe6;
  border-radius: 2px;
  visibility: hidden;
}

.unit-tags:hover::-webkit-scrollbar-thumb {
  visibility: visible;
}

/* 3. 优化单位标签样式：区分选中/未选中 */
.unit-tag {
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.unit-tag-normal {
  background-color: #f5f7fa;
  color: #606266;
  border: 1px solid #e6e8eb;
}

.unit-tag-normal:hover {
  background-color: #e8f4ff;
  border-color: #c6e2ff;
}

.unit-tag-active {
  background: linear-gradient(135deg, #6d28d9, #8b5cf6); /* 与标题栏渐变一致 */
  color: #fff;
  border: 1px solid #8b5cf6;
}
</style>
