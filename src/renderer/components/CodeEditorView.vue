<template>
    <el-tabs 
      v-model="activeTabKey" 
      type="card" 
      closable 
      @tab-remove="handleTabRemove"
      @tab-change="handleTabChange"
      style="height: 100%;"
    >
      <el-tab-pane 
        v-for="file in fileList" 
        :key="file.path" 
        :label="file.name"
      >
        <CodeEditor 
          :content="file.content"
          :language="file.language"
          @content-change="(content) => handleContentChange(file.path, content)"
        />
      </el-tab-pane>
    </el-tabs>
  </template>
  
  <script setup>
  import { ref, watch } from 'vue';
  import CodeEditor from './CodeEditor.vue';
  
  const props = defineProps({
    fileList: { type: Array, default: () => [] },
    activeFilePath: { type: String, default: '' }
  });
  
  const emit = defineEmits(['tab-change', 'tab-remove', 'content-change']);
  
  const activeTabKey = ref(props.activeFilePath);
  
  // 切换标签页
  const handleTabChange = (key) => {
    emit('tab-change', key);
  };
  
  // 关闭标签页
  const handleTabRemove = (key) => {
    emit('tab-remove', key);
  };
  
  // 编辑内容变化
  const handleContentChange = (filePath, content) => {
    emit('content-change', { filePath, content });
  };
  
  // 监听外部激活文件变化
  watch(() => props.activeFilePath, (newPath) => {
    activeTabKey.value = newPath;
  });
  </script>