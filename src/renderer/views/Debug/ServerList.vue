<template>
  <el-collapse-item name="1" class="collapse-server-list">
    <template #title="title">
      <div class="collapse-title-bar">
        <span>SERVER LIST</span>
        <div class="collapse-actions">
          <!-- 添加SFTP服务器 -->
          <Plus
            class="action-icon"
            @click="openServerForm()"
            title="添加SFTP服务器"
          />
        </div>
      </div>
    </template>
    <!-- 服务器列表 -->
    <div class="server-list" v-if="serverList.length">
      <div
        class="server-item"
        v-for="(server, index) in serverList"
        :key="server.id"
        @mouseenter="hoveredId = server.id"
        @mouseleave="hoveredId = ''"
      >
        (SSH2) {{ server.host }}
      </div>
    </div>

    <!-- 空列表提示 -->
    <div class="empty-tip" v-else>暂无SFTP服务器，点击 + 添加</div>
    <!-- 引入 ServerList 组件（此时组件内无插槽，仅渲染内容） -->
  </el-collapse-item>

  <!-- SFTP服务器添加/编辑弹窗 -->
  <el-dialog
    v-model="dialogVisible"
    title="SFTP服务器配置"
    width="400px"
    destroy-on-close
  >
    <el-form
      ref="serverFormRef"
      :model="serverForm"
      :rules="formRules"
      label-width="80px"
    >
      <el-form-item label="服务器IP" prop="host">
        <el-input v-model="serverForm.host" placeholder="请输入服务器IP/域名" />
      </el-form-item>
      <el-form-item label="端口" prop="port">
        <el-input
          v-model.number="serverForm.port"
          placeholder="默认22"
          type="number"
        />
      </el-form-item>
      <el-form-item label="用户名" prop="username">
        <el-input
          v-model="serverForm.username"
          placeholder="请输入登录用户名"
        />
      </el-form-item>
      <el-form-item label="密码" prop="password">
        <el-input
          v-model="serverForm.password"
          placeholder="请输入登录密码"
          show-password
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" @click="submitServerForm"> 保存 </el-button>
    </template>
  </el-dialog>

  <!-- 添加文件/目录弹窗 -->
  <el-dialog
    v-model="fileDirDialogVisible"
    :title="isAddFile ? '添加文件' : '添加目录'"
    width="350px"
    destroy-on-close
  >
    <el-form
      ref="fileDirFormRef"
      :model="fileDirForm"
      :rules="fileDirFormRules"
      label-width="70px"
    >
      <el-form-item label="路径" prop="path">
        <el-input
          v-model="fileDirForm.path"
          placeholder="如 /usr/local/test.txt 或 /usr/local/testDir"
          disabled
          v-if="!fileDirForm.editablePath"
        />
        <el-input
          v-model="fileDirForm.path"
          placeholder="如 /usr/local/test.txt 或 /usr/local/testDir"
          v-else
        />
      </el-form-item>
      <el-form-item label="名称" prop="name" v-if="isAddFile">
        <el-input
          v-model="fileDirForm.name"
          placeholder="请输入文件名（含后缀），如 test.txt"
        />
      </el-form-item>
      <el-form-item label="名称" prop="name" v-else>
        <el-input
          v-model="fileDirForm.name"
          placeholder="请输入目录名，如 testDir"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="fileDirDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="submitFileDirForm">
        确认添加
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
// 导入需要的图标
import { Plus, Edit, Delete } from "@element-plus/icons-vue";
import { ref, onMounted, defineEmits, defineExpose } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";

// 定义事件：向外暴露折叠目录、添加文件/目录的事件（供父组件对接FileTree）
const emit = defineEmits(["collapseDir", "addFile", "addDir"]);

