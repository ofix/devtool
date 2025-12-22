<template>
  <div class="request-list-panel">
    <!-- 面板顶部操作栏 -->
    <div class="panel-header">
      <span class="panel-title">请求列表</span>
      <div class="header-actions">
        <el-button
          size="small"
          icon="el-icon-folder-add"
          @click="handleAddGroup"
        >
          新建分组
        </el-button>
        <el-button
          size="small"
          icon="el-icon-plus"
          @click="handleAddEmptyRequest"
        >
          新建请求
        </el-button>
      </div>
    </div>

    <!-- 分组与请求列表 -->
    <div class="request-group-container">
      <div
        class="request-group"
        v-for="group in groupedRequests"
        :key="group.id"
      >
        <!-- 分组头部 -->
        <div class="group-header" @click="handleToggleGroupExpand(group.id)">
          <el-icon :class="{ 'group-collapsed': !group.expand }">
            <el-icon-folder-opened v-if="group.expand" />
            <el-icon-folder v-else />
          </el-icon>
          <span class="group-name" @click.stop>{{ group.name }}</span>
          <!-- 分组操作按钮（hover显示） -->
          <div class="group-actions" @click.stop>
            <el-button
              size="mini"
              icon="el-icon-edit"
              @click="handleEditGroupName(group.id, group.name)"
            />
            <el-button
              size="mini"
              icon="el-icon-delete"
              type="danger"
              @click="handleDeleteGroup(group.id)"
            />
          </div>
        </div>

        <!-- 分组下的请求列表 -->
        <div class="request-list" v-if="group.expand">
          <div
            class="request-item"
            v-for="request in group.requestList"
            :key="request.id"
            :class="{ 'request-item-active': activeRequestId === request.id }"
            @click="handleSelectRequest(request.id)"
          >
            <!-- 请求方法标签（带颜色） -->
            <el-tag
              :type="getRequestTagType(request.method)"
              class="method-tag"
            >
              {{ request.method }}
            </el-tag>
            <!-- 请求别名 -->
            <span class="request-alias" @click.stop>{{ request.alias }}</span>
            <!-- 请求操作按钮（hover显示） -->
            <div class="request-actions" @click.stop>
              <el-button
                size="mini"
                icon="el-icon-edit"
                @click="handleEditRequestAlias(request.id, request.alias)"
              />
              <el-button
                size="mini"
                icon="el-icon-delete"
                type="danger"
                @click="handleDeleteRequest(request.id)"
              />
            </div>
          </div>

          <!-- 分组下无请求时的提示 -->
          <div class="empty-request-tip" v-if="group.requestList.length === 0">
            <span>暂无请求，点击右上角"新建请求"添加</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 新建分组弹窗 -->
    <el-dialog
      title="新建分组"
      v-model="addGroupDialogVisible"
      width="300px"
      destroy-on-close
    >
      <el-form :model="addGroupForm" label-width="80px">
        <el-form-item label="分组名称">
          <el-input v-model="addGroupForm.name" placeholder="请输入分组名称" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="addGroupDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleConfirmAddGroup"
            >确定</el-button
          >
        </span>
      </template>
    </el-dialog>

    <!-- 编辑分组名称弹窗 -->
    <el-dialog
      title="编辑分组名称"
      v-model="editGroupNameDialogVisible"
      width="300px"
      destroy-on-close
    >
      <el-form :model="editGroupNameForm" label-width="80px">
        <el-form-item label="分组名称">
          <el-input
            v-model="editGroupNameForm.name"
            placeholder="请输入新的分组名称"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="editGroupNameDialogVisible = false"
            >取消</el-button
          >
          <el-button type="primary" @click="handleConfirmEditGroupName"
            >确定</el-button
          >
        </span>
      </template>
    </el-dialog>

    <!-- 编辑请求别名弹窗 -->
    <el-dialog
      title="编辑请求别名"
      v-model="editRequestAliasDialogVisible"
      width="300px"
      destroy-on-close
    >
      <el-form :model="editRequestAliasForm" label-width="80px">
        <el-form-item label="请求别名">
          <el-input
            v-model="editRequestAliasForm.alias"
            placeholder="请输入新的请求别名"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="editRequestAliasDialogVisible = false"
            >取消</el-button
          >
          <el-button type="primary" @click="handleConfirmEditRequestAlias"
            >确定</el-button
          >
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  FolderOpened,
  Folder,
  FolderAdd,
  Plus,
  Edit,
  Delete,
} from "@element-plus/icons-vue";
import {
  useRequestStore,
  REQUEST_METHOD_COLOR_MAP,
} from "@/stores/StoreRequest";

// 引入Pinia仓库
const requestStore = useRequestStore();
// 响应式状态
const activeRequestId = ref(""); // 当前选中的请求ID
// 弹窗状态
const addGroupDialogVisible = ref(false);
const editGroupNameDialogVisible = ref(false);
const editRequestAliasDialogVisible = ref(false);
// 表单数据
const addGroupForm = ref({ name: "" });
const editGroupNameForm = ref({ id: "", name: "" });
const editRequestAliasForm = ref({ id: "", alias: "" });

// 计算属性：获取分组化的请求数据
const groupedRequests = computed(() => requestStore.groupedRequests);

// 辅助方法：根据请求方法获取标签类型（Element Plus Tag 类型）
const getRequestTagType = (method) => {
  const colorMap = {
    GET: "primary",
    POST: "success",
    PUT: "warning",
    PATCH: "info",
    DELETE: "danger",
  };
  return colorMap[method] || "default";
};

