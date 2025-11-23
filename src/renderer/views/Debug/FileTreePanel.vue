<template>
  <div class="file-tree-container">
    <!-- 树组件不变，保持原逻辑 -->
    <el-tree
      ref="fileTreeRef"
      :data="fileTreeData"
      :props="treeProps"
      :expand-on-click-node="false"
      :highlight-current="true"
      :default-expand-all="false"
      :default-active="firstActive"
      :default-openeds="firstOpeneds"
      @node-click="handleNodeClick"
      @node-contextmenu="handleRightClick"
      class="custom-file-tree"
    >
      <!-- 自定义节点内容（仅文件显示图标 + 名称） -->
      <template #default="{ node, data }">
        <div class="tree-node-content">
          <el-icon v-if="data.type === 'file'" class="node-icon">
            <IconFileHtml v-if="data.ext === 'html'" />
            <IconFileJson v-else-if="data.ext === 'json'" />
            <IconFileJs v-else-if="data.ext === 'js' || data.ext === 'ts'" />
            <IconFileVue v-else-if="data.ext === 'vue'" />
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
    </el-tree>

    <!-- VS Code 风格原生右键菜单 -->
    <div
      v-if="showContextMenu"
      class="vscode-context-menu"
      :style="{ left: `${menuX}px`, top: `${menuY}px` }"
      @click.stop
      @mouseleave="closeMenu"
      tabindex="0"
      @keydown.esc="closeMenu"
    >
      <!-- 第一组：新建相关（仅文件夹显示） -->
      <template v-if="selectedNode?.type === 'folder'">
        <div class="menu-item" @click="handleNewFolder">
          <span class="menu-label">新建文件夹</span>
          <span class="menu-shortcut">Ctrl+Shift+N</span>
        </div>
        <div class="menu-item" @click="handleNewFile">
          <span class="menu-label">新建文件</span>
          <span class="menu-shortcut">Ctrl+N</span>
        </div>
        <div class="menu-separator"></div>
      </template>

      <!-- 第二组：编辑相关（所有节点显示） -->
      <div class="menu-item" @click="handleRename">
        <span class="menu-label">重命名</span>
        <span class="menu-shortcut">F2</span>
      </div>
      <div class="menu-item" @click="handleCopyPath">
        <span class="menu-label">复制路径</span>
        <span class="menu-shortcut">Ctrl+Shift+C</span>
      </div>
      <div class="menu-separator"></div>

      <!-- 第三组：删除相关（所有节点显示） -->
      <div class="menu-item menu-danger" @click="handleDelete">
        <span class="menu-label">删除</span>
        <span class="menu-shortcut">Delete</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, nextTick } from "vue";
import IconFileHtml from "@/components/icons/IconFileHtml.vue";
import IconFileCss from "@/components/icons/IconFileCss.vue";
import IconFileJson from "@/components/icons/IconFileJson.vue";
import IconFileJs from "@/components/icons/IconFileJs.vue";
import IconFileVue from "@/components/icons/IconFileVue.vue";
import IconImage from "@/components/icons/IconImage.vue";
import IconFile from "@/components/icons/IconFile.vue";

// 树组件核心状态
const fileTreeRef = ref(null);
const fileTreeData = ref([
  // 你的文件树数据（保持不变）
  {
    id: "1",
    name: "components",
    type: "folder",
    children: [
      { id: "2", name: "Debug.vue", type: "file", ext: "vue" },
      { id: "3", name: "FileCompare.vue", type: "file", ext: "vue" },
    ],
  },
  {
    id: "4",
    name: "renderer",
    type: "folder",
    children: [
      { id: "5", name: "Debug.html", type: "file", ext: "html" },
      { id: "6", name: "FileCompare.css", type: "file", ext: "css" },
    ],
  },
  { id: "7", name: "package.json", type: "file", ext: "json" },
]);
const treeProps = reactive({
  label: "name",
  children: "children",
  isLeaf: (data) => data.type === "file",
});

// 右键菜单核心状态
const showContextMenu = ref(false);
const menuX = ref(0);
const menuY = ref(0);
const selectedNode = ref(null); // 右键选中的节点
const editingNodeId = ref("");
const editName = ref("");
// 默认展开第一个有子项的目录
const firstOpeneds = computed(() => {
  const first = fileTreeData.value.find((i) => i.children?.length);
  return first ? [first.index] : [];
});

// 默认选中第一个菜单项
const firstActive = computed(() => {
  return fileTreeData.value[0]?.index ?? "";
});

// 🔥 打开右键菜单（核心逻辑）
const handleRightClick = (event, data, node) => {
  event.preventDefault(); // 阻止浏览器默认右键菜单
  event.stopPropagation(); // 阻止事件冒泡

  // 记录选中节点和菜单位置
  selectedNode.value = data;
  menuX.value = event.clientX;
  menuY.value = event.clientY;

  // 显示菜单
  showContextMenu.value = true;

  // 点击页面任意位置关闭菜单（关键：模仿 VS Code 体验）
  const closeOnClickOutside = (e) => {
    const menu = document.querySelector(".vscode-context-menu");
    if (menu && !menu.contains(e.target)) {
      closeMenu();
      document.removeEventListener("click", closeOnClickOutside);
    }
  };
  document.addEventListener("click", closeOnClickOutside);

  // 监听 ESC 键关闭菜单
  const closeOnEsc = (e) => {
    if (e.key === "Escape") {
      closeMenu();
      document.removeEventListener("keydown", closeOnEsc);
    }
  };
  document.addEventListener("keydown", closeOnEsc);
};

