<template>
  <div class="menu-bar">
    <div class="menu-group">
      <button class="menu-btn" @click="handleOpenFile">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"
          />
        </svg>
        <span>打开文件</span>
      </button>
      <button class="menu-btn" @click="handleJumpAddr">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
        <span>跳转地址</span>
      </button>
      <button class="menu-btn" @click="handleUndo" :disabled="undoDisabled">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"
          />
        </svg>
        <span>撤销</span>
      </button>
      <button class="menu-btn" @click="handleRedo" :disabled="redoDisabled">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22l2.37.78C4.94 12.31 7.95 10 11.5 10c1.96 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"
          />
        </svg>
        <span>重做</span>
      </button>
    </div>
  </div>
</template>

<script setup>
// 定义Props
const props = defineProps({
  undoDisabled: {
    type: Boolean,
    default: false,
  },
  redoDisabled: {
    type: Boolean,
    default: false,
  },
});

// 定义事件
const emit = defineEmits(["open-file", "jump-addr", "undo", "redo"]);

// 事件处理
const handleOpenFile = () => {
  emit("open-file");
};

const handleJumpAddr = () => {
  emit("jump-addr");
};

const handleUndo = () => {
  emit("undo");
};

const handleRedo = () => {
  emit("redo");
};
</script>

<style scoped>
.menu-bar {
  height: 40px;
  background: #f8f9fa;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  padding: 0 10px;
  z-index: 100;
}

.menu-group {
  display: flex;
  gap: 5px;
}

.menu-btn {
  height: 30px;
  padding: 0 10px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  transition: all 0.2s;
}

.menu-btn:hover {
  background: #e5e7eb;
}

.menu-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
