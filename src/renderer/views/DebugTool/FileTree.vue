<template>
  <el-collapse-item name="2" class="dt-file-tree-container">
    <template #title="title">
      <div class="collapse-title-bar">
        <span>REMOTE SERVER</span>
        <div class="collapse-actions">
          <!-- 添加文件 -->
          <DocumentAdd
            class="action-icon"
            @click="handleAddFile()"
            title="添加文件"
          />
          <!-- 添加目录 -->
          <FolderAdd
            class="action-icon"
            @click="handleAddDir()"
            title="添加目录"
          />
          <!-- 折叠所有目录 -->
          <Fold
            class="action-icon collapse-icon"
            @click="handleCollapseDir()"
            title="折叠所有目录"
          />
        </div>
      </div>
    </template>
    <!-- 高性能虚拟渲染树组件 -->
    <el-tree-v2
      ref="fileTreeRef"
      :data="fileTreeData"
      :props="treeProps"
      :expand-on-click-node="true"
      :highlight-current="true"
      :default-expanded-keys="[]"
      :height="treeHeight"
      node-key="path"
      @node-click="onTreeNodeClick"
      @node-expand="onNodeExpand"
      @node-contextmenu="handleRightClick"
      class="dt-file-tree"
    >
      <!-- 自定义节点内容（仅文件显示图标 + 名称） -->
      <template #default="{ node, data }">
        <div
          class="tree-node-content"
          :class="[
            // 标记是否为叶子节点（leaf）：Element Plus 原生 node.isLeaf
            node.isLeaf ? 'tree-node-leaf' : '',
          ]"
        >
          <!-- 折叠目录节点（MULTI 类型） -->
          <div
            v-if="data.type === FileNodeType.COLLAPSE_DIR"
            class="collapse-dir-node"
          >
            <!-- 折叠路径：用 › 分隔 -->
            <span class="collapse-path">
              <span
                v-for="(pathSegment, index) in data.collapsePath"
                :key="`${data.path}-segment-${index}`"
                class="path-segment"
                :class="{
                  'current-segment': index === data.collapsePath.length - 1,
                }"
                @click="onClickMultiPath(data, pathSegment, index)"
                @contextmenu="(e) => onContextMenuMultiPath(e, data)"
              >
                <!-- 路径分隔符 -->
                <span class="path-separator" :key="`sep-${data.path}-${index}`">
                  /
                </span>
                <span> {{ pathSegment.name }}</span>
              </span>
            </span>
          </div>

          <el-icon
            v-else-if="
              data.type === FileNodeType.FILE ||
              data.type === FileNodeType.SYMLINK
            "
            class="node-icon"
          >
            <IconFileHtml v-if="data.ext === 'html' || data.ext === 'htm'" />
            <IconFileCss v-else-if="data.ext === 'css'" />
            <IconFileJson v-else-if="data.ext === 'json'" />
            <IconFileJs v-else-if="data.ext === 'js' || data.ext === 'ts'" />
            <IconFileVue v-else-if="data.ext === 'vue'" />
            <IconFileCpp v-else-if="data.ext === 'cpp' || data.ext === 'hpp'" />
            <IconFileC v-else-if="data.ext === 'c' || data.ext === 'h'" />
            <IconFileSql v-else-if="data.ext === 'sql'" />
            <IconFileJava v-else-if="data.ext === 'java'" />
            <IconFileDart v-else-if="data.ext === 'dart'" />
            <IconFileShell v-else-if="data.ext === 'sh'" />
            <IconFileGo v-else-if="data.ext === 'go'" />
            <IconFilePhp v-else-if="data.ext === 'php'" />
            <IconFilePython v-else-if="data.ext === 'py'" />
            <IconFileYaml v-else-if="data.ext === 'yaml'" />
            <IconFileScala
              v-else-if="data.ext === 'scala' || data.ext === 'kt'"
            />
            <IconImage
              v-else-if="
                data.ext === 'png' || data.ext === 'jpg' || data.ext === 'svg'
              "
            />
            <IconZip
              v-else-if="
                data.ext === 'tar' ||
                data.ext === 'tar.gz' ||
                data.ext === 'zip' ||
                data.ext === 'gz'
              "
            />
            <IconFile v-else />
          </el-icon>
          <span
            v-if="
              editingNodeId !== data.path && data.type !== FileNodeType.MULTI
            "
            class="node-name"
            :style="{
              marginLeft:
                data.type === FileNodeType.FILE ||
                data.type === FileNodeType.SYMLINK
                  ? '-4px'
                  : '0',
            }"
          >
            {{ data.name }}
          </span>
          <el-input
            v-if="
              editingNodeId === data.path && data.type !== FileNodeType.MULTI
            "
            v-model="editName"
            class="edit-input"
            size="mini"
            :style="{
              marginLeft:
                data.type === FileNodeType.FILE ||
                data.type === FileNodeType.SYMLINK
                  ? '-4px'
                  : '0',
            }"
            @blur="handleEditBlur(data)"
            @keyup.enter="handleEditBlur(data)"
            @keyup.esc="cancelEdit()"
          />
        </div>
      </template>
    </el-tree-v2>
  </el-collapse-item>

  <!-- 引入独立右键菜单组件 -->
  <FileTreeContextMenu
    :show="showContextMenu"
    :x="menuX"
    :y="menuY"
    :selected-node="selectedNode"
    @close="closeMenu"
    @new-folder="handleNewFolder"
    @new-file="handleNewFile"
    @rename="handleRename"
    @copy-path="handleCopyPath"
    @delete="handleDelete"
  />
