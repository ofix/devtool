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
      :data="vsCodeLikeFileTreeData"
      :props="treeProps"
      :expand-on-click-node="true"
      :highlight-current="true"
      :default-expanded-keys="[]"
      :height="treeHeight"
      node-key="path"
      @node-click="handleNodeClick"
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
          <div v-if="data.type === FileNodeType.MULTI" class="multi-dir-node">
            <!-- 折叠路径：用 › 分隔 -->
            <span class="multi-path">
              <span
                v-for="(pathSegment, index) in data.multiPath"
                :key="`${data.path}-segment-${index}`"
                class="path-segment"
                :class="{
                  'current-segment': index === data.multiPath.length - 1,
                }"
                @click="onClickMultiPath(data, pathSegment, index)"
                @contextmenu="(e) => onContextMenuMultiPath(e, data)"
              >
                <!-- 路径分隔符 -->
                <span class="path-separator" :key="`sep-${data.path}-${index}`">
                  /
                </span>
                <span> {{ pathSegment }}</span>
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
              (!editingNodeId || editingNodeId !== data.path) &&
              data.type !== FileNodeType.MULTI
            "
            class="node-name"
            :style="{
              marginLeft:
                data.type == FileNodeType.FILE ||
                data.type == FileNodeType.SYMLINK
                  ? '-4px'
                  : '0',
            }"
          >
            {{ data.name }}
          </span>
          <el-input
            v-if="
              (editingNodeId || editingNodeId == data.path) &&
              data.type !== FileNodeType.MULTI
            "
            v-model="editName"
            class="edit-input"
            size="mini"
            :style="{
              marginLeft:
                data.type == FileNodeType.FILE ||
                data.type == FileNodeType.SYMLINK
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
import { ref, defineProps, readonly, computed, reactive, nextTick } from "vue";
import { DocumentAdd, FolderAdd, Fold } from "@element-plus/icons-vue";
import { ElMessage, ElNotification } from "element-plus";
import FileTreeContextMenu from "./FileTreeContextMenu.vue";
import { FileNodeType } from "@/components/FileNodeType.js";
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

// --------------------- 树组件核心状态 ---------------------
const fileTreeRef = ref(null);
const props = defineProps({
  fileTreeData: {
    type: Array,
    default: () => [],
    required: true,
  },
});
const treeProps = readonly({
  value: "path",
  label: "name",
  children: "children",
});
const treeHeight = ref(window.innerHeight - 34);

