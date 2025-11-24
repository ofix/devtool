<template>
  <div class="dt-file-tree-container">
    <!-- 高性能虚拟渲染树组件 -->
    <el-tree-v2
      ref="fileTreeRef"
      :data="fileTreeData"
      :props="treeProps"
      :expand-on-click-node="false"
      :highlight-current="true"
      :default-expand-all="false"
      :default-active="firstActive"
      :default-openeds="firstOpeneds"
      :height="treeHeight"
      @node-click="handleNodeClick"
      @node-contextmenu="handleRightClick"
      class="dt-file-tree"
    >
      <!-- 自定义节点内容（仅文件显示图标 + 名称） -->
      <template #default="{ node, data }">
        <div class="tree-node-content">
          <el-icon v-if="data.type === 'file'" class="node-icon">
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
            <IconFile v-else />
          </el-icon>
          <span
            v-if="!editingNodeId || editingNodeId !== data.id"
            class="node-name"
            :style="{ marginLeft: data.type === 'file' ? '-4px' : '0' }"
          >
            {{ data.name }}
          </span>
          <el-input
            v-else
            v-model="editName"
            class="edit-input"
            size="mini"
            :style="{ marginLeft: data.type === 'file' ? '-4px' : '0' }"
            @blur="handleEditBlur(data)"
            @keyup.enter="handleEditBlur(data)"
            @keyup.esc="cancelEdit()"
          />
        </div>
      </template>
    </el-tree-v2>

    <!-- 引入独立右键菜单组件 -->
    <DebugContextMenu
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
  </div>
</template>

<script setup>
import { ref, computed, reactive, nextTick } from "vue";
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
// 右键菜单
import DebugContextMenu from "./DebugContextMenu.vue";
// 消息通知组件
import { ElMessage, ElNotification } from "element-plus";

// 树组件核心状态
const fileTreeRef = ref(null);
const fileTreeData = ref([
  {
    id: "1",
    name: "components",
    type: "folder",
    children: [
      { id: "2", name: "Debug.vue", type: "file", ext: "vue" },
      { id: "3", name: "FileCompare.html", type: "file", ext: "html" },
    ],
  },
  {
    id: "4",
    name: "renderer",
    type: "folder",
    children: [
      { id: "5", name: "Debug.java", type: "file", ext: "java" },
      { id: "6", name: "FileCompare.c", type: "file", ext: "c" },
      { id: "7", name: "Debug.cpp", type: "file", ext: "cpp" },
      { id: "8", name: "Test.yaml", type: "file", ext: "yaml" },
      { id: "9", name: "main.go", type: "file", ext: "go" },
      { id: "10", name: "ProductService.php", type: "file", ext: "php" },
      { id: "11", name: "search.sql", type: "file", ext: "sql" },
      { id: "12", name: "BigData.scala", type: "file", ext: "scala" },
      { id: "13", name: "ResponseData.json", type: "file", ext: "json" },
      { id: "14", name: "FileCompare.css", type: "file", ext: "css" },
      { id: "15", name: "Debug.h", type: "file", ext: "h" },
      { id: "16", name: "FileCompare.py", type: "file", ext: "py" },
      { id: "17", name: "Debug.sh", type: "file", ext: "sh" },
      // 其他节点...
    ],
  },
  { id: "17", name: "FileCompare.dart", type: "file", ext: "dart" },
  { id: "18", name: "FileCompare.js", type: "file", ext: "js" },
]);
const treeHeight = ref(window.innerHeight - 34);
const treeProps = reactive({
  label: "name",
  children: "children",
  isLeaf: (data) => data.type === "file",
});

// 右键菜单核心状态（仅保留数据，逻辑移到组件）
const showContextMenu = ref(false);
const menuX = ref(0);
const menuY = ref(0);
const selectedNode = ref(null); // 右键选中的节点
const editingNodeId = ref("");
const editName = ref("");

// 默认展开/选中逻辑（保持不变）
const firstOpeneds = computed(() => {
  const first = fileTreeData.value.find((i) => i.children?.length);
  return first ? [first.index] : [];
});
const firstActive = computed(() => {
  return fileTreeData.value[0]?.index ?? "";
});

// 打开右键菜单（核心逻辑：仅设置状态，不渲染菜单）
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

// 点击页面任意位置关闭菜单（优化：修复事件监听移除问题）
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

// 菜单功能实现（原逻辑保留，接收子组件事件回调）
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
  fileTreeData.value = [...fileTreeData.value];
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
  fileTreeData.value = [...fileTreeData.value];
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
  const deleted = deleteNode(fileTreeData.value, selectedNode.value.id);
  if (deleted) {
    ElMessage.success("删除成功");
    fileTreeData.value = [...fileTreeData.value];
    selectedNode.value = null;
  }
  closeMenu();
}

// 辅助函数（保持不变）
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
  fileTreeData.value = [...fileTreeData.value];
  cancelEdit();
}
function getNodeFullPath(data) {
  let path = data.name;
  let parent = findParentNode(fileTreeData.value, data.id);
  while (parent) {
    path = parent.name + "/" + path;
    parent = findParentNode(fileTreeData.value, parent.id);
  }
  return `/${path}`;
}
function findParentNode(tree, nodeId) {
  for (const node of tree) {
    if (node.children && node.children.some((child) => child.id === nodeId)) {
      return node;
    }
    if (node.children) {
      const parent = findParentNode(node.children, nodeId);
      if (parent) return parent;
    }
  }
  return null;
}
function handleNodeClick(data, node) {
  selectedNode.value = data;
}
</script>

<style scoped>
/* 原树组件样式保持不变 */
.dt-file-tree-container {
  width: 100%;
  background-color: transparent;
  border-right: 1px solid var(--el-border-color-light);
  overflow-y: hidden;
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

.node-icon {
  font-size: 16px;
  width: 16px;
  height: 16px;
}

::v-deep
  .el-tree--highlight-current
  .el-tree-node.is-current
  > .el-tree-node__content {
  background-color: #37373d !important;
}

::v-deep
  .el-tree--highlight-current:hover
  .el-tree-node.is-current
  > .el-tree-node__content {
  background-color: #37373d !important;
}

.node-name {
  cursor: pointer;
  flex: 1;
  padding: 2px 4px;
  border-radius: 2px;
  color: #cccccc;
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
</style>