// 打开新建分组弹窗
const handleAddGroup = () => {
  addGroupForm.value.name = "";
  addGroupDialogVisible.value = true;
};

// 确认新建分组
const handleConfirmAddGroup = () => {
  if (!addGroupForm.value.name.trim()) {
    ElMessage.warning("请输入分组名称");
    return;
  }
  requestStore.addGroup(addGroupForm.value.name.trim());
  ElMessage.success("分组创建成功");
  addGroupDialogVisible.value = false;
};

// 打开编辑分组名称弹窗
const handleEditGroupName = (groupId, currentName) => {
  editGroupNameForm.value = { id: groupId, name: currentName };
  editGroupNameDialogVisible.value = true;
};

// 确认编辑分组名称
const handleConfirmEditGroupName = () => {
  if (!editGroupNameForm.value.name.trim()) {
    ElMessage.warning("请输入分组名称");
    return;
  }
  requestStore.editGroupName(
    editGroupNameForm.value.id,
    editGroupNameForm.value.name.trim()
  );
  ElMessage.success("分组名称修改成功");
  editGroupNameDialogVisible.value = false;
};

// 删除分组
const handleDeleteGroup = async (groupId) => {
  try {
    await ElMessageBox.confirm(
      "确定要删除该分组吗？分组下的所有请求也会被一并删除！",
      "警告",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "error",
      }
    );
    const result = requestStore.deleteGroup(groupId);
    if (result.success) {
      ElMessage.success(result.message);
    } else {
      ElMessage.warning(result.message);
    }
  } catch (err) {
    ElMessage.info("已取消删除");
  }
};

// 切换分组展开/折叠状态
const handleToggleGroupExpand = (groupId) => {
  requestStore.toggleGroupExpand(groupId);
};

// ==================== 请求操作方法 ====================
// 新建空请求
const handleAddEmptyRequest = () => {
  const emptyRequest = {
    alias: "未命名请求",
    method: "GET",
    url: "",
    headers: [{ key: "", value: "" }],
    body: { formData: [{ key: "", value: "" }], raw: '{\n  "key": "value"\n}' },
  };
  requestStore.addRequest(emptyRequest);
  ElMessage.success("空请求创建成功");
};

// 编辑请求别名
const handleEditRequestAlias = (requestId, currentAlias) => {
  editRequestAliasForm.value = { id: requestId, alias: currentAlias };
  editRequestAliasDialogVisible.value = true;
};

// 确认编辑请求别名
const handleConfirmEditRequestAlias = () => {
  if (!editRequestAliasForm.value.alias.trim()) {
    ElMessage.warning("请输入请求别名");
    return;
  }
  requestStore.editRequest(editRequestAliasForm.value.id, {
    alias: editRequestAliasForm.value.alias.trim(),
  });
  ElMessage.success("请求别名修改成功");
  editRequestAliasDialogVisible.value = false;
};

// 删除请求
const handleDeleteRequest = async (requestId) => {
  try {
    await ElMessageBox.confirm("确定要删除该请求吗？", "提示", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    });
    requestStore.deleteRequest(requestId);
    // 如果删除的是当前选中的请求，清空选中状态
    if (activeRequestId.value === requestId) {
      activeRequestId.value = "";
    }
    ElMessage.success("请求删除成功");
  } catch (err) {
    ElMessage.info("已取消删除");
  }
};

// 选择请求（用于联动请求编辑界面）
const handleSelectRequest = (requestId) => {
  activeRequestId.value = requestId;
  // 可通过 emit 向父组件传递选中的请求数据
  // emit('requestSelect', requestStore.getRequestById(requestId));
};

// 暴露方法（供父组件调用，如发送请求后添加到列表）
defineExpose({
  addRequest: requestStore.addRequest,
  getActiveRequest: () => requestStore.getRequestById(activeRequestId.value),
});
</script>

<style scoped>
.request-list-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: #f8f9fa;
  border-right: 1px solid #e6e6e6;
}

/* 面板头部 */
.panel-header {
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #e6e6e6;
}
.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}
.header-actions {
  display: flex;
  gap: 8px;
}

/* 分组容器 */
.request-group-container {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}
.request-group {
  margin-bottom: 4px;
}

/* 分组头部 */
.group-header {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  transition: background-color 0.2s;
}
.group-header:hover {
  background-color: #e9ecef;
}
.group-header .el-icon {
  margin-right: 8px;
  color: #6c757d;
}
.group-collapsed {
  transform: rotate(0deg);
}
.group-name {
  flex: 1;
  font-size: 14px;
  color: #333;
}
.group-actions {
  display: none;
  gap: 4px;
}
.group-header:hover .group-actions {
  display: flex;
}

/* 请求列表 */
.request-list {
  margin-left: 24px;
  border-left: 1px dashed #dee2e6;
}
.request-item {
  display: flex;
  align-items: center;
  padding: 6px 16px;
  cursor: pointer;
  transition: background-color 0.2s;
}
.request-item:hover {
  background-color: #e9ecef;
}
.request-item-active {
  background-color: #d1ecf1;
}
.method-tag {
  margin-right: 8px;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 2px;
}
.request-alias {
  flex: 1;
  font-size: 13px;
  color: #495057;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.request-actions {
  display: none;
  gap: 4px;
}
.request-item:hover .request-actions {
  display: flex;
}

/* 空请求提示 */
.empty-request-tip {
  padding: 12px 16px;
  font-size: 12px;
  color: #6c757d;
  text-align: center;
}

/* 弹窗样式 */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