</template>

<script setup>
import {
  ref,
  readonly,
  computed,
  reactive,
  watch,
  nextTick,
  onUnmounted,
} from "vue";
import { DocumentAdd, FolderAdd, Fold } from "@element-plus/icons-vue";
import { ElMessage, ElNotification, ElMessageBox } from "element-plus";
import FileTreeContextMenu from "@/views/DebugTool/FileTreeContextMenu.vue";
import { FileNodeType } from "@/components/FileNodeType.js";
import { useServerListStore } from "@/stores/StoreServerList.js";
import { useFileStore } from "@/stores/StoreFile.js";
import { useEditorStore } from "@/stores/StoreEditor.js";

// 自定义树节点图标
import IconFileHtml from "@/components/icons/IconFileHtml.vue";
import IconFileCss from "@/components/icons/IconFileCss.vue";
import IconFileJson from "@/components/icons/IconFileJson.vue";
import IconFileJs from "@/components/icons/IconFileJs.vue";
import IconFileVue from "@/components/icons/IconFileVue.vue";
import IconFileSql from "@/components/icons/IconFileSql.vue";
import IconFileJava from "@/components/icons/IconFileJava.vue";
import IconFileDart from "@/components/icons/IconFileDart.vue";
import IconFileShell from "@/components/icons/IconFileShell.vue";
import IconFileGo from "@/components/icons/IconFileGo.vue";
import IconFilePhp from "@/components/icons/IconFilePhp.vue";
import IconFilePython from "@/components/icons/IconFilePython.vue";
import IconFileYaml from "@/components/icons/IconFileYaml.vue";
import IconFileScala from "@/components/icons/IconFileScala.vue";
import IconFileCpp from "@/components/icons/IconFileCpp.vue";
import IconFileC from "@/components/icons/IconFileC.vue";
import IconImage from "@/components/icons/IconImage.vue";
import IconFile from "@/components/icons/IconFile.vue";
import IconZip from "@/components/icons/IconZip.vue";

const serverListStore = useServerListStore();
const fileStore = useFileStore();
const editorStore = useEditorStore();

// --------------------- 编辑器方法 ---------------------
const { openFile, isFileOpened } = editorStore;
// --------------------- 树组件核心状态 ---------------------
const fileTreeRef = ref(null);
const fileTreeData = ref([]);

// 折叠单目录
const vsCodeLikeFileTreeData = computed(() => {
  // return fileTreeData.map((rootNode) => {
  //   const flatTree = flatFileTree(rootNode, [], true);
  //   return flatTree;
  // });
  console.log(fileTreeData);
  return fileTreeData.value;
});

const treeProps = readonly({
  value: "path",
  label: "name",
  children: "children",
});

const treeHeight = ref(window.innerHeight - 34);

// 对外暴露的事件
const emit = defineEmits([
  "node-click", // 文件/目录点击
  "load-success", // 增量加载成功
  "load-fail", // 增量加载失败
  "connection-close", // SFTP 连接关闭
  "fileOpened", // 文件打开事件
]);

