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
        @click="selectedServer = server"
        @contextmenu="(e) => handleContextMenu(e, server)"
        :class="{ active: selectedServer?.id === server.id }"
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
    :selected-node="selectedServer"
    @close="closeMenu"
    @open-connection="onCtxMenuOpenConnection"
    @close-connection="onCtxMenuCloseConnection"
    @rename-connection="onCtxMenuRenameConnection"
    @edit-connection="onCtxMenuEditConnection"
    @delete-connection="onCtxMenuDeleteConnection"
  />
</template>

<script setup>
// 导入需要的图标
import { Plus } from "@element-plus/icons-vue";
import { ref, onMounted, defineEmits, defineExpose } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
// 右键菜单
import ServerListContextMenu from "./ServerListContextMenu.vue";

// ---------------------- 基础状态管理 ----------------------
const serverList = ref([]); // 服务器列表
const selectedServer = ref(null); // 当前选中的服务器
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

// ---------------------- 服务器管理核心方法 ----------------------
const loadServerList = () => {
  const stored = localStorage.getItem("sftp_server_list");
  if (stored) {
    try {
      let servers = JSON.parse(stored);
      for (const server of servers) {
        server.connected = false;
      }
      serverList.value = servers;
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
  const maxId =
    serverList.value.length > 0
      ? Math.max(...serverList.value.map((item) => parseInt(item.id || 0)))
      : 0;
  return maxId + 1;
}

/**
 * @todo 打开添加/编辑服务器弹窗
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
      id: nextServerId(), // 核心：自动生成 ID
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

// --------------------- 右键菜单功能函数 ---------------------------
const showContextMenu = ref(false); // 菜单显示状态
const menuX = ref(0); // 菜单X坐标
const menuY = ref(0); // 菜单Y坐标

// 3. 右键菜单触发事件（核心：阻止默认右键、定位菜单、显示菜单）
const handleContextMenu = (e, server) => {
  // 阻止浏览器默认右键菜单
  e.preventDefault();
  e.stopPropagation();

  // 选中当前右键的服务器
  selectedServer.value = server;

  // 设置菜单坐标（适配视口边界，避免菜单超出屏幕）
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  const menuWidth = 220; // 菜单固定宽度（对应子组件样式）
  const menuHeight = 200; // 菜单预估高度

  // X轴：若超出右边界，向左偏移
  menuX.value =
    e.clientX + menuWidth > viewportWidth ? e.clientX - menuWidth : e.clientX;

  // Y轴：若超出下边界，向上偏移
  menuY.value =
    e.clientY + menuHeight > viewportHeight
      ? e.clientY - menuHeight
      : e.clientY;

  // 显示菜单
  showContextMenu.value = true;

  // 点击页面其他区域关闭菜单
  document.addEventListener("click", closeMenu, { once: true });
};

// 4. 关闭菜单函数
const closeMenu = () => {
  showContextMenu.value = false;
  // 清空坐标（可选）
  menuX.value = 0;
  menuY.value = 0;
};

/**
 * 打开服务器连接
 */
const onCtxMenuOpenConnection = async () => {
  // 边界校验：无选中节点/已连接则返回
  if (!selectedServer.value || selectedServer.value.connected) {
    ElMessage.warning(
      selectedServer.value ? "该服务器已处于连接状态" : "请选择服务器节点"
    );
    closeMenu();
    return;
  }
  try {
    const server = { ...selectedServer.value };
    window.channel.send("sftp-connect-server", server);
  } catch (error) {
    console.error("打开连接失败：", error);
  } finally {
    closeMenu(); // 无论成功失败，关闭菜单
  }
};

/**
 * 断开服务器连接
 */
const onCtxMenuCloseConnection = async () => {
  try {
    if (!selectedServer || !selectedServer.connected) {
      return;
    }
    const server = { ...selectedServer.value };
    window.channel.send("sftp-disconnect-server", server);
  } catch (error) {
    console.error("断开连接失败：", error);
  } finally {
    closeMenu();
  }
};

/**
 * 重命名服务器链接
 */
const onCtxMenuRenameConnection = () => {
  if (!selectedServer.value) {
    ElMessage.warning("请选择服务器节点");
    closeMenu();
    return;
  }

  showRenameDialog(selectedServer.value)
    .then((newName) => {
      if (newName && newName !== selectedServer.value.name) {
        const targetServer = serverList.value.find(
          (server) => server.id === selectedServer.value.id
        );
        if (targetServer) targetServer.name = newName;
      }
    })
    .catch(() => {
      ElMessage.info("已取消重命名");
    })
    .finally(() => {
      closeMenu();
    });
};

/**
 * 编辑服务器链接
 */
const onCtxMenuEditConnection = () => {
  if (!selectedServer.value) {
    ElMessage.warning("请选择服务器节点");
    closeMenu();
    return;
  }
  // 调用已有编辑弹窗
  openServerForm(selectedServer.value);
  closeMenu();
};

/**
 * 删除服务器链接
 */
const onCtxMenuDeleteConnection = async () => {
  if (!selectedServer.value) {
    ElMessage.warning("请选择服务器节点");
    closeMenu();
    return;
  }

  try {
    if (selectedServer.value.connected) {
      const server = { ...selectedServer.value };
      window.channel.send("sftp-disconnect-server", server);
    }
    serverList.value = serverList.value.filter(
      (server) => server.id !== selectedServer.value.id
    );
    saveServerList();
    selectedServer.value = null;
    ElMessage.success("删除成功");
  } catch (error) {
    // 取消删除时的提示
    if (error.message !== "cancel") {
      console.error("删除失败：", error);
      ElMessage.error(`删除失败：${error.message || "未知错误"}`);
    }
  } finally {
    closeMenu();
  }
};

// ---------------------- 生命周期 & 暴露方法 ----------------------
onMounted(() => {
  loadServerList();
  window.channel.on("sftp-server-connected", (data) => {
    const targetServer = serverList.value.find(
      (server) => server.id === data.id
    );
    if (targetServer) {
      targetServer.connected = true;
      saveServerList();
      const server = { ...targetServer }; // 获取远程目录
      window.channel.send("sftp-list-dir", server);
      ElMessage.success(`成功连接 ${data.host}`);
    }
  });
  window.channel.on("sftp-server-disconnected", (data) => {
    const targetServer = serverList.value.find(
      (server) => server.id === data.id
    );
    if (targetServer) {
      targetServer.connected = false;
      saveServerList();
      ElMessage.success(`成功断开连接 ${data.host}`);
    }
  });
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
