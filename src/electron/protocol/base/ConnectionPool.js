import EventEmitter from "events";

/**
 * 通用连接池 - 保持你的原有实现
 * 每个协议客户端独立持有自己的 ConnPool 实例
 */
class ConnectionPool extends EventEmitter {
    constructor(options) {
        super();
        if (!(options.adapter && typeof options.adapter.create === "function" &&
            typeof options.adapter.destroy === "function")) {
            throw new Error("必须传入实现了统一接口的ConnAdapter实例");
        }

        this.adapter = options.adapter;
        this.max = options.max || 20;
        this.min = options.min || 2;
        this.idleTimeout = options.idleTimeout || 30000;

        this.availableConnections = [];
        this.activeConnections = new Set();
        this.pendingRequests = [];
        this.isRefreshingMin = false;

        this.initMinConnections().catch((err) => {
            this.emit("error", `初始化最小空闲连接失败：${err.message}`);
        });
    }

    async initMinConnections() {
        const needCreate = this.min - this.availableConnections.length;
        if (needCreate <= 0) return;

        for (let i = 0; i < needCreate; i++) {
            try {
                const connection = await this.adapter.create();
                this.addIdleConnection(connection);
                this.emit("connectionCreated", "初始化空闲连接创建成功");
            } catch (err) {
                this.emit("error", `初始化空闲连接失败：${err.message}`);
            }
        }
    }

    addIdleConnection(connection) {
        // 清除历史定时器，避免多重超时
        if (connection.idleTimeoutTimer) {
            clearTimeout(connection.idleTimeoutTimer);
        }
        connection.idleTimeoutTimer = setTimeout(async () => {
            const index = this.availableConnections.indexOf(connection);
            if (index > -1 && this.availableConnections.length > this.min) {
                this.availableConnections.splice(index, 1);
                await this.adapter.destroy(connection);
                this.emit("connectionDestroyed", "空闲连接超时销毁成功");
            }
        }, this.idleTimeout);
        this.availableConnections.push(connection);
    }

    async acquire() {
        while (this.availableConnections.length > 0) {
            const connection = this.availableConnections.shift();
            const isValid = await this.adapter.isValid(connection);
            if (isValid) {
                clearTimeout(connection.idleTimeoutTimer);
                this.activeConnections.add(connection);
                this.emit("connectionAcquired", "从空闲队列获取连接成功");
                return connection;
            } else {
                await this.adapter.destroy(connection);
                this.emit("connectionDestroyed", "空闲连接无效，已销毁");
            }
        }

        if (this.activeConnections.size < this.max) {
            try {
                const connection = await this.adapter.create();
                this.activeConnections.add(connection);
                this.emit("connectionAcquired", "新建连接并获取成功");
                return connection;
            } catch (err) {
                const errorMsg = `创建新连接失败：${err.message}`;
                this.emit("error", errorMsg);
                throw new Error(errorMsg);
            }
        }

        return new Promise((resolve, reject) => {
            this.pendingRequests.push({ resolve, reject });
            this.emit("requestPending", "连接池达最大连接数，请求进入等待队列");
        });
    }

    async release(connection) {
        if (!this.activeConnections.has(connection)) {
            const errorMsg = "无效的连接，无法释放";
            this.emit("error", errorMsg);
            throw new Error(errorMsg);
        }

        // 提前清除旧闲置定时器，防止多重定时
        if (connection.idleTimeoutTimer) {
            clearTimeout(connection.idleTimeoutTimer);
            connection.idleTimeoutTimer = null;
        }

        const isValid = await this.adapter.isValid(connection);
        if (!isValid) {
            this.activeConnections.delete(connection);
            try {
                await this.adapter.destroy(connection);
                this.emit("connectionDestroyed", "释放的连接无效，已销毁");
                this.refreshMinConnections();
                return;
            } catch (err) {
                this.emit("error", `销毁无效连接失败：${err.message}`);
            }
        }

        this.activeConnections.delete(connection);

        if (this.pendingRequests.length > 0) {
            const { resolve }  = this.pendingRequests.shift();
            this.activeConnections.add(connection);
            try {
                resolve(connection);
            } catch (err) {
                // resolve 异常兜底，连接回收进空闲
                this.activeConnections.delete(connection);
                this.addIdleConnection(connection);
                this.emit("error", `分配连接给等待任务失败：${err.message}`);
            }
            this.emit("connectionReused", "释放的连接直接复用给等待请求");
            return;
        }

        this.addIdleConnection(connection);
        this.emit("connectionReleased", "连接成功归还到空闲队列");
    }

    async refreshMinConnections() {
        if (!this.isRefreshingMin) {
            this.isRefreshingMin = true;
            await this.initMinConnections();
            this.isRefreshingMin = false;
        }
    }

    async destroy() {
        this.pendingRequests.forEach(({ reject }) => {
            const errorMsg = "连接池已销毁";
            reject(new Error(errorMsg));
            this.emit("error", errorMsg);
        });
        this.pendingRequests = [];

        for (const conn of this.availableConnections) {
            clearTimeout(conn.idleTimeoutTimer);
            await this.adapter.destroy(conn);
        }
        this.availableConnections = [];

        for (const conn of this.activeConnections) {
            await this.adapter.destroy(conn);
        }
        this.activeConnections.clear();

        this.emit("poolDestroyed", "连接池已完全销毁，所有连接关闭");
    }
}

export default ConnectionPool;