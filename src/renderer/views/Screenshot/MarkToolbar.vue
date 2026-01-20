<template>
  <!-- 截图编辑标注工具条 -->
  <div :style="toolbarStyle" class="mark-toolbar" v-show="visible">
    <div class="edit-toolbar-content">
      <BtnSelect
        @click="onSelect"
        :class="{ active: currentTool === 'select' }"
        title="选择工具"
      />
      <BtnLine
        @click="onClickLine"
        :class="{ active: currentTool === 'line' }"
        title="线条标注"
      />
      <BtnRect
        @click="onClickRect"
        :class="{ active: currentTool === 'rect' }"
        title="矩形标注"
      />
      <BtnArrow
        @click="onClickArrow"
        :class="{ active: currentTool === 'arrow' }"
        title="箭头标注"
      />
      <BtnIncrementNumber
        @click="onClickIncrementNumber"
        :class="{ active: currentTool === 'number' }"
        title="数字标注"
      />
      <BtnEclipse
        @click="onClickEllipse"
        :class="{ active: currentTool === 'ellipse' }"
        title="椭圆标注"
      />
      <BtnText
        @click="onClickText"
        :class="{ active: currentTool === 'text' }"
        title="文字标注"
      />
      <div class="toolbar-divider"></div>
      <button class="undo-btn" @click="onUndo" title="撤销(Ctrl+Z)">↩</button>
      <button class="redo-btn" @click="onRedo" title="重做(Ctrl+Y)">↪</button>
      <div class="toolbar-divider"></div>
      <BtnCancel @click="onClickCancel" title="取消" />
      <BtnFinish @click="onClickFinish" title="完成" />
    </div>
  </div>
</template>

<script setup>
// 导入必要依赖
import { ref, computed, onMounted, onUnmounted } from "vue";
// 编辑截图按钮组件
import BtnSelect from "@/components/icons/IconSelect.vue";
import BtnLine from "@/components/icons/IconLine.vue";
import BtnRect from "@/components/icons/IconRect.vue";
import BtnArrow from "@/components/icons/IconArrowUp.vue";
import BtnEclipse from "@/components/icons/IconEclipse.vue";
import BtnIncrementNumber from "@/components/icons/IconNumber.vue";
import BtnText from "@/components/icons/IconText.vue";
import BtnCancel from "@/components/icons/IconCloseBox.vue";
import BtnFinish from "@/components/icons/IconOk.vue";

// 接收父组件传参
const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  position: {
    type: Object,
    default: () => ({ x: 0, y: 0 }),
  },
  captureRect: {
    type: Object,
    default: () => ({ x: 0, y: 0, width: 0, height: 0 }),
  },
  markManager: {
    // 接收标注管理器实例
    type: Object,
    default: null,
  },
});

// 暴露事件给父组件
const emit = defineEmits(["cancel", "finish", "toolChange"]);

// 工具栏样式
const toolbarStyle = computed(() => ({
  position: "fixed",
  zIndex: 10001,
  backgroundColor: "rgba(30, 30, 30, 0.95)",
  borderRadius: "8px",
  padding: "8px",
  margin: 0,
  left: `${props.position.x}px`,
  top: `${props.position.y}px`,
}));

// 响应式数据
const currentTool = ref("none"); // 当前工具

// 工具按钮点击事件
function onSelect() {
  if (currentTool.value == "select") {
    currentTool.value = "none";
    emit("toolChange", "none");
  } else {
    currentTool.value = "select";
    emit("toolChange", "select");
  }
}

function onClickLine() {
  if (currentTool.value == "line") {
    currentTool.value = "none";
    emit("toolChange", "none");
  } else {
    currentTool.value = "line";
    emit("toolChange", "line");
  }
}

function onClickRect() {
  if (currentTool.value == "rect") {
    currentTool.value = "none";
    emit("toolChange", "none");
  } else {
    currentTool.value = "rect";
    emit("toolChange", "rect");
  }
}

function onClickArrow() {
  if (currentTool.value == "arrow") {
    currentTool.value = "none";
    emit("toolChange", "none");
  } else {
    currentTool.value = "arrow";
    emit("toolChange", "arrow");
  }
}

function onClickEllipse() {
  if (currentTool.value == "line") {
    currentTool.value = "none";
    emit("toolChange", "none");
  } else {
    currentTool.value = "ellipse";
    emit("toolChange", "ellipse");
  }
}

function onClickIncrementNumber() {
  if (currentTool.value == "incrementNumber") {
    currentTool.value = "none";
    emit("toolChange", "none");
  } else {
    currentTool.value = "number";
    emit("toolChange", "incrementNumber");
  }
}

function onClickText() {
  if (currentTool.value == "text") {
    currentTool.value = "none";
    emit("toolChange", "none");
  } else {
    currentTool.value = "text";
    emit("toolChange", "text");
  }
}

// 撤销/重做
function onUndo() {
  if (props.markManager) {
    props.markManager.undo();
  }
}

function onRedo() {
  if (props.markManager) {
    props.markManager.redo();
  }
}

// 取消截图
function onClickCancel() {
  window.channel.cancelScreenshot();
}

// 完成截图
function onClickFinish() {
  window.channel.cancelScreenshot();
}

// 注册快捷键
onMounted(() => {
  const handleKeydown = (e) => {
    // 撤销：Ctrl+Z
    if (e.ctrlKey && e.key === "z") {
      e.preventDefault();
      onUndo();
    }
    // 重做：Ctrl+Y
    else if (e.ctrlKey && e.key === "y") {
      e.preventDefault();
      onRedo();
    }
    // ESC取消
    else if (e.key === "Escape") {
      onClickCancel();
    }
    // Enter完成
    else if (e.key === "Enter") {
      onClickFinish();
    }
  };

  window.addEventListener("keydown", handleKeydown);

  onUnmounted(() => {
    window.removeEventListener("keydown", handleKeydown);
  });
});
</script>

<style scoped>
.mark-toolbar {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.25);
}

.edit-toolbar-content {
  display: flex;
  align-items: center;
  gap: 4px;
}

.edit-toolbar-content > * {
  cursor: pointer;
}

.edit-toolbar-content svg {
  width: 24px;
  height: 24px;
  fill: #ffffff;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.edit-toolbar-content svg:hover {
  background: rgba(255, 255, 255, 0.1);
  fill: #409eff;
}

.edit-toolbar-content svg.active {
  background: rgba(64, 158, 255, 0.2);
  fill: #409eff;
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: rgba(255, 255, 255, 0.2);
  margin: 0 4px;
}

/* 撤销/重做按钮样式 */
.undo-btn,
.redo-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.undo-btn:hover,
.redo-btn:hover {
  background: rgba(64, 158, 255, 0.2);
  color: #409eff;
}
</style>