// ---------------------- 基础状态管理 ----------------------
// 服务器列表（从localStorage加载）
const serverList = ref([]);
// 弹窗显隐
const dialogVisible = ref(false);
const fileDirDialogVisible = ref(false);
// 表单ref
const serverFormRef = ref(null);
const fileDirFormRef = ref(null);
// 表单数据（新增/编辑服务器）
const serverForm = ref({
  id: "",
  host: "",
  port: 22,
  username: "",
  password: "",
});
// 记录当前hover的服务器ID（控制按钮显示）
const hoveredId = ref("");
// 添加文件/目录相关状态
const isAddFile = ref(true); // true=添加文件，false=添加目录
const fileDirForm = ref({
  path: "/", // 父路径
  name: "", // 文件名/目录名
  editablePath: false, // 路径是否可编辑
});

// ---------------------- 表单校验规则 ----------------------
// 服务器表单规则
const formRules = ref({
  host: [{ required: true, message: "请输入服务器IP", trigger: "blur" }],
  port: [
    { required: true, message: "请输入端口号", trigger: "blur" },
    {
      type: "number",
      min: 1,
      max: 65535,
      message: "端口号需在1-65535之间",
      trigger: "blur",
    },
  ],
  username: [{ required: true, message: "请输入用户名", trigger: "blur" }],
  password: [{ required: true, message: "请输入密码", trigger: "blur" }],
});

// 添加文件/目录表单规则
const fileDirFormRules = ref({
  path: [{ required: true, message: "请输入父路径", trigger: "blur" }],
  name: [{ required: true, message: "请输入名称", trigger: "blur" }],
});

// ---------------------- 服务器管理核心方法 ----------------------
/**
 * 从localStorage加载服务器列表
 */
const loadServerList = () => {
  const stored = localStorage.getItem("sftp_server_list");
  if (stored) {
    try {
      serverList.value = JSON.parse(stored);
    } catch (e) {
      console.error("加载服务器列表失败", e);
      serverList.value = [];
    }
  }
};

/**
 * 保存服务器列表到localStorage
 */
function saveServerList() {
  localStorage.setItem("sftp_server_list", JSON.stringify(serverList.value));
}

// 1. 定义生成唯一 ID 的方法
function nextServerId() {
  // 时间戳 + 随机数（无需依赖，推荐）
  // 取现有列表最大 ID + 1，无数据则从 1 开始
  const maxId =
    serverList.value.length > 0
      ? Math.max(...serverList.value.map((item) => parseInt(item.id || 0)))
      : 0;
  return maxId + 1;
}

/**
 * 打开添加/编辑服务器弹窗
 * @param {Object} server 编辑时传入服务器信息，新增时不传
 */
const openServerForm = (server = null) => {
  if (serverFormRef.value) serverFormRef.value.clearValidate();

  // 重置表单数据
  if (server) {
    // 编辑场景：复用原有 ID
    serverForm.value = { ...server };
  } else {
    // 新增场景：自动生成 ID
    serverForm.value = {
      id: nextServerId(), // 核心：自动生成 ID
      host: "",
      port: 22,
      username: "",
      password: "",
    };
  }
  dialogVisible.value = true;
};

/**
 * 提交服务器表单（新增/编辑）
 */
const submitServerForm = () => {
  serverFormRef.value.validate((valid) => {
    if (!valid) {
      console.log("表单验证失败");
      return;
    }
    // 查找是否为编辑场景（通过 ID 匹配）
    const index = serverList.value.findIndex(
      (item) => item.id === serverForm.value.id
    );
    if (index > -1) {
      // 编辑：更新对应项
      serverList.value.splice(index, 1, { ...serverForm.value });
      ElMessage.success("服务器信息编辑成功");
    } else {
      // 新增：添加新项（ID 已自动生成）
      serverList.value.push({ ...serverForm.value });
      ElMessage.success("服务器添加成功");
    }

    saveServerList();
    dialogVisible.value = false;
  });
};

/**
 * 删除服务器
 * @param {string} id 服务器ID
 */