// 递归扁平化单子目录节点，生成折叠节点
const flatFileTree = (node, parentPath = [], isRoot = true) => {
  const newNode = { ...node };
  let currentPath = [...parentPath, newNode.name];

  // 根路径处理优化
  if (newNode.name === "/") {
    currentPath = [...parentPath];
  }

  if (newNode.type === FileNodeType.DIRECTORY) {
    const children = newNode.children || []; // 兜底空数组
    // 空目录（children = [""]）：直接保留占位
    if (children.length === 1 && children[0] === "") {
      newNode.children = children;
      return newNode;
    }

    // 单子目录节点（需要折叠）
    if (
      children.length === 1 &&
      children[0] !== "" &&
      children[0].type === FileNodeType.DIRECTORY
    ) {
      return flatFileTree(children[0], currentPath, false); // 递归折叠
    }

    // 多个子节点/包含文件（终止折叠，标记为 MULTI 类型）
    if (parentPath.length > 0 && !isRoot) {
      newNode.type = FileNodeType.MULTI;
      newNode.multiPath = currentPath;
    }

    newNode.children = children.map((child) =>
      flatFileTree(child, currentPath, false)
    );
  }

  return newNode;
};

// -------------- 窗口大小监听 -------------------
const handleResize = () => {
  treeHeight.value = window.innerHeight - 34;
};
window.addEventListener("resize", handleResize);
onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
});

// -------------- SSH连接相关 -------------------
watch(
  () => serverListStore.currentServer,
  async (newServer, oldServer) => {
    console.log(newServer);
    console.log(oldServer);
    if (newServer != oldServer && newServer) {
      try {
        // 连接成功，加载目录
        let params = {
          host: newServer.host,
          port: newServer.port,
          username: newServer.username,
          password: newServer.password,
          remotePath: newServer.remotePath,
        };
        let dirData = await window.channel.sshListDir(params);
        fileTreeData.value = [dirData];
        console.log(
          `加载服务器 ${newServer.host} 目录 ${newServer.remotePath}`
        );
      } catch (e) {
        console.error("加载目录失败", e);
        ElMessage.error(`加载目录失败：${e.message || "未知错误"}`);
        fileTreeData.value.length = 0; // 清空数组
      }
    } else {
      // 断开连接，清空相关数据
      fileTreeData.value.length = 0; // 清空数组
    }
  },
  { immediate: true }
);

// 文件树节点单击响应函数
async function onTreeNodeClick(data, node) {
  if (
    data.type == FileNodeType.FILE ||
    data.type == FileNodeType.FILE_SYMLINK
  ) {
    selectedNode.value = data;
    const server = serverListStore.currentServer;
    if (!server) {
      ElMessage.warning("未连接到服务器");
      return;
    }

    let params = {
      host: server.host,
      port: server.port,
      username: server.username,
      password: server.password,
      path: data.path,
      size: data.size,
    };
    const fileInfo = await fileStore.getRemoteFileContents(params);
    openFile(fileInfo);
  }
}

// 文件树节点展开响应函数
async function onNodeExpand(data, node) {
  if (
    data.type == FileNodeType.FILE ||
    data.type == FileNodeType.FILE_SYMLINK
  ) {
    return;
  }
  const server = serverListStore.currentServer;
  if (!server) {
    ElMessage.warning("未连接到服务器");
    return;
  }

  try {
    // 加载子目录数据
    let params = {
      host: server.host,
      port: server.port,
      username: server.username,
      password: server.password,
      remotePath: data.path,
    };
    console.log(`增量加载 ${server.host} 目录 ${data.path}`);
    const childData = await window.channel.sshListDir(params);
    fileTreeRef.value.setData([childData]);
  } catch (e) {
    console.error("加载子目录失败", e);
    if (!data.children) {
      data.children = [""];
    }
    ElMessage.error(`加载子目录失败：${e.message || "未知错误"}`);
  }
}

// 折叠所有目录
function handleCollapseDir() {
  if (fileTreeRef.value) {
    fileTreeRef.value.collapseAll();
  }
}

// -------------- 右键菜单核心状态 ----------------
const showContextMenu = ref(false);
const menuX = ref(0);
const menuY = ref(0);
const selectedNode = ref(null); // 右键选中的节点
const editingNodeId = ref("");
const editName = ref("");

// 存储事件监听引用
const clickOutsideHandler = (e) => closeOnClickOutside(e);
const escHandler = (e) => closeOnEsc(e);

// 单击折叠节点
function onClickMultiPath(data, pathSegment, index) {}

// 右键菜单点击折叠节点
function onContextMenuMultiPath(e, data) {
  e.preventDefault();
  e.stopPropagation();
  console.log(e, data);
}

// 打开右键菜单
function handleRightClick(event, data, node) {
  event.preventDefault();
  event.stopPropagation();

  // 记录选中节点和菜单位置（传递给子组件）
  selectedNode.value = data;
  menuX.value = event.clientX;
  menuY.value = event.clientY;
  showContextMenu.value = true;

  // 监听 ESC 键和点击外部关闭菜单（仅执行一次）
  document.addEventListener("click", clickOutsideHandler, { once: true });
  document.addEventListener("keydown", escHandler, { once: true });
}

