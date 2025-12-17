<template>
  <el-collapse-item name="1" class="collapse-server-list">
    <template #title="title">
      <div class="collapse-title-bar">
        <span>SERVER LIST</span>
        <div class="collapse-actions">
          <Plus
            class="action-icon"
            @click="openServerForm()"
            title="添加SFTP服务器"
          />
        </div>
      </div>
    </template>
    <!-- 服务器列表 -->
    <div class="server-list" v-if="serverListStore.serverList.length">
      <div
        class="server-item"
        v-for="(server, index) in serverListStore.serverList"
        :key="server.id"
        @mouseenter="hoveredId = server.id"
        @mouseleave="hoveredId = ''"
        @contextmenu="(e) => handleContextMenu(e, server)"
        :class="{ active: serverListStore.currentServer?.id === server.id }"
      >
        <span
          class="link-status"
          :style="{ backgroundColor: server.connected ? '#67c23a' : '#909399' }"
        ></span
        >{{ server.host }}
      </div>
    </div>
    <!-- 空列表提示 -->
    <div class="empty-tip" v-else>暂无SFTP服务器，点击 + 添加</div>
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

  <!-- 服务器链接右键菜单组件 -->
  <ServerListContextMenu
    :show="showContextMenu"
    :x="menuX"
    :y="menuY"
    :selected-node="serverListStore.currentServer"
    @close="closeMenu"
    @open-connection="onCtxMenuOpenConnection"
    @close-connection="onCtxMenuCloseConnection"
    @rename-connection="onCtxMenuRenameConnection"
    @edit-connection="onCtxMenuEditConnection"
    @delete-connection="onCtxMenuDeleteConnection"
  />
</template>

<script setup>
import { Plus } from "@element-plus/icons-vue";
import { ref, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useServerListStore } from "@/stores/StoreServerList.js";
import ServerListContextMenu from "./ServerListContextMenu.vue";

const serverListStore = useServerListStore();
const dialogVisible = ref(false);
const serverFormRef = ref(null); // 表单ref
const serverForm = ref({
  id: "",
  host: "",
  port: 22,
  username: "",
  password: "",
  connected: false,
  remotePath: "/usr/share/www",
});
const hoveredId = ref(""); // 服务器ID
const ctxSelectedServer = ref(null);

// ---------------------- 表单校验规则 ----------------------
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

// 生成唯一 ID 的方法
function nextServerId() {
  const maxId =
    serverListStore.serverList.length > 0
      ? Math.max(
          ...serverListStore.serverList.map((item) => parseInt(item.id || 0))
        )
      : 0;
  return maxId + 1;
}

// ---------------------- 服务器表单相关 ----------------------
/**
 * 打开添加/编辑服务器弹窗
 * @param {Object} server 编辑时传入服务器信息，新增时不传
 */
const openServerForm = (server = null) => {
  if (serverFormRef.value) serverFormRef.value.clearValidate();

  if (server) {
    // 编辑服务器
    serverForm.value = { ...server };
  } else {
    // 新增服务器
    serverForm.value = {
      id: nextServerId(), // 自动生成 ID
      host: "",
      port: 22,
      username: "",
      password: "",
      connected: false,
      remotePath: "/usr/share/www",
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
    const index = serverListStore.serverList.findIndex(
      (item) => item.id === serverForm.value.id
    );
    if (index > -1) {
      serverListStore.updateServer({ ...serverForm.value });
      ElMessage.success("服务器信息编辑成功");
    } else {
      serverListStore.addServer({ ...serverForm.value });
      ElMessage.success("服务器添加成功");
    }

    dialogVisible.value = false;
  });
};

// --------------------- 右键菜单功能函数 ---------------------------
const showContextMenu = ref(false);
const menuX = ref(0);
const menuY = ref(0);

const handleContextMenu = (e, server) => {
  e.preventDefault();
  e.stopPropagation();

  ctxSelectedServer.value = server;

  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  const menuWidth = 220;
  const menuHeight = 200;

  menuX.value =
    e.clientX + menuWidth > viewportWidth ? e.clientX - menuWidth : e.clientX;
  menuY.value =
    e.clientY + menuHeight > viewportHeight
      ? e.clientY - menuHeight
      : e.clientY;

  showContextMenu.value = true;

  document.addEventListener("click", closeMenu, { once: true });
};

const closeMenu = () => {
  showContextMenu.value = false;
  menuX.value = 0;
  menuY.value = 0;
  // ctxSelectedServer.value = null;
};

/**
 * 打开服务器连接
 */
