<template>
  <div style="width: 100%; height: 100%">
    <VsCodeTab
      :tabs="tabs"
      :activeKey="activeKey"
      @tab-change="handleTabChange"
      @tab-close="handleTabClose"
    >
      <!-- 自定义标签内容：通用模板 -->
      <template #tab-default="{ tab }">
        <div style="display: flex; align-items: center">
          <!-- 组件图标可由外部传入，或默认区分类型 -->
          <i
            :class="
              tab.icon ||
              (tab.component.name === 'FileCompare'
                ? 'el-icon-file-text'
                : 'el-icon-folder-opened')
            "
            style="margin-right: 4px"
          ></i>
          {{ truncateTitle(tab.title) }}
        </div>
      </template>

      <!-- 动态渲染传入的组件：修复核心错误 -->
      <template #panel="{ activeKey }">
        <div style="width: 100%; height: 100%; padding: 8px">
          <!-- 修复：用计算属性/方法获取当前tab，移除错误的<const>标签 -->
          <!-- 无标签时的兜底 -->
          <div
            v-if="!getCurrentTab(activeKey)"
            style="
              height: 100%;
              display: flex;
              align-items: center;
              justify-content: center;
            "
          >
            暂无内容
          </div>

          <!-- 直接渲染传入的组件实例：完全不关心组件内部逻辑 -->
          <component
            v-else
            :is="getCurrentTab(activeKey).component"
            style="width: 100%; height: 100%"
            :key="getCurrentTab(activeKey).key"
          />
        </div>
      </template>
    </VsCodeTab>
  </div>
</template>

<script setup>
import { ref } from "vue";
import VsCodeTab from "@/components/VsCodeTab.vue";
// 引入你的业务组件（路径请自行调整）
import FileCompare from "@/components/FileCompare.vue";
import FolderCompare from "@/components/FolderCompare.vue";

// ========== 核心：Tab 数据结构（只存储组件实例，不关心业务数据） ==========
const tabs = ref([
  {
    key: "tab1", // 唯一标识
    title: "文件比对 - main.js vs app.js", // 标签标题
    icon: "el-icon-file-text", // 可选：自定义图标
    // 直接传入绑定好参数的组件实例（业务数据在这里绑定，Tab容器完全不感知）
    component: FileCompare,
  },
  {
    key: "tab2",
    title: "文件夹比对 - src vs src-backup",
    icon: "el-icon-folder-opened",
    // 传入文件夹比对组件（绑定好自己的业务参数）
    component: FolderCompare,
  },
]);

// 当前激活的标签
const activeKey = ref("tab1");

// 修复：定义获取当前tab的方法（替代模板中错误的<const>标签）
const getCurrentTab = (key) => {
  return tabs.value.find((tab) => tab.key === key);
};

// 标题截断（通用功能）
const truncateTitle = (title) => {
  const maxLength = 32;
  return title.length > maxLength
    ? `${title.substring(0, maxLength)}...`
    : title;
};

// 切换标签（通用逻辑）
const handleTabChange = (key) => {
  activeKey.value = key;
};

// 关闭标签（通用逻辑）
const handleTabClose = (key) => {
  tabs.value = tabs.value.filter((tab) => tab.key !== key);
  // 切换到第一个标签（如果还有的话）
  if (activeKey.value === key) {
    activeKey.value = tabs.value.length > 0 ? tabs.value[0].key : "";
  }
};

// ========== 扩展：动态添加标签的方法（外部调用） ==========
/**
 * 动态添加比对标签
 * @param {Object} tabConfig - 标签配置
 * @param {string} tabConfig.key - 唯一key
 * @param {string} tabConfig.title - 标签标题
 * @param {Object} tabConfig.component - 组件实例（带props）
 * @param {string} [tabConfig.icon] - 图标类名
 */
const addCompareTab = (tabConfig) => {
  // 先移除同key的标签（避免重复）
  tabs.value = tabs.value.filter((tab) => tab.key !== tabConfig.key);
  // 添加新标签
  tabs.value.push(tabConfig);
  // 激活新标签
  activeKey.value = tabConfig.key;
};
</script>
