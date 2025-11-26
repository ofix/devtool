import EncryptService from "./EncryptService";

class SSHService {
    constructor() {
        this.encryptService = new EncryptService();
        this.connections = new Map(); // host -> SSHConnection
        this.credentials = new Map(); // host -> {username, password}
        this._loadCredentials(); // 加载本地数据
    }

    _loadCredentials() {
        try {
            const data = localStorage.getItem('ssh_encrypted');
            if (dadta) {
                const credentials = JSON.parse(data);
                for (const [host, encrypted] of Object.entries(credentials)) {
                    const decrypted = this.encryptService.decrypt(encrypted);
                    if (decrypted) {
                        const o = JSON.parse(decrypted);
                        this.credentials.set(host, o);
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to load SSH credentials:', error);
        }
    }

    // 保存凭据到localStorage
    saveCredentials() {
        try {
            const o = {};
            for (const [host, credential] of this.credentials) {
                const encrypted = this.encryptService.encrypt(JSON.stringify(credential));
                o[host] = encrypted;
            }
            localStorage.setItem('ssh_encrypted', JSON.stringify(o));
        } catch (error) {
            console.error('Failed to save SSH credentials:', error);
        }
    }

    // 获取服务器凭据（如果没有则使用默认值）
    getCredentials(host) {
        if (this.credentials.has(host)) {
            return this.credentials.get(host);
        }
        return { username: 'root', password: '0penBmc' };
    }

    // 保存或更新服务器凭据
    saveServerCredentials(host, username, password) {
        this.credentials.set(host, { username, password });
        this.saveCredentials();
    }

    // 连接到服务器
    async connect(host, port = 22, username, password) {
        // 如果未提供凭据，尝试使用保存的凭据
        if (!username || !password) {
            const savedCredentials = this.getCredentials(host);
            username = savedCredentials.username;
            password = savedCredentials.password;
        } else {
            // 保存新凭据
            this.saveServerCredentials(host, username, password);
        }

        // 检查是否已连接
        if (this.connections.has(host) && this.connections.get(host).isConnected) {
            return { success: true, message: 'Already connected' };
        }

        // 创建新连接
        const connection = new SSHConnection(host, port, username, password);
        this.connections.set(host, connection);

        const result = await connection.connect();
        if (!result.success) {
            this.connections.delete(host);
        }

        return result;
    }

    // 断开服务器连接
    async disconnect(host) {
        const connection = this.connections.get(host);
        if (connection) {
            await connection.disconnect();
            this.connections.delete(host);
            return { success: true, message: 'Disconnected' };
        }
        return { success: false, message: 'Connection not found' };
    }

    // 在服务器上执行命令
    async executeCommand(host, command) {
        const connection = this.connections.get(host);
        if (!connection) {
            return { success: false, message: 'SSH connection not found' };
        }
        return await connection.executeCommand(command);
    }

    // 获取所有服务器状态
    getServerList() {
        const servers = [];

        // 添加已连接/正在连接的服务器
        for (const [host, connection] of this.connections) {
            servers.push({
                host,
                status: connection.isConnected ? 'connected' :
                    connection.isConnecting ? 'connecting' : 'disconnected',
                lastActivity: connection.lastActivity,
                hasCredentials: this.credentials.has(host)
            });
        }

        // 添加有保存凭据但未连接的服务器
        for (const [host] of this.credentials) {
            if (!this.connections.has(host)) {
                servers.push({
                    host,
                    status: 'saved',
                    lastActivity: null,
                    hasCredentials: true
                });
            }
        }

        return servers.sort((a, b) => {
            // 已连接的排前面，然后按最后活动时间排序
            if (a.status === 'connected' && b.status !== 'connected') return -1;
            if (b.status === 'connected' && a.status !== 'connected') return 1;
            return (b.lastActivity || 0) - (a.lastActivity || 0);
        });
    }

    // 删除服务器凭据
    removeServerCredentials(host) {
        this.credentials.delete(host);
        this.saveCredentials();
        return { success: true, message: 'Credentials removed' };
    }

    // 获取连接统计
    getConnectionStats() {
        let connected = 0;
        let connecting = 0;

        for (const connection of this.connections.values()) {
            if (connection.isConnected) connected++;
            if (connection.isConnecting) connecting++;
        }

        return {
            total: this.connections.size,
            connected,
            connecting,
            saved: this.credentials.size
        };
    }
}

export default SSHService;