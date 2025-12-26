<template>
  <el-table
    ref="tableRef"
    :data="tableData"
    :border="border"
    :size="size"
    :max-height="maxHeight"
    :height="height"
    :stripe="stripe"
    @cell-mouse-enter="onCellMouseEnter"
    @cell-mouse-leave="onCellMouseLeave"
    @selection-change="onSelectionChange"
    :style="tableStyleObject"
    class="styled-edit-table"
    :cell-class-name="setCellClassName"
  >
    <!-- 复选框列 -->
    <el-table-column
      v-if="showCheckbox"
      type="selection"
      :width="checkboxWidth"
      :align="checkboxAlign"
      :selectable="selectableFn"
    />

    <!-- 序号列 -->
    <el-table-column
      v-if="showIndex"
      type="index"
      :width="indexWidth"
      :align="indexAlign"
      :label="indexLabel"
    />

    <!-- 动态列 -->
    <el-table-column
      v-for="column in columns"
      :key="`table-column-${column.field}`"
      :prop="column.field"
      :label="column.label"
      :width="column.width"
      :min-width="column.minWidth"
      :align="column.align || 'left'"
    >
      <template #default="scope">
        <DynamicEditCell
          :ref="
            (el) =>
              setCellRef(
                `${scope.row.$id || `row-${scope.$index}`}_${column.field}`,
                el
              )
          "
          :value="scope.row[column.field]"
          :field="column.field"
          :row-index="scope.$index"
          :editing="scope.row[`${column.field}$edit`]"
          :focused="scope.row[`${column.field}$edit`]"
          :config="column"
          :placeholder="column.placeholder || column.label"
          @start-edit="() => startCellEdit(scope.row, column, column.field)"
          @save="saveCellVallue"
          @cancel="() => cancelCellEdit(scope.row)"
        />
      </template>
    </el-table-column>

    <!-- 操作列 -->
    <el-table-column
      v-if="showActions"
      :label="actionsLabel"
      :width="actionsWidth"
      :align="actionsAlign"
    >
      <template #default="scope">
        <div class="table-actions">
          <Delete
            v-if="showDelete"
            class="action-btn-delete"
            :class="{ 'action-visible': hoveredRowId === scope.row.$id }"
            @click.stop="deleteRow(scope.$index)"
          />
          <slot
            name="actions"
            :row="scope.row"
            :index="scope.$index"
            :isEditing="isCellEditing(scope.row)"
            :rowData="scope.row"
            :firstField="columns[0]?.field"
          />
        </div>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup>
import {
  ref,
  computed,
  nextTick,
  onMounted,
  watch,
  onUnmounted,
  reactive,
} from "vue";
import Delete from "@/components/icons/IconDelete.vue";
import DynamicEditCell from "./DynamicEditCell.vue";

const props = defineProps({
  // 列配置
  columns: {
    type: Array,
    required: true,
    validator: (cols) =>
      Array.isArray(cols) && cols.every((col) => col?.field && col?.label),
  },
  // 初始数据（可选）
  data: {
    type: Array,
    default: () => [],
  },
  // 默认行数
  defaultRowCount: {
    type: Number,
    default: 2,
    validator: (v) => v >= 0 && Number.isInteger(v),
  },
  // 表格样式
  tableStyle: {
    type: [Object, String],
    default: () => ({ width: "100%" }),
  },
  // 表格属性
  border: { type: Boolean, default: true },
  size: {
    type: String,
    default: "default",
    validator: (v) => ["large", "default", "small"].includes(v),
  },
  maxHeight: { type: [String, Number], default: null },
  height: { type: [String, Number], default: null },
  stripe: { type: Boolean, default: false },
  // 功能开关
  showCheckbox: { type: Boolean, default: true },
  showIndex: { type: Boolean, default: false },
  showActions: { type: Boolean, default: true },
  showDelete: { type: Boolean, default: true },
  // 复选框相关配置
  checkboxWidth: {
    type: [String, Number],
    default: 55,
  },
  checkboxAlign: {
    type: String,
    default: "center",
    validator: (v) => ["left", "center", "right"].includes(v),
  },
  // 序号列配置
  indexWidth: {
    type: [String, Number],
    default: 60,
  },
  indexAlign: {
    type: String,
    default: "center",
    validator: (v) => ["left", "center", "right"].includes(v),
  },
  indexLabel: {
    type: String,
    default: "序号",
  },
  // 操作列配置
  actionsWidth: {
    type: [String, Number],
    default: 120,
  },
  actionsLabel: {
    type: String,
    default: "操作",
  },
  actionsAlign: {
    type: String,
    default: "center",
    validator: (v) => ["left", "center", "right"].includes(v),
  },
  // 自动添加空行
  autoAddEmptyRow: { type: Boolean, default: true },

  // 获取数据时是否只返回勾选的行
  onlyChecked: {
    type: Boolean,
    default: true,
  },
  // 可勾选的判断函数
  selectable: {
    type: Function,
    default: () => true,
  },
  // 空行占位符样式
  emptyTextStyle: {
    type: Object,
    default: () => ({
      color: "#999",
      fontStyle: "italic",
    }),
  },
});

