<template>
  <div
    class="context-menu"
    :style="{ left: `${x}px`, top: `${y}px` }"
    @click.stop
    @blur="handleClose"
    tabindex="0"
  >
    <div class="menu-item" @click="handleCopy">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
        />
      </svg>
      <span>复制</span>
    </div>
    <div class="menu-item" @click="handleCut">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
        />
      </svg>
      <span>剪切</span>
    </div>
    <div class="menu-item" @click="handleDelete">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
        />
      </svg>
      <span>删除</span>
    </div>
    <div class="menu-item" @click="handleEdit">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
        />
      </svg>
      <span>编辑</span>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from "vue";

// 定义Props
const props = defineProps({
  x: {
    type: Number,
    required: true,
  },
  y: {
    type: Number,
    required: true,
  },
});

// 定义事件
const emit = defineEmits(["copy", "cut", "delete", "edit", "close"]);

// 方法
const handleCopy = () => {
  emit("copy");
};

const handleCut = () => {
  emit("cut");
};

const handleDelete = () => {
  emit("delete");
};

const handleEdit = () => {
  emit("edit");
};

const handleClose = () => {
  emit("close");
};

// 生命周期
onMounted(() => {
  // 点击外部关闭
  document.addEventListener("click", handleClose);

  // ESC关闭
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      handleClose();
    }
  });
});
</script>

<style scoped>
.context-menu {
  position: fixed;
  width: 120px;
  background: white;
  border-radius: 4px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  z-index: 9999;
  padding: 5px 0;
  outline: none;
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.menu-item:hover {
  background-color: #f5f5f5;
}

.menu-item svg {
  margin-right: 8px;
}
</style>
