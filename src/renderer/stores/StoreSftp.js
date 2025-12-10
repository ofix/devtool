// stores/sftpStore.js
import { defineStore } from 'pinia';
import { ref, reactive } from 'vue';
import { ElMessage } from 'element-plus';

export const useSftpStore = defineStore('sftp', () => {
  // 渲染进程本地的 SSH 状态（与主进程同步）
  const sshState = reactive({
    status: 'disconnected',
    error: null,
    config: null
  });
  const loading = ref(false);

  // 初始化：从主进程同步最新状态
  // const initSshState = async () => {
  //   try {
  //     const state = await window.channel.getState();
  //     Object.assign(sshState, state);
  //   } catch (err) {
  //     ElMessage.error(`同步 SSH 状态失败：${err}`);
  //   }
  // };

  const listenSshState = () => {
    offStateChange = window.channel.onStateChange((state) => {
      Object.assign(sshState, state);
    });
  };

  // 连接SSH服务器
  const connectSftpServer = async (config) => {
    loading.value = true;
    try {
      const res = await window.channel.sshConnect(config);
      if (!res.success) throw new Error(res.error);
      ElMessage.success(`已连接服务器：${config.host}`);
      return true;
    } catch (err) {
      ElMessage.error(`连接失败：${err.message}`);
      return false;
    } finally {
      loading.value = false;
    }
  };

  // 断开SSH服务器
  const disconnectSftpServer = async () => {
    loading.value = true;
    try {
      const res = await window.channel.sshDisconnect();
      if (!res.success) throw new Error(res.error);
      ElMessage.info('已断开服务器连接');
      return true;
    } catch (err) {
      ElMessage.error(`断开失败：${err.message}`);
      return false;
    } finally {
      loading.value = false;
    }
  };

  // 加载目录
  const listDir = async (host, path) => {
    loading.value = true;
    try {
      const res = await window.channel.listDir(host, path);
      if (!res.success) throw new Error(res.error);
      return res.data;
    } catch (err) {
      ElMessage.error(`加载目录失败：${err.message}`);
      return [];
    } finally {
      loading.value = false;
    }
  };

  // 组件卸载时取消监听
  const unlisten = () => {
    if (offStateChange) offStateChange();
  };

  return {
    sshState,
    loading,
    listenSshState,
    connectSftpServer,
    disconnectSftpServer,
    listDir,
    unlisten
  };
});