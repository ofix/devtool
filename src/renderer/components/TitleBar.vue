<template>
  <MacTitleBar
    :wndTitle="title"
    :initial-maximized="false"
    @close="handleWindowClose"
    @minimize="handleWindowMinimize"
    @maximize="handleWindowMaximize"
    @restore="handleWindowRestore"
    v-if="platform == 'mac'"
  />
  <VSCodeTitleBar
    v-else
    :wndName="wndKey"
    :wndTitle="title"
    @close="handleWindowClose"
    @minimize="handleWindowMinimize"
    @maximize="handleWindowMaximize"
    @restore="handleWindowRestore"
  />
</template>

<script setup>
import { ref, onMounted, defineProps } from "vue";
import MacTitleBar from "./MacTitleBar.vue";
import VSCodeTitleBar from "./VSCodeTitleBar.vue";

const props = defineProps({
  wndKey: {
    type: String,
    required: false,
    default: "",
  },
  title: {
    type: String,
    required: false,
    default: "",
  },
});

let platform = ref(null);

onMounted(async () => {
  let osInfo = await window.channel.getPlatformInfo();
  if (osInfo.platform == "darwin") {
    platform.value = "mac";
  } else if (osInfo.platform == "win32") {
    platform.value = "windows";
  } else {
    platform.value = "linux";
  }
});

// 窗口控制事件处理（Electron 环境下可调用主进程 API）
const handleWindowClose = () => {
  window.channel.closeWindow(props.wndKey);
};

const handleWindowMinimize = () => {
  window.channel.minimizeWindow(props.wndKey);
};

const handleWindowMaximize = () => {
  window.channel.maximizeWindow(props.wndKey);
};

const handleWindowRestore = () => {
  console.log(`还原窗口 ${props.wndKey}`);
  window.channel.restoreWindow(props.wndKey);
};
</script>
