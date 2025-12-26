<template>
  <div class="dynamic-variable-input" ref="inputContainerRef">
    <!-- 输入框 -->
    <el-input
      ref="variableInputRef"
      v-bind="$attrs"
      v-model="innerValue"
      @input="handleInputChange"
      @click="handleInputTrigger"
      @blur="handleBlur"
      @focus="handleInputTrigger"
      @update:modelValue="handleModelUpdate"
      class="variable-input"
    ></el-input>

    <!-- 手动实现 Popover（脱离表格层级） -->
    <teleport to="body">
      <div
        v-if="popoverVisible && matchedVariables.length > 0"
        ref="customPopoverRef"
        class="custom-variable-popover"
        :style="popoverStyle"
        @mousedown.stop
      >
        <el-scrollbar max-height="300px">
          <div
            class="suggest-item"
            v-for="(variable, index) in matchedVariables"
            :key="index"
            @click="() => selectVariable(variable)"
          >
            <div class="variable-name">
              <span
                v-for="(part, idx) in variable.highlight"
                :key="idx"
                :style="{ color: part.color }"
                class="highlight-text"
              >
                {{ part.text }}
              </span>
            </div>
            <div class="variable-desc">{{ variable.desc }}</div>
          </div>
        </el-scrollbar>
      </div>
    </teleport>

    <!-- 预览卡片 -->
    <el-card
      v-if="showPreview && previewValue !== null"
      class="value-preview-card"
      shadow="hover"
      style="margin-top: 10px"
    >
      <template #header>
        <span>变量值预览</span>
      </template>
      <pre>{{ previewValueText }}</pre>
    </el-card>
  </div>
</template>

<script setup>
import {
  ref,
  computed,
  nextTick,
  watch,
  defineProps,
  defineEmits,
  useAttrs,
} from "vue";
import { ElMessage } from "element-plus";
import DynamicVariableManager from "@/common/DynamicVariableManager.js";

const props = defineProps({
  modelValue: {
    type: [String, Number],
    default: "",
  },
  showPreview: {
    type: Boolean,
    default: true,
  },
  highlightColor: {
    type: String,
    default: "#409eff",
  },
});

const emit = defineEmits([
  "update:modelValue",
  "input",
  "change",
  "blur",
  "focus",
  "clear",
  "click",
  "mouseenter",
  "mouseleave",
]);

const innerValue = ref(props.modelValue);
const popoverVisible = ref(false);
const matchedVariables = ref([]);
const previewValue = ref(null);
const variableInputRef = ref(null);
const inputContainerRef = ref(null);
const customPopoverRef = ref(null);
const popoverStyle = ref({}); // 手动计算 Popover 位置
const variableManager = ref(new DynamicVariableManager());
const attrs = useAttrs();

//  计算属性
const previewValueText = computed(() => {
  if (previewValue.value === null) return "";
  const variableName = innerValue.value.trim();
  return `${variableName} = ${JSON.stringify(previewValue.value, null, 2)}`;
});

//  监听外部 v-model 变化
watch(
  () => props.modelValue,
  (newVal) => {
    innerValue.value = newVal;
  },
  { immediate: true }
);

// 手动计算 Popover 位置（适配表格）
const calculatePopoverPosition = () => {
  nextTick(() => {
    if (!variableInputRef.value || !customPopoverRef.value) return;

    // 获取输入框的 DOM 位置
    const inputRect = variableInputRef.value.getBoundingClientRect();
    // 获取 body 滚动偏移
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

    // 定位到输入框下方（脱离表格层级）
    popoverStyle.value = {
      position: "absolute",
      top: `${inputRect.bottom + scrollTop + 2}px`,
      left: `${inputRect.left + scrollLeft}px`,
      width: "400px",
      zIndex: 99999, // 远超表格层级
      border: "1px solid #e6e6e6",
      borderRadius: "4px",
      backgroundColor: "#fff",
      boxShadow: "0 2px 12px 0 rgba(0, 0, 0, 0.1)",
      overflow: "hidden",
    };
  });
};

// 输入变化处理
const handleInputChange = (val) => {
  emit("input", val);
  emit("update:modelValue", val);

  const value = val.trim();
  popoverVisible.value = false;
  previewValue.value = null;

  if (!value.startsWith("@")) return;

  const variablePart = value.slice(1);
  console.log("搜索关键词：", variablePart);

  // 搜索变量
  let matched = [];
  try {
    matched = variableManager.value.searchVariables(variablePart);
    console.log("匹配到的变量：", matched);
  } catch (e) {
    console.error("变量搜索失败：", e);
    ElMessage.error("变量搜索失败，请检查配置");
    return;
  }

  if (matched.length > 0) {
    matchedVariables.value = matched.map((item) => ({
      ...item,
      highlight: item.highlight.map((part) => ({
        ...part,
        color: props.highlightColor,
      })),
    }));
    popoverVisible.value = true;
    calculatePopoverPosition(); // 计算位置
  }
};

// 聚焦/点击触发
const handleInputTrigger = () => {
  if (innerValue.value.trim().startsWith("@")) {
    handleInputChange(innerValue.value);
  }
  emit("click");
  emit("focus");
};

// 失焦隐藏
const handleBlur = (e) => {
  // 延迟隐藏，避免点击选项时关闭
  setTimeout(() => {
    // 检查是否点击了 Popover 内部
    const isClickPopover =
      e.relatedTarget && e.relatedTarget.closest(".custom-variable-popover");
    if (!isClickPopover) {
      popoverVisible.value = false;
    }
  }, 200);
  emit("blur", e);
};

// 选择变量
const selectVariable = (variable) => {
  try {
    const fullVar = `@${variable.fullPath}`;
    innerValue.value = fullVar;
    emit("update:modelValue", fullVar);
    emit("input", fullVar);
    popoverVisible.value = false;
    previewValue.value = variableManager.value.getVariableValue(
      variable.fullPath
    );
    emit("change", fullVar);
  } catch (e) {
    ElMessage.error(`变量生成失败：${e.message}`);
    previewValue.value = null;
  }
};

// 窗口大小变化时重新计算位置
watch(
  () => [window.innerWidth, window.innerHeight],
  () => {
    if (popoverVisible.value) {
      calculatePopoverPosition();
    }
  }
);

// 暴露方法
defineExpose({
  focus: () => variableInputRef.value?.focus(),
  blur: () => variableInputRef.value?.blur(),
  clear: () => {
    innerValue.value = "";
    emit("update:modelValue", "");
    emit("clear");
  },
});
</script>

<style scoped>
.dynamic-variable-input {
  width: 100%;
  position: relative;
}

.variable-input {
  width: 100%;
}

/* 自定义 Popover 样式 */
:deep(.custom-variable-popover) {
  z-index: 99999 !important;
}

:deep(.suggest-item) {
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
}

:deep(.suggest-item:hover) {
  background-color: #f5f7fa;
}

:deep(.variable-name) {
  font-size: 14px;
  line-height: 1.5;
  margin-bottom: 4px;
}

:deep(.variable-desc) {
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
}

:deep(.highlight-text) {
  font-weight: 500;
}

/* 预览卡片 */
.value-preview-card {
  :deep(.el-card__header) {
    padding: 10px 15px;
    font-size: 14px;
    font-weight: 500;
  }

  pre {
    margin: 0;
    padding: 10px;
    background-color: #f8f9fa;
    border-radius: 4px;
    font-size: 13px;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
}
</style>
