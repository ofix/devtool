import { ref } from 'vue';
import { defineStore } from 'pinia';

export const useServerListStore = defineStore('sshServerList', () => {
    // 修正响应式类型
    const serverList = ref([]);
    const currentServer = ref(null);

    // 加载服务器列表
    function loadServerList() {
        try {
            const stored = localStorage.getItem("sftp_server_list");
            if (stored) {
                const servers = JSON.parse(stored);
                // 保留原有 connected 状态，无则默认 false
                serverList.value = servers.map(server => ({
                    ...server,
                    connected: false
                }));
            }
        } catch (e) {
            console.error("加载服务器列表失败", e);
            serverList.value = [];
        }
    }

    // 初始化加载
    loadServerList();

    // 连接服务器
    async function connectServer(server) {
        try {
            let params = {
                host: server.host,
                port: server.port,
                username: server.username,
                password: server.password,
                remotePath: server.remotePath
            }
            await window.channel.sshConnect(params);
            const target = serverList.value.find(item => item.host === server.host);
            if (target) target.connected = true;
            currentServer.value = server;
        } catch (e) {
            console.error("连接服务器失败", e);
            throw e;
        }
    }

    // 断开服务器
    async function disconnectServer(server) {
        try {
            await window.channel.sshDisconnect(server);
            const target = serverList.value.find(item => item.host === server.host);
            if (target) target.connected = false;
            if (currentServer.value?.host === server.host) {
                currentServer.value = null;
            }
        } catch (e) {
            console.error("断开服务器失败", e);
            throw e;
        }
    }

    // 保存列表
    function saveServerList() {
        try {
            localStorage.setItem("sftp_server_list", JSON.stringify(serverList.value));
        } catch (e) {
            console.error("保存服务器列表失败", e);
        }
    }

    // 添加服务器
    function addServer(server) {
        if (!server.host) return console.error("服务器 host 不能为空");
        const isExist = serverList.value.some(item => item.host === server.host);
        if (!isExist) {
            serverList.value.push({ ...server, connected: false });
            saveServerList();
        }
    }

    // 更新服务器
    function updateServer(server) {
        if (!server.host) return console.error("服务器 host 不能为空");
        const index = serverList.value.findIndex(item => item.host === server.host);
        if (index === -1) return console.warn(`未找到服务器 ${server.host}`);
        serverList.value[index] = { ...server, connected: serverList.value[index].connected };
        saveServerList();
    }

    // 删除服务器
    function deleteServer(server) {
        if (!server.host) return console.error("服务器 host 不能为空");
        const index = serverList.value.findIndex(item => item.host === server.host);
        if (index === -1) return console.warn(`未找到服务器 ${server.host}`);
        serverList.value.splice(index, 1);
        saveServerList();
    }

    return {
        serverList,
        currentServer,
        loadServerList,
        saveServerList,
        addServer,
        updateServer,
        deleteServer,
        connectServer,
        disconnectServer
    };
});