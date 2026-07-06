<template>
  <div class="canvas-wrap">
    <canvas
      ref="canvasRef"
      @dblclick="handleDblClick"
      width="1200"
      height="800"
    ></canvas>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { VisualCore } from "./VisualCore.js";
import { FieldEditor } from "./FieldEditor.js";
import { TableStructRender } from "./TableStructRender.js";

const canvasRef = ref(null);
let visualCore = null;
let tableRender = null;

// 测试模拟解析出来的 class/struct 数据
const structData = ref([
  {
    uid: "s1",
    className: "struct task_struct",
    fields: [
      { content: "pid: int" },
      { content: "parent: task_struct*" },
      { content: "mm: struct mm_struct" },
      { content: "signal: signal_struct 超长测试文本超过二十个字符演示截断" },
    ],
  },
  {
    uid: "s2",
    className: "class User",
    fields: [{ content: "id: number" }, { content: "orderList: Array<Order>" }],
  },
]);

// 字段修改后重新渲染回调
function onFieldUpdate() {
  tableRender.setData(structData.value);
  tableRender.renderAll();
}

// 重置画布缩放偏移
function handleReset() {
  visualCore.resetTransform();
  tableRender.renderAll();
}

// 双击画布检测字段编辑
function handleDblClick(e) {
  const rect = canvasRef.value.getBoundingClientRect();
  const screenX = e.clientX - rect.left;
  const screenY = e.clientY - rect.top;
  tableRender.hitTestField(screenX, screenY);
}

onMounted(() => {
  const canvasEl = canvasRef.value;
  visualCore = new VisualCore(canvasEl);
  const editor = new FieldEditor(visualCore, onFieldUpdate);
  tableRender = new TableStructRender(visualCore, editor);

  // 载入解析后的结构体数据渲染
  tableRender.setData(structData.value);
  tableRender.renderAll();
});
</script>

<style scoped>
.canvas-wrap {
  width: 100%;
  height: 100%;
}
.tool-bar {
  margin-bottom: 8px;
}
canvas {
  border: 1px solid #ccc;
}
</style>
