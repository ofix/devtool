<template>
  <!-- 空状态：显示加号按钮 -->
  <div v-if="!treeDataReady" class="empty-tree-state">
    <div class="empty-content">
      <el-empty description="暂无文件夹">
        <el-button
          type="primary"
          size="large"
          :icon="Plus"
          @click="selectFolder"
        >
          添加文件夹
        </el-button>
      </el-empty>
    </div>
  </div>
  <!-- 高性能虚拟渲染树组件 -->
  <el-tree-v2
    v-else
    ref="fileTreeRef"
    :data="fileTree"
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
          v-if="editingNodeId !== data.path && data.type !== FileNodeType.MULTI"
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
          v-if="editingNodeId === data.path && data.type !== FileNodeType.MULTI"
          v-model="editName"
          class="edit-input"
          size="small"
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
  watch,
  nextTick,
  shallowRef,
  onMounted,
  onUnmounted,
} from "vue";
import { ElMessage, ElNotification, ElMessageBox } from "element-plus";
import FileTreeContextMenu from "@/views/DebugTool/FileTreeContextMenu.vue";
import { FileNodeType } from "@/common/FileNodeType.js";
import FileTree from "@/common/FileTree.js";
import { useEditorStore } from "@/stores/StoreEditor.js";

// 自定义树节点图标
import IconFileHtml from "@/icons/IconFileHtml.vue";
import IconFileCss from "@/icons/IconFileCss.vue";
import IconFileJson from "@/icons/IconFileJson.vue";
import IconFileJs from "@/icons/IconFileJs.vue";
import IconFileVue from "@/icons/IconFileVue.vue";
import IconFileSql from "@/icons/IconFileSql.vue";
import IconFileJava from "@/icons/IconFileJava.vue";
import IconFileDart from "@/icons/IconFileDart.vue";
import IconFileShell from "@/icons/IconFileShell.vue";
import IconFileGo from "@/icons/IconFileGo.vue";
import IconFilePhp from "@/icons/IconFilePhp.vue";
import IconFilePython from "@/icons/IconFilePython.vue";
import IconFileYaml from "@/icons/IconFileYaml.vue";
import IconFileScala from "@/icons/IconFileScala.vue";
import IconFileCpp from "@/icons/IconFileCpp.vue";
import IconFileC from "@/icons/IconFileC.vue";
import IconImage from "@/icons/IconImage.vue";
import IconFile from "@/icons/IconFile.vue";
import IconZip from "@/icons/IconZip.vue";

const editorStore = useEditorStore();

// --------------------- 编辑器方法 ---------------------
const { openFile, isFileOpened } = editorStore;
// --------------------- 树组件核心状态 ---------------------
const fileTreeRef = ref(null);
const fileTree = shallowRef([]); // 必须是数组可迭代
const treeDataReady = ref(false); // 数据是否加载完成
let rawFileTree = null;

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

// -------------- 窗口大小监听 -------------------
const handleResize = () => {
  treeHeight.value = window.innerHeight - 34;
};

onMounted(() => {
  document.addEventListener("keydown", handleKeyDown);
  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  document.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("resize", handleResize);
  closeMenu();
});

// 快捷键打开对话框
function handleKeyDown(event) {
  // Ctrl+O 或 Command+O (Mac)
  if ((event.ctrlKey || event.metaKey) && event.key === "o") {
    selectFolder();
    return;
  }

  // 可选：Ctrl+Shift+O 打开带选项的对话框
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === "O") {
    event.preventDefault();
    openFolder({
      title: "高级选择",
      properties: ["openDirectory", "createDirectory"],
    });
  }
}

function selectFolder(event) {
  event.preventDefault();
  openFolder();
}

// 打开文件夹
const openFolder = async (options = {}) => {
  try {
    const result = await window.channel.selectLocalDir({
      title: options.title || "请选择文件夹",
      ...options,
    });

    if (result.canceled) {
      return;
    }
    rawFileTree = new FileTree(result.data.dir);
    rawFileTree.addChildren(result.data.dir.path, result.data.files);
    let collapsedTree = rawFileTree.collapse();
    console.log(collapsedTree);
    // 数据准备好后，再标记 ready
    treeDataReady.value = true;
    // 等待 DOM 更新
    await nextTick();
    if (fileTreeRef.value) {
      fileTreeRef.value.setData([collapsedTree]); // 初始化文件树的时候需要全量赋值
    }
  } catch (error) {
    ElMessage.error(`打开文件夹失败: ${error.message}`);
    console.error(error);
  }
};

// 打开文件
async function onTreeNodeClick(data, node) {
  if (
    data.type == FileNodeType.FILE ||
    data.type == FileNodeType.FILE_SYMLINK ||
    !data.loaded ||
    !data.loading
  ) {
    selectedNode.value = data;
    const fileInfo = await window.channel.readLocalFile({
      path: data.path,
    });
    openFile(fileInfo);
  } else {
    // 展开目录
    node.isCollapsed ? node.expandNode() : node.collapseNode();
  }
}

// 文件树节点展开响应函数
async function onNodeExpand(data, node) {
  if (
    data.type == FileNodeType.FILE ||
    data.type == FileNodeType.FILE_SYMLINK ||
    data.loaded
  ) {
    return;
  }

  try {
    // 加载子目录数据
    console.log(`增量加载本地目录 ${data.path}`);
    const childData = await window.channel.readLocalDir({ path: data.path });
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
  fileTree.value = [...fileTree.value];

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

      const deleted = deleteNode(fileTree, selectedNode.value.path);
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
  fileTree.value = [...fileTree.value];

  cancelEdit();
  ElMessage.success("重命名成功");
}

// 顶部按钮：添加文件/目录（默认在根目录创建）
function handleAddFile() {
  // 选中根目录（若存在）
  if (fileTree.value.length > 0) {
    selectedNode.value = fileTree.value[0];
  } else {
    // 无根目录时创建根目录
    const rootDir = {
      name: "/",
      path: "/",
      type: FileNodeType.DIRECTORY,
      children: [],
    };
    fileTree.value.push(rootDir);
    selectedNode.value = rootDir;
  }
  handleNewFile();
}

function handleAddDir() {
  if (fileTree.value.length > 0) {
    selectedNode.value = fileTree.value[0];
  } else {
    const rootDir = {
      name: "/",
      path: "/",
      type: FileNodeType.DIRECTORY,
      children: [],
    };
    fileTree.value.push(rootDir);
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
  /* height: calc(100vh - 156px);
    max-height: calc(100vh - 156px); */
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
