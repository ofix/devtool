<template>
  <!-- 截图编辑标注工具条 -->
  <div :style="toolbarStyle" class="mark-toolbar" v-show="visible">
    <div class="edit-toolbar-content">
      <BtnSelect
        @click="onSelect"
        :class="{ active: currentTool === ShapeType.SELECT }"
        title="选择"
      />
      <div class="toolbar-divider"></div>
      <BtnArrow
        @click="onClickTool(ShapeType.ARROW)"
        :class="{ active: currentTool === ShapeType.ARROW }"
        title="箭头/线条"
      />
      <BtnRect
        @click="onClickTool(ShapeType.RECT)"
        :class="{ active: currentTool === ShapeType.RECT }"
        title="矩形"
      />
      <BtnEclipse
        @click="onClickTool(ShapeType.ELLIPSE)"
        :class="{ active: currentTool === ShapeType.ELLIPSE }"
        title="椭圆"
      />
      <BtnStar
        @click="onClickTool(ShapeType.STAR)"
        :class="{ active: currentTool === ShapeType.STAR }"
        title="五角星"
      />
      <BtnIncrementNumber
        @click="onClickTool(ShapeType.INCREMENT_NUMBER)"
        :class="{ active: currentTool === ShapeType.INCREMENT_NUMBER }"
        title="数字"
      />
      <BtnText
        @click="onClickTool(ShapeTYpe.TEXT)"
        :class="{ active: currentTool === ShapeType.TEXT }"
        title="文字"
      />
      <BtnPencil
        @click="onClickTool(ShapeType.PENCIL)"
        :class="{ active: currentTool === ShapeType.PENCIL }"
        title="铅笔"
      />
      <BtnHilighter
        @click="onClickTool(ShapeType.HIGHLIGHTER)"
        :class="{ active: currentTool === ShapeType.HIGHLIGHTER }"
        title="荧光笔"
      />
      <BtnEraser
        @click="onClickTool(ShapeType.ERASER)"
        :class="{ active: currentTool === ShapeType.ERASER }"
        title="荧光笔"
      />
      <BtnMosaic
        @click="onClickTool(ShapeType.MOSAIC)"
        :class="{ active: currentTool === ShapeType.MOSAIC }"
        title="马赛克"
      />
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
import BtnSelect from "@/icons/IconSelect.vue";
import BtnLine from "@/icons/IconLine.vue";
import BtnArrow from "@/icons/IconArrowUp.vue";
import BtnRect from "@/icons/IconRect.vue";
import BtnEclipse from "@/icons/IconEclipse.vue";
import BtnStar from "@/icons/IconStar.vue";
import BtnPencil from "@/icons/IconPencil.vue";
import BtnHilighter from "@/icons/IconHilighter.vue";
import BtnEraser from "@/icons/IconEraser.vue";
import BtnMosaic from "@/icons/IconMosaic.vue";
import BtnIncrementNumber from "@/icons/IconNumber.vue";
import BtnText from "@/icons/IconText.vue";
import BtnCancel from "@/icons/IconCloseBox.vue";
import BtnFinish from "@/icons/IconOk.vue";
import { ShapeType } from "./Shapes/ShapeFactory.js";

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
  borderRadius: "2px",
  padding: "8px",
  margin: 0,
  left: `${props.position.x}px`,
  top: `${props.position.y}px`,
}));

// 响应式数据
const currentTool = ref(ShapeType.NONE); // 当前工具

// 工具按钮点击事件
function onSelect() {
  if (currentTool.value == ShapeType.SELECT) {
    currentTool.value = ShapeType.NONE;
    emit("toolChange", ShapeType.NONE);
  } else {
    currentTool.value = ShapeType.SELECT;
    emit("toolChange", ShapeType.SELECT);
  }
}

function onClickTool(tool) {
  if (currentTool.value == tool) {
    currentTool.value = ShapeType.NONE;
    emit("toolChange", ShapeType.NONE);
  } else {
    currentTool.value = tool;
    emit("toolChange", tool);
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
