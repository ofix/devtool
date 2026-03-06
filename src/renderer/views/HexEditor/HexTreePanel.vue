<template>
  <el-splitter-panel :size="300" :min-size="200">
    <div class="hex-tree-panel">
      <el-tree
        :data="treeData"
        :props="treeProps"
        node-key="id"
        @node-click="handleNodeClick"
        @node-mouseenter="(e, data) => (hoveredNodeId = data.id)"
        @node-mouseleave="() => (hoveredNodeId = '')"
        :render-after-expand="false"
      >
        <template #default="{ node, data }">
          <div class="tree-node-content" :data-node-id="data.id">
            <span>{{ data.name }}</span>
            <span class="addr-tag"
              >0x{{ data.addrStart.toString(16).toUpperCase() }}-0x{{
                data.addrEnd.toString(16).toUpperCase()
              }}</span
            >
            <span class="type-tag" :class="`type-${data.type}`">{{
              data.type
            }}</span>
            <!-- 悬浮操作按钮 -->
            <div class="tree-node-actions" v-show="hoveredNodeId === data.id">
              <button
                class="action-btn lock-btn"
                @click.stop="handleLockNode(data)"
                :style="{
                  backgroundColor: lockedNodes[data.id]?.color || '#666',
                }"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                  <path
                    d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"
                  />
                </svg>
              </button>
              <button
                class="action-btn edit-btn"
                @click.stop="handleEditNode(data)"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                  <path
                    d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                  />
                </svg>
              </button>
              <button
                class="action-btn delete-btn"
                @click.stop="handleDeleteNode(data)"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                  <path
                    d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                  />
                </svg>
              </button>
            </div>
          </div>
        </template>
      </el-tree>
    </div>
  </el-splitter-panel>
</template>

<script setup>
import { ref } from "vue";

// 定义Props
const props = defineProps({
  treeData: {
    type: Array,
    required: true,
  },
  lockedNodes: {
    type: Object,
    default: () => ({}),
  },
});

// 定义事件
const emit = defineEmits([
  "node-click",
  "lock-node",
  "edit-node",
  "delete-node",
]);

// 响应式数据
const hoveredNodeId = ref("");
const treeProps = {
  children: "children",
  label: "name",
};

// 事件处理
const handleNodeClick = (data) => {
  emit("node-click", data);
};

const handleLockNode = (data) => {
  emit("lock-node", data);
};

const handleEditNode = (data) => {
  emit("edit-node", data);
};

const handleDeleteNode = (data) => {
  emit("delete-node", data);
};
</script>

<style scoped>
.hex-tree-panel {
  height: 100%;
  padding: 10px;
  overflow-y: auto;
}

.hex-tree {
  --el-tree-node-content-height: 40px;
}

.tree-node-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 2px 5px;
  position: relative;
}

.tree-node-actions {
  display: flex;
  gap: 2px;
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
}

.action-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.action-btn:hover {
  transform: scale(1.1);
}

.lock-btn {
  background-color: #666;
}

.edit-btn {
  background-color: #0066cc;
}

.delete-btn {
  background-color: #cc3300;
}

.addr-tag {
  font-size: 12px;
  color: #666;
  margin-right: 5px;
}

.type-tag {
  font-size: 10px;
  padding: 2px 4px;
  border-radius: 2px;
  margin-right: 10px;
}

.type-table {
  background: #e1f5fe;
  color: #01579b;
}
.type-string {
  background: #f3e5f5;
  color: #4a148c;
}
.type-digit {
  background: #e8f5e8;
  color: #1b5e20;
}
.type-bit {
  background: #fff3e0;
  color: #e65100;
}
.type-block {
  background: #fce4ec;
  color: #880e4f;
}
.type-file {
  background: #e0f7fa;
  color: #00695c;
}
</style>