// 递归扁平化单子目录节点，生成折叠节点
const flatFileTree = (node, parentPath = [], isRoot = true) => {
  if (typeof node === "string") {
    return node;
  }

  const newNode = { ...node };
  let currentPath = [...parentPath, newNode.name];

  // 根路径处理优化
  if (newNode.name === "/") {
    currentPath = [...parentPath];
  }

  if (newNode.type === FileNodeType.DIRECTORY) {
    const children = newNode.children || []; // 兜底空数组

    // 空目录（children = [""]）：直接保留占位，终止后续逻辑
    if (children.length === 1 && children[0] === "") {
      newNode.children = children;
      return newNode;
    }

    // 2. 单子目录节点（需要折叠）
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

  if (
    newNode.type === FileNodeType.FILE ||
    newNode.type === FileNodeType.SYMLINK
  ) {
    return newNode;
  }

  return newNode;
};

// 预处理数据：折叠单目录 + 适配 el-tree-v2 规则
const vsCodeLikeFileTreeData = computed(() => {
  // 根节点处理
  return props.fileTreeData.map((rootNode) => {
    const flatTree = flatFileTree(rootNode, [], true);
    // console.log(JSON.stringify(flatTree, "", 3));
    return flatTree;
  });
});

// 右键菜单核心状态（仅保留数据，逻辑移到组件）
const showContextMenu = ref(false);
const menuX = ref(0);
const menuY = ref(0);
const selectedNode = ref(null); // 右键选中的节点
const editingNodeId = ref("");
const editName = ref("");

const firstOpeneds = computed(() => {
  return props.fileTreeData.map((node) => node.path);
});
const firstActive = computed(() => {
  return props.fileTreeData[0]?.path ?? "";
});

function onClickMultiPath(data, pathSegment, index) {
  console.log(data, pathSegment, index);
}

function onContextMenuMultiPath(e, data) {
  console.log(e, data);
}

// 打开右键菜单
function handleRightClick(event, data, node) {
  event.preventDefault(); // 阻止浏览器默认右键菜单
  event.stopPropagation(); // 阻止事件冒泡

  // 记录选中节点和菜单位置（传递给子组件）
  selectedNode.value = data;
  menuX.value = event.clientX;
  menuY.value = event.clientY;
  showContextMenu.value = true;

  // 监听 ESC 键关闭菜单
  document.addEventListener("click", closeOnClickOutside);
  document.addEventListener("keydown", closeOnEsc);
}

function closeOnEsc(e) {
  if (e.key === "Escape") {
    closeMenu();
    document.removeEventListener("keydown", closeOnEsc);
  }
}

// 点击页面任意位置关闭菜单
function closeOnClickOutside(e) {
  const menu = document.querySelector(".vscode-context-menu");
  if (menu && !menu.contains(e.target)) {
    closeMenu();
    document.removeEventListener("click", closeOnClickOutside);
  }
}

// 关闭右键菜单（仅修改状态）
function closeMenu() {
  showContextMenu.value = false;
  // 移除事件监听（优化后逻辑）
  document.removeEventListener("click", closeOnClickOutside);
  document.removeEventListener("keydown", closeOnEsc);
}

// 新建文件夹
function handleNewFolder() {
  if (!selectedNode.value || selectedNode.value.type !== "folder") {
    ElMessage.warning("只能在文件夹下新建文件夹");
    closeMenu();
    return;
  }
  const newId = Date.now() + "" + Math.floor(Math.random() * 1000);
  const newFolder = {
    id: newId,
    name: "新建文件夹",
    type: "folder",
    children: [],
  };
  if (!selectedNode.value.children) selectedNode.value.children = [];
  selectedNode.value.children.push(newFolder);
  // 修复：更新 props 数据时，需通过拷贝触发响应式（props 本身不可直接修改，建议通过 emit 通知父组件）
  const newFileTree = [...props.fileTreeData];
  // 触发父组件更新（推荐方式：定义 emit）
  emit("update:fileTreeData", newFileTree);
  // 临时兼容：直接赋值（不推荐，仅用于修复报错）
  // Object.assign(props, { fileTreeData: newFileTree });
  fileTreeRef.value.setExpanded(selectedNode.value, true);
  enterEditMode(newId, "新建文件夹");
  closeMenu();
}

// 新建文件
function handleNewFile() {
  if (!selectedNode.value || selectedNode.value.type !== "folder") {
    ElMessage.warning("只能在文件夹下新建文件");
    closeMenu();
    return;
  }
  const newId = Date.now() + "" + Math.floor(Math.random() * 1000);
  const newFile = { id: newId, name: "新建文件.txt", type: "file", ext: "txt" };
  if (!selectedNode.value.children) selectedNode.value.children = [];
  selectedNode.value.children.push(newFile);
  const newFileTree = [...props.fileTreeData];
  emit("update:fileTreeData", newFileTree);
  fileTreeRef.value.setExpanded(selectedNode.value, true);
  enterEditMode(newId, "新建文件.txt");
  closeMenu();
}

// 重命名
function handleRename() {
  if (!selectedNode.value) return;
  enterEditMode(selectedNode.value.id, selectedNode.value.name);
  closeMenu();
}

// 复制路径
function handleCopyPath() {
  if (!selectedNode.value) return;
  const fullPath = getNodeFullPath(selectedNode.value);
  navigator.clipboard.writeText(fullPath).then(() => {
    ElNotification.success({
      title: "成功",
      message: `路径已复制：${fullPath}`,
      duration: 1500,
      position: "bottom-right",
    });
  });
  closeMenu();
}

// 删除
function handleDelete() {
  if (!selectedNode.value) return;
  const deleteNode = (tree, nodeId) => {
    for (let i = 0; i < tree.length; i++) {
      if (tree[i].id === nodeId) {
        tree.splice(i, 1);
        return true;
      }
      if (tree[i].children && tree[i].children.length > 0) {
        const deleted = deleteNode(tree[i].children, nodeId);
        if (deleted) return true;
      }
    }
    return false;
  };
  // 访问 props.fileTreeData，无 .value
  const deleted = deleteNode(props.fileTreeData, selectedNode.value.id);
  if (deleted) {
    ElMessage.success("删除成功");
    // props 不可直接修改，推荐 emit
    const newFileTree = [...props.fileTreeData];
    emit("update:fileTreeData", newFileTree);
    selectedNode.value = null;
  }
  closeMenu();
}

// 辅助函数
function enterEditMode(nodeId, defaultName) {
  editingNodeId.value = nodeId;
  editName.value = defaultName;
  nextTick(() => {
    const input = document.querySelector(".edit-input");
    if (input) input.focus();
  });
}
function cancelEdit() {
  editingNodeId.value = "";
  editName.value = "";
}
function handleEditBlur(data) {
  if (!editName.value.trim()) {
    ElMessage.warning("名称不能为空");
    enterEditMode(data.id, data.name);
    return;
  }
  data.name = editName.value.trim();
  if (data.type === "file" && !data.name.includes(".")) {
    data.name += ".txt";
    data.ext = "txt";
  }
  const newFileTree = [...props.fileTreeData];
  emit("update:fileTreeData", newFileTree);
  cancelEdit();
}
function getNodeFullPath(data) {
  let path = data.name;
  let parent = findParentNode(props.fileTreeData, data.path);
  while (parent) {
    path = parent.name + "/" + path;
    parent = findParentNode(props.fileTreeData, parent.path);
  }
  return `/${path}`;
}
function findParentNode(tree, path) {
  for (const node of tree) {
    if (node.children && node.children.some((child) => child.path === path)) {
      return node;
    }
    if (node.children) {
      const parent = findParentNode(node.children, path);
      if (parent) return parent;
    }
  }
  return null;
}
function handleNodeClick(data, node) {
  selectedNode.value = data;
}

function onNodeExpand(data, node) {
  const stored = localStorage.getItem("sftp_server");
  if (stored) {
    try {
      let server = JSON.parse(stored);
      server.remotePath = data.path;
      window.channel.send("sftp-list-dir", server);
    } catch (e) {
      console.error("加载服务器失败", e);
    }
  }
}

// 定义 emit 用于通知父组件更新数据（Vue 单向数据流规范）
const emit = defineEmits(["update:fileTreeData", "node-click"]);
</script>

<style scoped>
/* 原树组件样式保持不变 */
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
  --el-tree-node-current-color: #37373d; /*var(--el-color-primary);*/
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
.multi-dir-node {
  display: flex;
  align-items: center;
  gap: 6px;
}

.multi-path {
  font-size: 12px;
  color: var(--dt-primary-text-color);
  cursor: pointer;
}

.multi-path span {
  color: var(--dt-primary-text-color); /* 分隔符颜色 */
  margin: 0 2px;
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

::v-deep
  .el-tree--highlight-current
  .el-tree-node.is-current
  > .el-tree-node__content {
  background-color: var(--dt-primary-bg-color) !important;
}

::v-deep
  .el-tree--highlight-current:hover
  .el-tree-node.is-current
  > .el-tree-node__content {
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

.node-name:hover {
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