// 监听 ESC 键关闭菜单
function closeOnEsc(e) {
  if (e.key === "Escape") {
    closeMenu();
  }
}

// 点击页面任意位置关闭菜单
function closeOnClickOutside(e) {
  const menu = document.querySelector(".vscode-context-menu");
  if (menu && !menu.contains(e.target)) {
    closeMenu();
  }
}

// 关闭右键菜单
function closeMenu() {
  showContextMenu.value = false;
  document.removeEventListener("click", clickOutsideHandler);
  document.removeEventListener("keydown", escHandler);
}

// 组件卸载时清理所有监听
onUnmounted(() => {
  closeMenu();
});

// 新建文件夹
function handleNewFolder() {
  if (
    !selectedNode.value ||
    selectedNode.value.type !== FileNodeType.DIRECTORY
  ) {
    ElMessage.warning("只能在文件夹下新建文件夹");
    closeMenu();
    return;
  }

  // 生成唯一path（代替id，匹配tree的node-key）
  const newPath = `${selectedNode.value.path}/${Date.now()}-新建文件夹`;
  const newFolder = {
    name: "新建文件夹",
    path: newPath,
    type: FileNodeType.DIRECTORY,
    children: [],
  };

  if (!selectedNode.value.children) selectedNode.value.children = [];
  selectedNode.value.children.push(newFolder);

  nextTick(() => {
    if (fileTreeRef.value) {
      fileTreeRef.value.setExpanded(selectedNode.value, true);
    }
    enterEditMode(newPath, "新建文件夹");
  });

  closeMenu();
}

// 新建文件
function handleNewFile() {
  if (
    !selectedNode.value ||
    selectedNode.value.type !== FileNodeType.DIRECTORY
  ) {
    closeMenu();
    return;
  }

  // 生成唯一path
  const newPath = `${selectedNode.value.path}/${Date.now()}-新建文件.txt`;
  const newFile = {
    name: "新建文件.txt",
    path: newPath,
    type: FileNodeType.FILE,
    ext: "txt",
  };

  if (!selectedNode.value.children) selectedNode.value.children = [];
  selectedNode.value.children.push(newFile);

  // 刷新树数据
  fileTreeData.value = [...fileTreeData.value];

  nextTick(() => {
    enterEditMode(newPath, "新建文件.txt");
  });

  closeMenu();
}

// 文件或者文件夹重命名
function handleRename() {
  if (!selectedNode.value) {
    ElMessage.warning("请选择要重命名的文件/文件夹");
    closeMenu();
    return;
  }
  enterEditMode(selectedNode.value.path, selectedNode.value.name);
  closeMenu();
}

// 获取节点完整路径
function getNodeFullPath(node) {
  if (!node) return "";
  // 拼接完整路径（兼容MULTI类型）
  if (node.type === FileNodeType.MULTI) {
    return "/" + node.multiPath.join("/");
  }
  return node.path || "/" + node.name;
}

// 复制文件或者目录路径
function handleCopyPath() {
  if (!selectedNode.value) return;

  const fullPath = getNodeFullPath(selectedNode.value);
  navigator.clipboard
    .writeText(fullPath)
    .then(() => {
      ElNotification.success({
        title: "成功",
        message: `路径已复制：${fullPath}`,
        duration: 1500,
        position: "bottom-right",
      });
    })
    .catch(() => {
      ElMessage.error("复制路径失败，请手动复制");
    });

  closeMenu();
}

// 删除文件或者目录
function handleDelete() {
  if (!selectedNode.value) return;

  ElMessageBox.confirm(
    `确定要删除 ${selectedNode.value.name} 吗？`,
    "删除确认",
    {
      type: "warning",
      confirmButtonText: "确定",
      cancelButtonText: "取消",
    }
  )
    .then(async () => {
      const deleteNode = (tree, nodePath) => {
        for (let i = 0; i < tree.length; i++) {
          if (tree[i].path === nodePath) {
            tree.splice(i, 1);
            return true;
          }
          if (tree[i].children && tree[i].children.length > 0) {
            const deleted = deleteNode(tree[i].children, nodePath);
            if (deleted) return true;
          }
        }
        return false;
      };

      const deleted = deleteNode(fileTreeData, selectedNode.value.path);
      if (deleted) {
        selectedNode.value = null;
      } else {
        ElMessage.error("删除失败：未找到该节点");
      }
    })
    .catch(() => {
      ElMessage.info("已取消删除");
    });

  closeMenu();
}