const onCtxMenuOpenConnection = async () => {
  const selectedServer = ctxSelectedServer.value;
  if (!selectedServer) {
    ElMessage.warning("请选择服务器节点");
    closeMenu();
    return;
  }
  if (selectedServer.connected) {
    closeMenu();
    return;
  }
  try {
    let server = { ...selectedServer }; // 将Pinia引用对象转换成普通对象
    await serverListStore.connectServer(server);
  } catch (error) {
    console.error("打开连接失败：", error);
    ElMessage.error("连接服务器失败");
  } finally {
    closeMenu();
  }
};

/**
 * 断开服务器连接
 */
const onCtxMenuCloseConnection = async () => {
  const selectedServer = serverListStore.currentServer;
  try {
    if (!selectedServer || !selectedServer.connected) {
      closeMenu();
      return;
    }
    await serverListStore.disconnectServer(selectedServer);
    serverListStore.currentServer = null;
    const target = serverListStore.serverList.find(
      (item) => item.id === selectedServer.id
    );
    if (target) {
      target.connected = false;
      serverListStore.saveServerList();
    }
  } catch (error) {
    console.error("断开连接失败：", error);
    ElMessage.error("断开服务器连接失败");
  } finally {
    closeMenu();
  }
};

/**
 * 重命名服务器链接
 */
const showRenameDialog = async (server) => {
  return new Promise((resolve, reject) => {
    ElMessageBox.prompt("请输入新的服务器名称", "重命名服务器", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      inputValue: server.name || server.host, // 用host兜底
      inputValidator: (value) => {
        if (!value) return "名称不能为空";
      },
    })
      .then(({ value }) => {
        resolve(value);
      })
      .catch(() => {
        reject(new Error("cancel"));
      });
  });
};

const onCtxMenuRenameConnection = () => {
  const selectedServer = ctxSelectedServer.value;
  if (!selectedServer) {
    ElMessage.warning("请选择服务器节点");
    closeMenu();
    return;
  }

  showRenameDialog(selectedServer)
    .then((newName) => {
      if (newName && newName !== (selectedServer.name || selectedServer.host)) {
        const updatedServer = { ...selectedServer, name: newName };
        serverListStore.updateServer(updatedServer);
        ElMessage.success("重命名成功");
      }
    })
    .catch(() => {
      ElMessage.info("已取消重命名");
    })
    .finally(() => {
      closeMenu();
      ctxSelectedServer.value = null;
    });
};

/**
 * 编辑服务器链接
 */
const onCtxMenuEditConnection = () => {
  const selectedServer = ctxSelectedServer.value;
  if (!selectedServer) {
    ElMessage.warning("请选择服务器节点");
    closeMenu();
    return;
  }
  // 调用编辑弹窗
  openServerForm(selectedServer);
  closeMenu();
  ctxSelectedServer.value = null;
};

/**
 * 删除服务器链接
 */
const onCtxMenuDeleteConnection = async () => {
  const selectedServer = ctxSelectedServer.value;
  if (!selectedServer) {
    ElMessage.warning("请选择服务器节点");
    closeMenu();
    return;
  }

  try {
    await ElMessageBox.confirm("确定要删除该服务器吗？", "删除确认", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    });

    // 若已连接，先断开
    if (selectedServer.connected) {
      await serverListStore.disconnectServer(selectedServer);
      // 断开后清空currentServer
      if (serverListStore.currentServer?.id === selectedServer.id) {
        serverListStore.currentServer = null;
      }
    }
    serverListStore.deleteServer(selectedServer);
    ElMessage.success("删除成功");
  } catch (error) {
    if (error.message !== "cancel") {
      console.error("删除失败：", error);
      ElMessage.error(`删除失败：${error.message || "未知错误"}`);
    }
  } finally {
    closeMenu();
    ctxSelectedServer.value = null;
  }
};

// ---------------------- 生命周期 ----------------------
onMounted(() => {});

// 向外暴露方法（供父组件调用）
defineExpose({
  openServerForm,
  loadServerList: serverListStore.loadServerList, // 暴露store的加载方法
});
</script>

<style scoped>
.collapse-server-list {
  width: 100%;
  border-radius: 4px;
}

/* 父容器 hover 时，显示所有后代 .action-icon */
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
  padding: 4px 12px 2px 12px;
  margin: 0 8px;
  border-radius: 4px;
  cursor: default;
  color: var(--dt-primary-text-color);
  font-size: 12px;
  transition: background-color 0.2s ease;
  cursor: pointer;
}

/* 选中的服务器样式 */
.server-item.active {
  background-color: var(--dt-primary-bg-hover-color);
  color: var(--el-color-primary);
}

.link-status {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 10px;
  margin-right: 6px;
  background-color: #67c23a;
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
:deep(.el-collapse-item__header) {
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
