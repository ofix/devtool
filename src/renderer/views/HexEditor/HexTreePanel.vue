<template>
  <el-splitter-panel :size="490" :min-size="450" :resizable="false">
    <div class="hex-tree-panel">
      <el-table-v2
        :columns="columns"
        :data="treeData"
        :width="530"
        :height="height"
        :row-height="40"
        :tree-props="{
          children: 'children',
          hasChildren: (row) => !!(row.children && row.children.length > 0),
        }"
        :expand-column-key="'name'"
        row-key="id"
      />
    </div>
  </el-splitter-panel>
</template>

<script setup lang="jsx">
import { ref } from "vue";
import IconLock from "@/icons/IconLock.vue";
import IconUnlock from "@/icons/IconUnlock.vue";
import IconEdit from "@/icons/IconEdit.vue";
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
const emit = defineEmits(["hex-row-click", "lock-node", "edit-node"]);

// 响应式数据
const hoveredNodeId = ref("");
const height = ref(600);

// 处理行点击
const handleRowClick = (rowData, e) => {
  if (e.target.closest(".action-btn")) return;
  emit("hex-row-click", rowData);
};

// 处理鼠标进入行
const handleRowMouseEnter = (rowData) => {
  hoveredNodeId.value = rowData.id;
};

// 处理鼠标离开行
const handleRowMouseLeave = () => {
  hoveredNodeId.value = "";
};

// 格式化地址为十六进制
// 格式化地址为十六进制，支持指定位数（默认3位）
const formatHexAddress = (addr, width = 3) => {
  // 将地址转换为十六进制字符串，并转为大写
  const hex = addr.toString(16).toUpperCase();
  // 使用 padStart 确保至少 width 位，不足时左侧补0
  return `0x${hex.padStart(width, "0")}`;
};

// 列定义 - 使用 JSX 语法
const columns = [
  {
    key: "name",
    title: "名称",
    dataKey: "name",
    width: 150,
    fixed: true,
    cellRenderer: ({ rowData }) => (
      <div
        class="tree-node-name"
        onMouseenter={() => handleRowMouseEnter(rowData)}
        onMouseleave={handleRowMouseLeave}
        onClick={(e) => handleRowClick(rowData, e)}
      >
        {rowData.name}
      </div>
    ),
  },
  {
    key: "addrStart",
    title: "起始地址",
    width: 100,
    align: "center",
    cellRenderer: ({ rowData }) => (
      <span
        class="address-cell"
        onMouseenter={() => handleRowMouseEnter(rowData)}
        onMouseleave={handleRowMouseLeave}
        onClick={(e) => handleRowClick(rowData, e)}
      >
        {formatHexAddress(rowData.addrStart)}
      </span>
    ),
  },
  {
    key: "addrEnd",
    title: "结束地址",
    width: 100,
    align: "center",
    cellRenderer: ({ rowData }) => (
      <span
        class="address-cell"
        onMouseenter={() => handleRowMouseEnter(rowData)}
        onMouseleave={handleRowMouseLeave}
        onClick={(e) => handleRowClick(rowData, e)}
      >
        {formatHexAddress(rowData.addrEnd)}
      </span>
    ),
  },
  {
    key: "type",
    title: "类型",
    width: 80,
    align: "center",
    cellRenderer: ({ rowData }) => (
      <span
        class={["type-tag", `type-${rowData.type}`]}
        onMouseenter={() => handleRowMouseEnter(rowData)}
        onMouseleave={handleRowMouseLeave}
      >
        {rowData.type}
      </span>
    ),
  },
  {
    key: "actions",
    title: "操作",
    width: 100,
    align: "center",
    fixed: "right",
    cellRenderer: ({ rowData }) => {
      //   if (hoveredNodeId.value !== rowData.id) return null;
      return (
        <div
          class="tree-node-actions"
          onMouseenter={() => handleRowMouseEnter(rowData)}
          onMouseleave={handleRowMouseLeave}
        >
          <IconLock
            class="action-btn lock-btn"
            onClick={(event) => {
              event.stopPropagation();
              emit("lock-node", rowData);
            }}
            title="锁定节点"
          />
          <IconEdit
            class="action-btn edit-btn"
            onClick={(event) => {
              event.stopPropagation();
              emit("edit-node", rowData);
            }}
            title="编辑节点"
          />
        </div>
      );
    },
  },
];
</script>

<style scoped>
.hex-tree-panel {
  height: 100%;
  padding: 10px;
  overflow-y: auto;
}

/* 覆盖表格默认样式，让树形缩进更明显 */
/* :deep(.el-table-v2__row) {
  border-bottom: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
} */

/* :deep(.el-table-v2__row:hover) {
  background-color: var(--el-fill-color-light);
}

:deep(el-table-v2__row-cell) {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 8px;
  font-size: 13px;
} */

/* 树形缩进样式 - 只在第一列（名称列）生效 */
/* :deep(.el-table-v2__cell:first-child) {
  padding-left: calc(8px + var(--el-table-v2-tree-level) * 20px);
} */

.tree-node-name {
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.address-cell {
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.tree-node-actions {
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

:deep(.action-btn) {
  width: 16px;
  height: 16px;
  cursor: pointer;
  color: #0066cc;
}
:deep(.lock-btn) {
  margin-right: 4px;
}

:deep(.type-tag) {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  width: fit-content;
  margin: 0 auto;
  display: inline-block;
}

/* 类型标签颜色样式 - 保持与原Tree组件一致 */
:deep(.type-tag.type-table) {
  background: #e1f5fe;
  color: #01579b;
}

:deep(.type-tag.type-string) {
  background: #f3e5f5;
  color: #4a148c;
}

:deep(.type-tag.type-digit) {
  background: #e8f5e8;
  color: #1b5e20;
}

:deep(.type-tag.type-bit) {
  background: #fff3e0;
  color: #e65100;
}

:deep(.type-tag.type-block) {
  background: #fce4ec;
  color: #880e4f;
}

:deep(.type-tag.type-file) {
  background: #e0f7fa;
  color: #00695c;
}

/* 确保表格容器可以滚动 */
:deep(.el-table-v2__main) {
  overflow: auto !important;
}

/* 表头样式 */
:deep(.el-table-v2__header-cell) {
  background-color: var(--el-fill-color-light);
  font-weight: 600;
  font-size: 13px;
  color: var(--el-text-color-primary);
  height: 40px;
  display: flex;
  align-items: center;
  padding: 0 8px;
}
</style>
