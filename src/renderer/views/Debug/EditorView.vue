<!-- src/renderer/views/EditorView.vue -->
<template>
    <div class="editor-container" style="width:100vw;height:100vh;display:flex;flex-direction:column;">
      <!-- 标签页 + 编辑器 -->
      <el-main style="padding: 0; flex: 1;">
        <TabBar 
          :file-list="openFileList"
          :active-file-path="activeFilePath"
          @tab-change="setActiveFile"
          @tab-remove="removeFile"
          @content-change="updateFileContent"
        />
      </el-main>
    </div>
  </template>
  
  <script setup>
  import { ref } from 'vue';
  import TabBar from '@/components/TabBar.vue';
  import { ElMessage } from 'element-plus';
  
  // 状态管理：已打开的文件列表、激活的文件
  const openFileList = ref([]);
  const activeFilePath = ref('');
  
  // 获取激活的文件
  const activeFile = ref(null);
  const setActiveFile = (filePath) => {
    activeFilePath.value = filePath;
    activeFile.value = openFileList.value.find(file => file.path === filePath);
  };
  
  // 打开文件（调用 Electron IPC）
  const handleOpenFile = async () => {
    const files = await window.electronAPI.openFile();
    if (!files) return;
    
    // 合并已打开的文件（避免重复）
    files.forEach(newFile => {
      const exists = openFileList.value.some(file => file.path === newFile.path);
      if (!exists) {
        openFileList.value.push(newFile);
      }
    });
    
    // 激活第一个新打开的文件
    if (files.length) {
      setActiveFile(files[0].path);
    }
  };
  
  // 保存文件
  const handleSaveFile = async () => {
    if (!activeFile.value) return;
    
    const res = await window.electronAPI.saveFile({
      path: activeFile.value.path,
      content: activeFile.value.content
    });
    
    if (res.success) {
      ElMessage.success('文件保存成功');
    } else {
      ElMessage.error(`保存失败：${res.error}`);
    }
  };
  
  // 移除文件
  const removeFile = (filePath) => {
    openFileList.value = openFileList.value.filter(file => file.path !== filePath);
    // 若移除的是激活文件，切换到第一个文件
    if (activeFilePath.value === filePath) {
      activeFilePath.value = openFileList.value[0]?.path || '';
      activeFile.value = openFileList.value[0] || null;
    }
  };
  
  // 更新文件内容
  const updateFileContent = ({ filePath, content }) => {
    const file = openFileList.value.find(file => file.path === filePath);
    if (file) {
      file.content = content;
      // 更新激活文件的内容
      if (activeFile.value?.path === filePath) {
        activeFile.value.content = content;
      }
    }
  };
  </script>