// 计算表格样式对象
const tableStyleObject = computed(() => {
  if (
    props.tableStyle &&
    typeof props.tableStyle === "object" &&
    !Array.isArray(props.tableStyle)
  ) {
    return { ...props.tableStyle };
  }

  if (typeof props.tableStyle === "string") {
    try {
      const styleObj = {};
      props.tableStyle
        .split(";")
        .map((decl) => decl.trim())
        .filter(Boolean)
        .forEach((decl) => {
          const [property, value] = decl.split(":").map((item) => item.trim());
          if (property && value) {
            const camelProperty = property.replace(/-([a-z])/g, (_, letter) =>
              letter.toUpperCase()
            );
            styleObj[camelProperty] = value;
          }
        });
      return { ...styleObj };
    } catch (error) {
      console.warn("Failed to parse tableStyle string:", error);
      return { width: "100%" };
    }
  }

  return { width: "100%" };
});

// 响应式数据
const tableRef = ref(null);
const tableData = ref([]);
const hoveredRowId = ref(-1);
const selectedRows = ref([]);
const isAddingRow = ref(false);
const lastEditTime = ref(0);
const cellRefs = ref({});
const activeEditCell = ref(null);

const selectableFn = computed(() => {
  return (row, index) => props.selectable(row, index);
});

// 设置单元格类名，用于样式控制
function setCellClassName({ row, column }) {
  return row[`$${column.field}_inEDit`] ? "edit-cell-focused" : "edit-cell";
}

// 创建空行
function createEmptyRow() {
  const row = {
    $id: `row_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  };
  props.columns.forEach((col) => {
    row[col.field] = col.defaultValue !== undefined ? col.defaultValue : "";
    row[`${col.field}$edit`] = false;
  });
  return row;
}

// 初始化表格
function initTableData() {
  if (Array.isArray(props.data) && props.data.length > 0) {
    tableData.value = props.data.map((row) => {
      const reactiveRow = reactive({
        ...row,
        $id:
          row.$id ||
          `row_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      });
      props.columns.forEach((col) => {
        if (reactiveRow[`${col.field}$edit`] === undefined) {
          reactiveRow[`${col.field}$edit`] = false;
        }
      });
      return reactiveRow;
    });

    tableData.value.push(createEmptyRow());
  } else {
    const defaultCount = Math.max(0, props.defaultRowCount);
    tableData.value = Array.from({ length: defaultCount }, () =>
      createEmptyRow()
    );
  }
}

// 获取表格数据
function getTableData(options = {}) {
  const {
    onlyChecked = props.onlyChecked,
    includeEmpty = false,
    fields = null,
    transform = null,
  } = options;

  let sourceData = [...tableData.value];

  if (props.showCheckbox && onlyChecked) {
    sourceData = [...selectedRows.value];
  }

  const result = sourceData
    .map((row) => {
      const data = {};
      const fieldsToUse = fields
        ? Array.isArray(fields)
          ? fields
          : [fields]
        : props.columns.map((col) => col.field);

      fieldsToUse.forEach((field) => {
        if (row.hasOwnProperty(field)) {
          data[field] = row[field];
        }
      });

      return typeof transform === "function" ? transform(data) : data;
    })
    .filter((row) => {
      if (includeEmpty) return true;

      return props.columns.some((col) => {
        const value = row[col.field];
        return (
          value !== null && value !== undefined && String(value).trim() !== ""
        );
      });
    });

  return result;
}

///////////////////////////////////  交互逻辑  ///////////////////////////////////
// 检查单元格是否在编辑状态
function isCellEditing(row, column) {
  if (!row) return false;
  return !!row._editing;
}