// 🔥 关闭右键菜单
const closeMenu = () => {
  showContextMenu.value = false;
  // 移除所有事件监听（避免内存泄漏）
  document.removeEventListener("click", closeOnClickOutside);
  document.removeEventListener("keydown", closeOnEsc);
};

// 🔥 菜单功能实现（贴合 VS Code 逻辑）
// 新建文件夹
const handleNewFolder = () => {
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
};

// 新建文件
const handleNewFile = () => {
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
};

// 重命名（支持 F2 快捷键）
const handleRename = () => {
  if (!selectedNode.value) return;
  enterEditMode(selectedNode.value.id, selectedNode.value.name);
  closeMenu();
};

// 复制路径（VS Code 核心功能）
const handleCopyPath = () => {
  if (!selectedNode.value) return;
  // 获取节点完整路径（模仿 VS Code 绝对路径风格）
  const fullPath = getNodeFullPath(selectedNode.value);
  // 复制到剪贴板
  navigator.clipboard.writeText(fullPath).then(() => {
    ElNotification.success({
      title: "成功",
      message: `路径已复制：${fullPath}`,
      duration: 1500,
      position: "bottom-right",
    });
  });
  closeMenu();
};

// 删除
const handleDelete = () => {
  if (!selectedNode.value) return;
  // 递归删除节点
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
};

// 辅助函数：进入编辑模式
const enterEditMode = (nodeId, defaultName) => {
  editingNodeId.value = nodeId;
  editName.value = defaultName;
  nextTick(() => {
    const input = document.querySelector(".edit-input");
    if (input) input.focus();
  });
};

// 辅助函数：取消编辑
const cancelEdit = () => {
  editingNodeId.value = "";
  editName.value = "";
};

// 辅助函数：编辑完成
const handleEditBlur = (data) => {
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
};

// 辅助函数：获取节点完整路径（模仿 VS Code）
const getNodeFullPath = (data) => {
  let path = data.name;
  let parent = findParentNode(fileTreeData.value, data.id);
  while (parent) {
    path = parent.name + "/" + path;
    parent = findParentNode(fileTreeData.value, parent.id);
  }
  return `/${path}`; // 格式：/src/views/Debug.vue
};

// 辅助函数：查找父节点
const findParentNode = (tree, nodeId) => {
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
};

// 节点点击事件
const handleNodeClick = (data, node) => {
  selectedNode.value = data;
};
</script>

<style scoped>
/* 原树组件样式保持不变... */
.file-tree-container {
  width: 100%;
  height: 100%;
  background-color: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-light);
  overflow-y: auto;
}

.custom-file-tree {
  --el-tree-node-hover-bg-color: rgba(220, 220, 220, 0.1);
  --el-tree-node-current-bg-color: rgba(64, 158, 255, 0.1);
  --el-tree-node-current-color: var(--el-color-primary);
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

.node-name {
  cursor: pointer;
  flex: 1;
  padding: 2px 4px;
  border-radius: 2px;
}

.node-name:hover {
  background-color: var(--el-tree-node-hover-bg-color);
}

.edit-input {
  width: 140px !important;
  padding: 2px 4px !important;
  margin: 0 !important;
}

/* VS Code 风格右键菜单核心样式 */
.vscode-context-menu {
  position: fixed;
  width: 220px; /* VS Code 菜单宽度 */
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color-dark);
  border-radius: 4px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2); /* 深沉阴影，贴近 VS Code */
  z-index: 99999; /* 确保在所有组件之上 */
  padding: 4px 0;
  outline: none;
  font-size: 13px; /* VS Code 字体大小 */
}

/* 菜单项样式 */
.menu-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 12px;
  cursor: pointer;
  color: var(--el-text-color-primary);
  transition: background-color 0.1s ease;
}

/* hover 高亮（VS Code 浅蓝背景） */
.menu-item:hover:not(.menu-danger) {
  background-color: rgba(66, 133, 244, 0.15);
  color: var(--el-color-primary);
}

/* 危险操作样式（删除） */
.menu-danger {
  color: #ff4d4f;
}
.menu-danger:hover {
  background-color: rgba(255, 77, 79, 0.1) !important;
}

/* 菜单分隔线 */
.menu-separator {
  height: 1px;
  background-color: var(--el-border-color-dark);
  margin: 4px 0;
}

/* 快捷键提示样式（右对齐、灰色） */
.menu-shortcut {
  color: var(--el-text-color-placeholder);
  font-size: 11px;
}

/* 深色模式适配（如果项目支持） */
:root.dark .vscode-context-menu {
  background-color: #1e1e1e;
  border-color: #3c3c3c;
}
:root.dark .menu-item:hover:not(.menu-danger) {
  background-color: #094771;
  color: #e3f2fd;
}
:root.dark .menu-separator {
  background-color: #3c3c3c;
}
</style>
