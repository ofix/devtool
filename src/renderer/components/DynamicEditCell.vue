<template>
  <div class="styled-table-cell" @click.stop="handleClick" @mousedown.prevent>
    <!-- 显示模式 -->
    <div
      v-if="!editing"
      class="cell-display"
      :style="displayStyle"
      :title="displayValue"
    >
      <span class="cell-text">{{ displayValue }}</span>
      <span v-if="config.required && isEmpty" class="required-mark">*</span>
    </div>
    <!-- 编辑模式 -->
    <div v-else class="cell-edit">
      <component
        :is="getComponent()"
        v-model="editValue"
        v-bind="getComponentProps()"
        @blur="handleBlur"
        @keyup.enter="handleSave"
        @keydown.esc="handleCancel"
        @keydown.tab="handleTab"
        @change="handleChange"
        ref="inputRef"
        class="cell-input"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch, onUnmounted } from "vue";

const props = defineProps({
  value: [String, Number, Boolean, Array, Object],
  field: String,
  rowIndex: Number,
  editing: Boolean,
  focused: Boolean,
  config: {
    type: Object,
    default: () => ({}),
  },
  placeholder: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["startEdit", "save", "cancel", "nextField"]);

// 响应式数据：简化初始化
const editValue = ref(props.value);
const inputRef = ref();
const isClicking = ref(false); // 防重复点击标识
// 存储 watch 实例，用于销毁时清理
const focusWatch = ref(null);

// 优化监听逻辑：使用可清理的 watch 实例
focusWatch.value = watch(
  () => [props.editing, props.focused],
  async ([newEditing, newFocused], [oldEditing, oldFocused]) => {
    // 当编辑状态关闭或聚焦状态取消时，强制取消焦点
    if ((!newEditing && oldEditing) || (!newFocused && oldFocused)) {
      blur();
      return;
    }

    if (newEditing) {
      editValue.value = props.value;
      await nextTick();
      // 强制聚焦，即使当前已有焦点也重新触发
      if (newFocused) {
        // 先失焦再聚焦，避免焦点粘连
        blur();
        setTimeout(() => {
          focus();
        }, 10);
      }
    }
  },
  { immediate: false, deep: true } // 开启 deep，确保监听对象属性变更
);

// 计算属性：保持原有逻辑，无冗余优化
const isEmpty = computed(() => {
  return (
    props.value === null || props.value === undefined || props.value === ""
  );
});

const displayValue = computed(() => {
  if (isEmpty.value) {
    return props.placeholder || props.config.label || props.field;
  }

  if (props.config.formatter && typeof props.config.formatter === "function") {
    return props.config.formatter(props.value, props.field);
  }

  if (props.config.type === "select" && props.config.options) {
    const option = props.config.options.find(
      (opt) => opt.value === props.value
    );
    return option ? option.label : String(props.value);
  }

  if (props.config.type === "boolean") {
    return props.value
      ? props.config.trueText || "是"
      : props.config.falseText || "否";
  }

  return String(props.value);
});

const displayStyle = computed(() => {
  if (isEmpty.value) {
    return {
      color: "#909399",
      fontStyle: "italic",
      opacity: 0.7,
    };
  }
  return {};
});

// 获取组件：保持原有逻辑
function getComponent() {
  const type = props.config.type || "string";
  const components = {
    string: "el-input",
    textarea: "el-input",
    number: "el-input-number",
    select: "el-select",
    boolean: "el-switch",
  };
  return components[type] || "el-input";
}

// 获取组件属性：保持原有逻辑
function getComponentProps() {
  const baseProps = {
    placeholder: props.config.placeholder || `请输入${props.config.label}`,
    clearable: props.config.clearable !== false,
    size: "small",
    class: "full-size-input",
  };

  const type = props.config.type || "string";

  if (type === "textarea") {
    return {
      ...baseProps,
      type: "textarea",
      rows: props.config.rows || 2,
      resize: "none",
    };
  }

  if (type === "select") {
    return {
      ...baseProps,
      placeholder: `请选择${props.config.label}`,
      class: "full-size-select", // 选择器专属 class
    };
  }

  if (type === "boolean") {
    return {
      ...baseProps,
      "active-value": props.config.trueValue ?? true,
      "inactive-value": props.config.falseValue ?? false,
    };
  }

  if (type === "number") {
    return {
      ...baseProps,
      min: props.config.min,
      max: props.config.max,
      step: props.config.step || 1,
      class: "full-size-number", // 数字输入框专属 class
    };
  }

  return baseProps;
}

// 处理方法：优化点击逻辑，防重复触发
async function handleClick() {
  isClicking.value = true;
  // 立即触发开始编辑事件，不等待异步
  emit("startEdit");

  // 短暂延迟后释放标识，避免完全屏蔽快速操作
  setTimeout(() => {
    isClicking.value = false;
  }, 300);
}

// 保存逻辑：保持原有
function handleSave() {
  emit("save", {
    rowIndex: props.rowIndex,
    field: props.field,
    value: editValue.value,
  });
}

// 失焦逻辑：优化判断，避免误触发
function handleBlur(event) {
  if (
    !event.relatedTarget ||
    !event.relatedTarget.closest(".styled-table-cell")
  ) {
    handleSave();
  }
}

// 取消逻辑：保持原有
function handleCancel() {
  editValue.value = props.value;
  emit("cancel");
}

// Tab键逻辑：保持原有
function handleTab(event) {
  event.preventDefault();
  handleSave();
  emit("nextField");
}

// 变化逻辑：保持原有
const handleChange = (value) => {
  if (props.config.type === "select" || props.config.type === "boolean") {
    editValue.value = value;
    handleSave();
  }
};

// 聚焦方法：简化逻辑，提升可靠性
const focus = () => {
  if (!inputRef.value) return;

  // 优先调用组件自身 focus 方法（增强容错）
  if (typeof inputRef.value.focus === "function") {
    try {
      inputRef.value.focus({ preventScroll: true });
      // 强制激活输入框（针对 el-input 特殊处理）
      if (inputRef.value.$el) {
        const inputEl = inputRef.value.$el.querySelector("input");
        if (inputEl) {
          inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length; // 光标移到末尾
        }
      }
      return;
    } catch (e) {
      console.warn("组件 focus 方法调用失败，降级到 DOM 聚焦", e);
    }
  }

  // 兼容所有 DOM 元素，强制聚焦
  const el = inputRef.value.$el || inputRef.value;
  const target =
    el.querySelector(
      "input, textarea, .el-select__trigger, .el-input-number__decrease"
    ) || el;
  if (target) {
    target.focus({ preventScroll: true });
    // 针对不可聚焦元素的兜底处理
    if (target.tagName === "DIV") {
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    }
  }
};

watch(
  () => [props.editing, props.focused],
  async ([newEditing, newFocused], [oldEditing, oldFocused]) => {
    if (newEditing) {
      editValue.value = props.value;
      await nextTick();
      // 当聚焦状态变为 true 时，强制聚焦
      if (newFocused) {
        focus();
      }
    }
    // 关键修复：当聚焦状态从 true 变为 false 时，主动取消焦点
    if (oldFocused && !newFocused) {
      blur();
    }
  },
  { immediate: false, deep: false }
);

watch(
  () => props.value,
  (newVal) => {
    editValue.value = newVal;
  }
);

// 组件销毁时清理监听，避免内存泄漏和残留影响
onUnmounted(() => {
  if (focusWatch.value) {
    focusWatch.value();
  }
  blur(); // 销毁时取消焦点
});

function blur() {
  if (!inputRef.value) return;

  // 优先调用组件自身 blur 方法
  if (typeof inputRef.value.blur === "function") {
    inputRef.value.blur();
    return;
  }

  // 兼容 Element Plus 组件 DOM 结构
  const el = inputRef.value.$el || inputRef.value;
  const target = el.querySelector("input, textarea, .el-select__trigger") || el;
  if (target) {
    target.blur();
  }
}

defineExpose({
  focus,
  blur,
});
</script>

<style scoped>
/* 单元格基础样式：确保盒模型统一，无额外间距 */
.styled-table-cell {
  width: 100%;
  height: 100%;
  min-height: 40px;
  display: flex;
  align-items: center;
  cursor: text;
  position: relative;
  padding: 0; /* 移除默认内边距，避免组件留白 */
  box-sizing: border-box;
}

.styled-table-cell:hover {
  background-color: #f5f7fa;
}

.styled-table-cell.is-editing {
  padding: 0;
  cursor: default;
  background-color: #f5f7fa;
}

.styled-table-cell.is-focused {
  outline: 2px solid #409eff;
  outline-offset: -1px;
  z-index: 1;
  position: relative;
}

.styled-table-cell.is-empty .cell-display {
  color: #909399;
  font-style: italic;
  opacity: 0.7;
}

.styled-table-cell.is-required .cell-display {
  position: relative;
}

.cell-display {
  width: 100%;
  height: 100%;
  min-height: 40px;
  display: flex;
  align-items: center;
  overflow: hidden;
  cursor: pointer;
  line-height: 1.5;
  padding: 0 12px; /* 显示模式保留内边距，编辑模式移除 */
}

.cell-text {
  display: inline-block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: inherit;
}

.required-mark {
  color: #f56c6c;
  margin-left: 4px;
  font-size: 12px;
}

/* 编辑模式容器：100% 宽高，无内边距，确保组件填充 */
.cell-edit {
  width: 100%;
  height: 100%;
  min-height: 40px;
  display: flex;
  align-items: center;
  padding: 0; /* 移除内边距，避免组件无法填满 */
  box-sizing: border-box;
}

.cell-edit.is-focused {
  background-color: #e6f7ff;
}

:deep(.full-size-input),
:deep(.full-size-select),
:deep(.full-size-number) {
  width: 100%;
  height: 80%;
  min-height: 32px; /* 与单元格最小高度一致 */
  box-sizing: border-box;
}

/* ========== el-input 样式：填充单元格 ========== */
:deep(.full-size-input .el-input__wrapper) {
  width: 100%;
  height: 80%;
  min-height: 32px; /* 匹配单元格最小高度 */
  padding: 0 15px; /* 保留默认内边距风格，仅调整尺寸 */
  border-radius: 0; /* 可选：移除圆角，与单元格风格统一（保留则为默认样式） */
  box-sizing: border-box;
}

/* 文本域适配 */
:deep(.full-size-input .el-textarea__inner) {
  width: 100%;
  height: 80%;
  min-height: 40px;
  border-radius: 0; /* 可选：移除圆角 */
  box-sizing: border-box;
}

/* ========== el-select 样式：填充单元格 ========== */
:deep(.full-size-select .el-select__wrapper) {
  width: 100%;
  height: 100%;
  min-height: 40px;
  padding: 0 15px;
  border-radius: 0; /* 可选：移除圆角 */
  box-sizing: border-box;
}

:deep(.full-size-select .el-select__trigger) {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

/* ========== el-input-number 样式：填充单元格 ========== */
:deep(.full-size-number .el-input__wrapper) {
  width: 100%;
  height: 100%;
  min-height: 40px;
  padding: 0 15px;
  border-radius: 0; /* 可选：移除圆角 */
  box-sizing: border-box;
}

:deep(.full-size-number .el-input-number__decrease),
:deep(.full-size-number .el-input-number__increase) {
  height: 100%; /* 上下按钮填充输入框高度 */
}

/* ========== el-switch 样式：居中对齐 ========== */
:deep(.el-switch) {
  --el-switch-height: 20px;
  margin: 0;
  align-self: center; /* 垂直居中，匹配单元格布局 */
}
</style>
