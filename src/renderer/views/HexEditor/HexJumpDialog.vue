<template>
  <el-dialog
    v-model="localVisible"
    title="跳转到指定地址"
    width="300px"
    @close="handleClose"
  >
    <!-- 绑定本地输入变量 + 监听输入事件 -->
    <el-input
      :model-value="localAddr"
      @input="handleInputChange"
      placeholder="输入16进制地址（如 0x100）"
      @keyup.enter="handleConfirm"
    />
    <div class="dialog-footer" style="margin-top: 15px; text-align: right">
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" @click="handleConfirm">跳转</el-button>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from "vue";

// 定义Props（只读）
const props = defineProps({
  // 弹窗显隐控制（对应v-model）
  modelValue: {
    type: Boolean,
    default: false,
  },
  // 父组件传入的初始地址
  currentAddr: {
    type: String,
    default: "",
  },
});

// 定义事件
const emit = defineEmits([
  "update:modelValue", // 弹窗显隐更新事件（v-model标准）
  "confirm", // 确认跳转事件
]);

// ========== 核心修复：创建本地响应式变量 ==========
// 本地管理弹窗显隐状态
const localVisible = ref(props.modelValue);
// 本地管理输入框值（接管原currentAddr prop）
const localAddr = ref(props.currentAddr);

// ========== 同步父组件Props变化到本地变量 ==========
// 监听父组件弹窗显隐状态变化
watch(
  () => props.modelValue,
  (newVal) => {
    localVisible.value = newVal;
    // 弹窗打开时，重置输入框为父组件传入的初始值
    if (newVal) {
      localAddr.value = props.currentAddr;
    }
  }
);

// 监听父组件地址值变化（防止父组件主动更新）
watch(
  () => props.currentAddr,
  (newVal) => {
    localAddr.value = newVal;
  }
);

// ========== 事件处理 ==========
// 输入框值变化时，通知父组件（可选，如需实时同步）
const handleInputChange = (val) => {
  localAddr.value = val;
  // 可选：如果需要父组件实时同步输入值，取消下面注释
  // emit('update:currentAddr', val)
};

// 确认跳转
const handleConfirm = () => {
  emit("confirm", localAddr.value); // 传递最终输入的地址
  emit("update:modelValue", false); // 通知父组件关闭弹窗
  localVisible.value = false; // 本地关闭弹窗
};

// 取消/关闭弹窗
const handleClose = () => {
  emit("update:modelValue", false); // 通知父组件关闭弹窗
  localVisible.value = false; // 本地关闭弹窗
};
</script>

<style scoped>
.dialog-footer {
  margin-top: 15px;
  text-align: right;
}
</style>