const deleteServer = (id) => {
  ElMessageBox.confirm("确定要删除该服务器吗？", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(() => {
      serverList.value = serverList.value.filter((item) => item.id !== id);
      saveServerList();
      ElMessage.success("删除成功");
    })
    .catch(() => {
      ElMessage.info("已取消删除");
    });
};

// ---------------------- 文件/目录/折叠目录方法 ----------------------
/**
 * 打开添加文件弹窗
 */
const handleAddFile = () => {
  if (!checkHasSelectedServer()) return;
  isAddFile.value = true;
  resetFileDirForm();
  fileDirDialogVisible.value = true;
};

/**
 * 打开添加目录弹窗
 */
const handleAddDir = () => {
  if (!checkHasSelectedServer()) return;
  isAddFile.value = false;
  resetFileDirForm();
  fileDirDialogVisible.value = true;
};

/**
 * 折叠所有目录：触发父组件事件
 */
const handleCollapseDir = () => {
  emit("collapseDir");
  ElMessage.success("所有目录已折叠");
};

/**
 * 重置添加文件/目录表单
 */
const resetFileDirForm = () => {
  if (fileDirFormRef.value) fileDirFormRef.value.clearValidate();
  fileDirForm.value = {
    path: "/",
    name: "",
    editablePath: false,
  };
};

/**
 * 校验是否已选择服务器
 * @returns {boolean} 是否选中服务器
 */
const checkHasSelectedServer = () => {
  if (serverList.value.length === 0) {
    ElMessage.warning("请先添加并选择SFTP服务器");
    return false;
  }
  // 实际项目中补充：校验是否有选中的服务器
  return true;
};

/**
 * 提交添加文件/目录表单：触发父组件事件
 */
const submitFileDirForm = () => {
  fileDirFormRef.value.validate((valid) => {
    if (!valid) return;

    // 拼接完整路径
    const fullPath = fileDirForm.value.path.endsWith("/")
      ? `${fileDirForm.value.path}${fileDirForm.value.name}`
      : `${fileDirForm.value.path}/${fileDirForm.value.name}`;

    // 触发父组件事件，传递添加的路径
    if (isAddFile.value) {
      emit("addFile", fullPath);
      ElMessage.success(`文件 ${fullPath} 添加成功`);
    } else {
      emit("addDir", fullPath);
      ElMessage.success(`目录 ${fullPath} 添加成功`);
    }

    fileDirDialogVisible.value = false;
  });
};

// ---------------------- 生命周期 & 暴露方法 ----------------------
onMounted(() => {
  loadServerList();
});

// 向外暴露方法（可选，供父组件调用）
defineExpose({
  loadServerList,
  openServerForm,
});
</script>

<style scoped>
.collapse-server-list {
  width: 100%;
  border-radius: 4px;
}

/* 核心：父容器 hover 时，显示所有后代 .action-icon */
.collapse-server-list:hover :deep(.action-icon) {
  opacity: 1 !important;
}

.collapse-title-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.collapse-actions {
  display: flex;
  gap: 2px;
  color: #666;
}

.server-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px;
  margin: 0 8px;
  border-radius: 4px;
  cursor: default;
  color: var(--dt-primary-text-color);
  font-size: 12px;
  transition: background-color 0.2s ease;
  cursor: pointer;
}

.server-item:hover {
  background-color: var(--dt-primary-bg-hover-color);
}

/* 空列表提示 */
.empty-tip {
  padding: 20px;
  text-align: center;
  color: #999;
  font-size: 14px;
}

/* 修复Element折叠面板标题padding */
::v-deep .el-collapse-item__header {
  padding-right: 16px !important;
}

.action-icon {
  font-size: 14px;
  color: #fefefe;
  width: 14px;
  height: 14px;
  line-height: 24px;
  text-align: center;
  border-radius: 2px;
  cursor: pointer;
  /* 初始隐藏（hover标题栏时显示） */
  opacity: 0;
  transition: all 0.2s ease;
}

/* 标题栏容器hover时显示所有图标 */
.collapse-title-bar:hover .action-icon {
  opacity: 1;
}

.action-icon:hover {
  color: #1989fa;
  background-color: rgba(25, 137, 250, 0.1);
}

.collapse-icon:hover {
  color: #67c23a;
  background-color: rgba(103, 194, 58, 0.1);
}

.action-icon:active {
  transform: scale(0.95);
  background-color: rgba(25, 137, 250, 0.2);
}

.collapse-icon:active {
  background-color: rgba(103, 194, 58, 0.2);
}
</style>
