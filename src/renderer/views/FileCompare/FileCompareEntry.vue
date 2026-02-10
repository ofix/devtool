<template>
    <div style="width: 100%; height: 100%;">
      <VsCodeTab
        :tabs="tabs"
        :activeKey="activeKey"
        @tab-change="handleTabChange"
        @tab-close="handleTabClose"
      >
        <!-- 自定义标签内容示例（可选） -->
        <template #tab-file1="{ tab }">
          <div style="display: flex; align-items: center;">
            <i class="el-icon-file-text" style="margin-right: 4px;"></i>
            {{ truncateTitle(tab.title) }}
          </div>
        </template>
  
        <!-- 标签内容面板 -->
        <template #panel="{ activeKey }">
          <div>
            <h3>当前激活标签：{{ activeKey }}</h3>
            <p>
              {{ getPanelContent(activeKey) }}
            </p>
          </div>
        </template>
      </VsCodeTab>
    </div>
  </template>
  
  <script setup>
  import { ref } from 'vue';
  import VsCodeTab from '@/components/VsCodeTab.vue';
  
  // 模拟大量标签数据
  const tabs = ref([
    { key: 'file1', title: 'main.js - 这是一个超长的文件名测试超过32个字符的情况1234567890' },
    { key: 'file2', title: 'App.vue' },
    { key: 'file3', title: 'utils.ts' },
    { key: 'file4', title: 'router/index.js' },
    { key: 'file5', title: 'store/modules/user.js' },
    { key: 'file6', title: 'components/Table.vue' },
    { key: 'file7', title: 'views/Home.vue' },
    { key: 'file8', title: 'views/Detail.vue' },
    { key: 'file9', title: 'assets/css/global.css' },
    { key: 'file10', title: 'assets/js/axios.js' },
    { key: 'file11', title: 'package.json' },
    { key: 'file12', title: 'tsconfig.json' },
    { key: 'file13', title: 'vite.config.js' },
    { key: 'file14', title: '.eslintrc.js' },
    { key: 'file15', title: '.prettierrc' }
  ]);
  
  // 激活的标签
  const activeKey = ref('file1');
  
  // 截断标题方法（和组件内一致）
  const truncateTitle = (title) => {
    const maxChar = 32;
    if (title.length <= maxChar) return title;
    return title.substring(0, maxChar) + '...';
  };
  
  // 切换标签
  const handleTabChange = (key) => {
    activeKey.value = key;
  };
  
  // 关闭标签
  const handleTabClose = (key) => {
    tabs.value = tabs.value.filter(tab => tab.key !== key);
    // 如果关闭的是激活标签，切换到第一个标签
    if (activeKey.value === key && tabs.value.length > 0) {
      activeKey.value = tabs.value[0].key;
    }
  };
  
  // 获取面板内容
  const getPanelContent = (key) => {
    const tab = tabs.value.find(t => t.key === key);
    return tab ? `这是【${tab.title}】的内容区域` : '暂无内容';
  };
  </script>