// 辅助函数：进入编辑模式
function enterEditMode(nodePath, defaultName) {
  editingNodeId.value = nodePath;
  editName.value = defaultName;
  nextTick(() => {
    const input = document.querySelector(".edit-input");
    if (input) {
      input.focus();
      // 选中输入框内容（方便直接编辑）
      input.select();
    }
  });
}

// 取消编辑
function cancelEdit() {
  editingNodeId.value = "";
  editName.value = "";
}

// 保存编辑
function handleEditBlur(data) {
  const trimedName = editName.value.trim();
  if (!trimedName) {
    ElMessage.warning("名称不能为空");
    enterEditMode(data.path, data.name);
    return;
  }

  // 文件名处理：补充后缀（仅文件类型）
  if (data.type === FileNodeType.FILE) {
    const hasExt = trimedName.includes(".") && !trimedName.endsWith(".");
    if (!hasExt) {
      data.name = `${trimedName}.txt`;
      data.ext = "txt";
    } else {
      data.name = trimedName;
      // 提取后缀
      const extIndex = trimedName.lastIndexOf(".");
      data.ext = trimedName.slice(extIndex + 1);
    }
  } else {
    data.name = trimedName;
  }

  // 更新path（保证路径唯一性）
  const parentPath = data.path.substring(0, data.path.lastIndexOf("/"));
  data.path = parentPath ? `${parentPath}/${data.name}` : data.name;

  // 刷新树数据
  fileTreeData.value = [...fileTreeData.value];

  cancelEdit();
  ElMessage.success("重命名成功");
}

// 顶部按钮：添加文件/目录（默认在根目录创建）
function handleAddFile() {
  // 选中根目录（若存在）
  if (fileTreeData.value.length > 0) {
    selectedNode.value = fileTreeData.value[0];
  } else {
    // 无根目录时创建根目录
    const rootDir = {
      name: "/",
      path: "/",
      type: FileNodeType.DIRECTORY,
      children: [],
    };
    fileTreeData.value.push(rootDir);
    selectedNode.value = rootDir;
  }
  handleNewFile();
}

function handleAddDir() {
  if (fileTreeData.value.length > 0) {
    selectedNode.value = fileTreeData.value[0];
  } else {
    const rootDir = {
      name: "/",
      path: "/",
      type: FileNodeType.DIRECTORY,
      children: [],
    };
    fileTreeData.value.push(rootDir);
    selectedNode.value = rootDir;
  }
  handleNewFolder();
}
</script>

<style scoped>
.dt-file-tree-container {
  width: 100%;
  background-color: transparent;
  border-right: 1px solid var(--el-border-color-light);
  overflow-y: hidden;
}

.dt-file-tree-container:hover :deep(.action-icon) {
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

.dt-file-tree {
  --el-tree-node-hover-bg-color: rgba(220, 220, 220, 0.1);
  --el-tree-node-current-bg-color: rgba(64, 158, 255, 0.1);
  --el-tree-node-current-color: #37373d;
  height: calc(100vh - 156px);
  max-height: calc(100vh - 156px);
  overflow-y: hidden;
}

.tree-node-content {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
}

/* 折叠目录节点样式 */
.collapse-dir-node {
  display: flex;
  align-items: center;
  gap: 6px;
}

.collapse-path {
  font-size: 12px;
  color: var(--dt-primary-text-color);
  cursor: pointer;
}

.collapse-path span {
  color: var(--dt-primary-text-color); /* 分隔符颜色 */
  margin: 0 2px;
}

.collapse-path .current-segment {
  color: var(--el-color-primary);
  font-weight: 500;
}

.folder-icon {
  color: #e6a86b;
  font-size: 14px;
}

.node-icon {
  font-size: 16px;
  width: 16px;
  height: 16px;
}

:deep(
  .el-tree--highlight-current .el-tree-node.is-current > .el-tree-node__content
) {
  background-color: var(--dt-primary-bg-color) !important;
}

:deep(
  .el-tree--highlight-current:hover
    .el-tree-node.is-current
    > .el-tree-node__content
) {
  background-color: var(--dt-primary-bg-color) !important;
}

.node-name {
  cursor: pointer;
  flex: 1;
  padding: 2px 4px;
  border-radius: 2px;
  color: var(--dt-primary-text-color);
  font-size: 12px;
}

.edit-input {
  width: 140px !important;
  padding: 2px 4px !important;
  margin: 0 !important;
}

.tree-node-leaf {
  margin-left: -20px !important;
}
</style>
