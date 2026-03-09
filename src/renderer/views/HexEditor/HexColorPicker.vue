<template>
    <!-- 把 v-show 移到外层 div 上，避免指令直接作用在 el-color-picker 上 -->
    <div class="color-picker-wrapper" v-show="localVisible">
      <el-color-picker
        :model-value="localColor"
        :style="{ left: `${position.x}px`, top: `${position.y}px` }"
        class="color-picker"
        @update:model-value="handleModelValueChange"
        @change="handleChange"
        @close="handleClose"
        :predefine="predefinedColors"
        popper-class="custom-color-picker"
      ></el-color-picker>
    </div>
  </template>
  
  <script setup>
  import { ref, watch, computed } from "vue";
  
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
    modelValue: {
      type: Boolean,
      default: false,
    },
    color: {
      type: String,
      default: "#666666",
    },
    position: {
      type: Object,
      default: () => ({ x: 0, y: 0 }),
      validator: (val) => val.x !== undefined && val.y !== undefined
    },
  });
  
  // 定义事件
  const emit = defineEmits(["update:modelValue", "confirm", "cancel"]);
  
  // 组件内部响应式变量
  const localVisible = ref(props.modelValue);
  const localColor = ref(props.color);
  
  // 计算属性确保position响应式
  const position = computed(() => ({
    x: props.position.x || 0,
    y: props.position.y || 0
  }));
  
  const predefinedColors = PREDEFINED_COLORS;
  
  // 监听外部prop变化
  watch(
    () => props.modelValue,
    (newVal) => {
      localVisible.value = newVal;
      if (newVal) {
        localColor.value = props.color;
      }
    },
    { immediate: true }
  );
  
  watch(
    () => props.color,
    (newVal) => {
      if (localColor.value !== newVal) {
        localColor.value = newVal;
      }
    },
    { immediate: true }
  );
  
  // 处理color-picker内部的modelValue更新
  const handleModelValueChange = (newColor) => {
    localColor.value = newColor;
  };
  
  // 颜色选择确认
  const handleChange = (color) => {
    emit("confirm", color);
    localVisible.value = false;
    emit("update:modelValue", false);
  };
  
  // 选择器关闭
  const handleClose = () => {
    if (localVisible.value) {
      localVisible.value = false;
      emit("update:modelValue", false);
      emit("cancel");
    }
  };
  </script>
  
  <style scoped>
  .color-picker-wrapper {
    position: fixed;
    z-index: 9998;
  }
  
  .color-picker {
    position: relative;
  }
  
  :deep(.custom-color-picker) {
    z-index: 9999 !important;
  }
  </style>