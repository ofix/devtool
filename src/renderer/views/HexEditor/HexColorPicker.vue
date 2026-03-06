<template>
  <!-- 拆分v-model为bind + event -->
  <el-color-picker
    :model-value="localColor"
    v-show="localVisible"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
    class="color-picker"
    @change="handleChange"
    @close="handleClose"
    @open="handleOpen"
    :predefine="predefinedColors"
    popper-class="custom-color-picker"
  ></el-color-picker>
</template>

<script setup>
import { ref, watch } from "vue";

const PREDEFINED_COLORS = [
  "#FF0000",
  "#FF9900",
  "#FFFF00",
  "#00FF00",
  "#00FFFF",
  "#0099FF",
  "#0000FF",
  "#9900FF",
  "#FF00FF",
  "#FF0099",
  "#666666",
  "#999999",
  "#333333",
  "#0066CC",
  "#669900",
  "#CC3300",
];

// 定义Props（只读）
const props = defineProps({
  // 控制显隐的prop
  modelValue: {
    type: Boolean,
    default: false,
  },
  // 初始颜色prop
  color: {
    type: String,
    default: "#666666",
  },
  // 位置prop
  position: {
    type: Object,
    default: () => ({ x: 0, y: 0 }),
  },
});

// 定义事件（触发更新）
const emit = defineEmits([
  "update:modelValue", // 标准的v-model更新事件
  "confirm", // 确认选择颜色
  "cancel", // 取消选择
]);

// 组件内部响应式变量（可写）
const localVisible = ref(props.modelValue); // 本地显隐状态
const localColor = ref(props.color); // 本地颜色状态

// 预定义颜色常量
const predefinedColors = PREDEFINED_COLORS;

// 监听外部prop变化，同步到本地变量
watch(
  () => props.modelValue,
  (newVal) => {
    localVisible.value = newVal;
    // 如果重新显示，重置颜色为外部传入的初始值
    if (newVal) {
      localColor.value = props.color;
    }
  }
);

// 监听外部颜色prop变化
watch(
  () => props.color,
  (newVal) => {
    localColor.value = newVal;
  }
);

// 颜色选择确认
const handleChange = (color) => {
  emit("confirm", color); // 通知父组件选择的颜色
  emit("update:modelValue", false); // 通知父组件关闭选择器
  localVisible.value = false; // 本地关闭
};

// 选择器关闭（点击外部/取消）
const handleClose = () => {
  emit("update:modelValue", false); // 通知父组件关闭
  emit("cancel"); // 通知父组件取消选择
  localVisible.value = false; // 本地关闭
};

// 选择器打开（可选）
const handleOpen = () => {
  localVisible.value = true;
};
</script>

<style scoped>
.color-picker {
  position: fixed;
  z-index: 9998;
}

.custom-color-picker {
  z-index: 9999 !important;
}
</style>