// 开始行编辑,子组件触发编辑逻辑
async function startCellEdit(row, column, field) {
  if (!row || !field) return;

  const cellKey = `${row.$id}_${field}`;
  // 取消上一个编辑单元格的状态（性能最优：直接操作已知的上一个单元格，无需遍历）
  if (activeEditCell.value) {
    const { rowId, field: oldField } = activeEditCell.value;
    const oldRow = tableData.value.find((r) => r.$id === rowId);
    if (oldRow) {
      oldRow[`${oldField}$edit`] = false;
      // 取消上一个单元格的焦点
      const oldCellRef = cellRefs.value[`${rowId}_${oldField}`];
      if (oldCellRef && typeof oldCellRef.blur === "function") {
        oldCellRef.blur();
      }
    }
  }
  // 激活当前单元格编辑状态
  row[`${field}$edit`] = true;
  // 更新当前编辑单元格状态
  activeEditCell.value = { rowId: row.$id, field };

  // 确保行ID存在
  if (!row.$id) {
    row.$id = `row_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  // 精准聚焦目标单元格（增加微小延迟，确保 DOM 完全更新）
  await nextTick();
  // 强制刷新引用，避免缓存失效
  const cellRef = cellRefs.value[cellKey];
  if (cellRef && typeof cellRef.focus === "function") {
    setTimeout(() => {
      cellRef.focus();
    }, 50); // 50ms 延迟兼容 DOM 更新时序问题
  }
}

// 核心：滚动到底部的通用函数
function scrollToBottom() {
  // 确保滚动容器已获取到DOM元素
  if (!tableRef.value) return;

  const container = tableRef.value;
  // 瞬间滚动（兼容性最好，推荐）
  // container.scrollTop = container.scrollHeight - container.clientHeight;

  // 平滑滚动（现代浏览器支持，el-splitter-panel中可按需使用）
  container.scrollTo({
    top: container.scrollHeight - container.clientHeight,
    behavior: "smooth",
  });
}

// 保存单元格编辑
async function saveCellVallue(payload) {
  const { rowIndex, field, value } = payload;
  if (rowIndex === undefined || !field || !tableData.value[rowIndex]) return;
  // 更新单元格值
  tableData.value[rowIndex][field] = value;
  const now = Date.now();
  const timeDiff = now - lastEditTime.value;
  lastEditTime.value = now;

  if (
    props.autoAddEmptyRow &&
    !isAddingRow.value &&
    rowIndex === tableData.value.length - 1 &&
    timeDiff > 100
  ) {
    const currentRow = tableData.value[rowIndex];
    const hasContent = props.columns.some((col) => {
      const val = currentRow[col.field];
      return val !== null && val !== undefined && String(val).trim() !== "";
    });

    if (hasContent) {
      isAddingRow.value = true;
      setTimeout(async () => {
        tableData.value.push(createEmptyRow());
        isAddingRow.value = false;
        await nextTick();
        scrollToBottom();
      }, 100);
    }
  }
}

// 取消单元格编辑
function cancelCellEdit(row, field) {
  if (row && field) {
    row[`${field}$edit`] = false;
    // 如果当前取消的是正在编辑的单元格，清空当前编辑状态
    if (
      activeEditCell.value &&
      activeEditCell.value.rowId === row.$id &&
      activeEditCell.value.field === field
    ) {
      activeEditCell.value = null;
    }
    return;
  }

  // 批量取消所有单元格编辑（兼容原有点击外部取消逻辑）
  tableData.value.forEach((row) => {
    props.columns.forEach((col) => {
      row[`${col.field}$edit`] = false;
    });
  });
  activeEditCell.value = null;
}

function onClickOutside(event) {
  if (tableRef.value && !tableRef.value.$el.contains(event.target)) {
    cancelCellEdit(); // 调用批量取消方法
  }
}

// 行悬停事件处理
function onCellMouseEnter(row) {
  hoveredRowId.value = row.$id;
}

function onCellMouseLeave() {
  hoveredRowId.value = -1;
}

// 取消行编辑
function saveCellEdit(row) {
  if (!row) return;

  row._editing = false;
  row._editingField = null;
}

// 删除行
function deleteRow(index) {
  if (index < 0 || index >= tableData.value.length) return;

  const deletedRow = tableData.value[index];
  selectedRows.value = selectedRows.value.filter((row) => {
    return !props.columns.every(
      (col) => row[col.field] === deletedRow[col.field]
    );
  });

  tableData.value.splice(index, 1);

  if (tableData.value.length === 0 && props.autoAddEmptyRow) {
    setTimeout(() => {
      tableData.value.push(createEmptyRow());
    }, 0);
  }
}

function onSelectionChange(selectedRowsData) {
  selectedRows.value = [...selectedRowsData];
}

// 设置单元格引用
function setCellRef(key, ref) {
  if (!key) return;
  if (ref) {
    cellRefs.value[key] = ref;
  } else {
    delete cellRefs.value[key];
  }
}

/////////////////////////////////// 监听与生命周期 ///////////////////////////////////
watch(
  () => [...props.data],
  () => {
    initTableData();
  },
  { immediate: true, deep: false }
);

onMounted(() => {
  initTableData();
  document.addEventListener("click", onClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", onClickOutside);
  cellRefs.value = {};
  tableData.value = [];
  selectedRows.value = [];
});

///////////////////////////////////  对外接口  ///////////////////////////////////
defineExpose({
  getTableData: (options = {}) => getTableData(options),
  getSelectedData: (options = {}) =>
    getTableData({ ...options, onlyChecked: true }),
  getAllData: (options = {}) =>
    getTableData({ ...options, onlyChecked: false }),
  getSelectedRows: () => [...selectedRows.value],
  addRow: (rowData = {}) => {
    const newRow = createEmptyRow();
    Object.keys(rowData).forEach((key) => {
      if (props.columns.some((col) => col.field === key)) {
        newRow[key] = rowData[key];
      }
    });
    tableData.value.push(newRow);
    return tableData.value.length - 1;
  },
  deleteRow,
  setData: (data) => {
    if (Array.isArray(data)) {
      tableData.value = data.map((row) => ({
        ...row,
        $id:
          row.$id ||
          `row_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        _editing: false,
        _editingField: null,
      }));
      selectedRows.value = [];
    }
  },
  clearData: () => {
    tableData.value = [createEmptyRow()];
    selectedRows.value = [];
  },
  selectAll: () => {
    if (
      tableRef.value &&
      typeof tableRef.value.toggleAllSelection === "function"
    ) {
      tableRef.value.toggleAllSelection(true);
    }
  },
  clearSelection: () => {
    if (tableRef.value && typeof tableRef.value.clearSelection === "function") {
      tableRef.value.clearSelection();
    }
  },
  setSelection: (rows) => {
    if (!tableRef.value || !Array.isArray(rows)) return;

    tableRef.value.clearSelection();
    rows.forEach((row) => {
      const foundRow = tableData.value.find((r) =>
        props.columns.every((col) => r[col.field] === row[col.field])
      );
      if (foundRow) {
        tableRef.value.toggleRowSelection(foundRow, true);
      }
    });
  },
  tableRef,
  getRawData: () => [...tableData.value],
  isRowSelected: (row) => {
    if (!row) return false;
    return selectedRows.value.some((selectedRow) =>
      props.columns.every((col) => selectedRow[col.field] === row[col.field])
    );
  },
  getEmptyRows: () => {
    return tableData.value
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => {
        return !props.columns.some((col) => {
          const value = row[col.field];
          return (
            value !== null && value !== undefined && String(value).trim() !== ""
          );
        });
      })
      .map(({ index }) => index);
  },
  removeEmptyRows: () => {
    const emptyRowIndexes = [];
    for (let i = tableData.value.length - 1; i >= 0; i--) {
      const row = tableData.value[i];
      const isEmpty = !props.columns.some((col) => {
        const value = row[col.field];
        return (
          value !== null && value !== undefined && String(value).trim() !== ""
        );
      });

      if (isEmpty && i !== tableData.value.length - 1) {
        emptyRowIndexes.push(i);
        tableData.value.splice(i, 1);
      }
    }
    return emptyRowIndexes.reverse();
  },
  startCellEdit,
  saveCellEdit,
  cancelCellEdit,
});
</script>

<style scoped>
.styled-edit-table {
  font-size: 14px;
  width: 100%;
}

.styled-edit-table :deep(.el-table__cell) {
  padding: 0;
  height: 100%;
  box-sizing: border-box;
}

.table-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  height: 100%;
}

.action-btn-delete {
  opacity: 0;
  color: #ff0000;
  cursor: pointer;
}

.action-visible {
  opacity: 1;
}

:deep(.el-table__row) .el-button.is-link {
  opacity: 0;
  transition: opacity 0.2s ease;
}

:deep(.el-table__row:hover) .el-button.is-link {
  opacity: 1;
}

:deep(.el-table__body tr),
:deep(.el-table__body td) {
  height: 40px;
  line-height: 40px;
  box-sizing: border-box;
}

:deep(.el-table__row.is-editing) {
  background-color: #f5f7fa;
  transition: background-color 0.2s ease;
}

:deep(.edit-cell-focused) {
  background-color: #e8f4fd;
}

:deep(.el-table--border) {
  border: 1px solid #ebeef5;
}

:deep(.el-table__row:hover) {
  background-color: #fafafa;
  transition: background-color 0.2s ease;
}
</style>
