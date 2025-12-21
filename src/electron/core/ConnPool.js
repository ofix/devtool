import EventEmitter from "events";

class ConnPool extends EventEmitter {
  /**
   * 通用连接池构造函数
   * 同一个客户端和同一个服务器保持多个连接实例以提高性能
   * @param {Object} options 配置项
   * @param {ConnAdapter} options.adapter 连接适配器实例（必须实现统一接口）
   * @param {number} [options.max=20] 最大连接数
   * @param {number} [options.min=2] 最小空闲连接数
   * @param {number} [options.idleTimeout=30000] 空闲连接超时时间（毫秒）
   */
  constructor(options) {
    super();
    if (!(options.adapter && typeof options.adapter.create === "function" && typeof options.adapter.destroy === "function")) {
      throw new Error("必须传入实现了统一接口的ConnAdapter实例");
    }

    this.adapter = options.adapter;
    this.max = options.max || 20;
    this.min = options.min || 2;
    this.idleTimeout = options.idleTimeout || 30000;

    this.availableConnections = []; // 空闲连接队列
    this.activeConnections = new Set(); // 活跃连接集合
    this.pendingRequests = []; // 等待连接的请求队列
    this.isRefreshingMin = false; // 是否正在补充最小空闲连接

    this.initMinConnections().catch((err) => {
      this.emit("error", `初始化最小空闲连接失败：${err.message}`);
    });
  }

  /**
   * 初始化最小空闲连接
   */
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

  /**
   * 添加空闲连接（并设置超时销毁）
   * @param {*} connection 连接实例
   */
  addIdleConnection(connection) {
    connection.idleTimeoutTimer = setTimeout(async () => {
      // 若连接仍处于空闲状态，且当前空闲数大于最小空闲数，则销毁
      const index = this.availableConnections.indexOf(connection);
      if (index > -1 && this.availableConnections.length > this.min) {
        this.availableConnections.splice(index, 1);
        await this.adapter.destroy(connection);
        this.emit("connectionDestroyed", "空闲连接超时销毁成功");
      }
    }, this.idleTimeout);

    this.availableConnections.push(connection);
  }

  /**
   * 获取连接实例
   * @returns {Promise<*>} 连接实例
   */
  async acquire() {
    // 优先使用空闲连接（先验证连接是否有效）
    while (this.availableConnections.length > 0) {
      const connection = this.availableConnections.shift();
      const isValid = await this.adapter.isValid(connection);
      if (isValid) {
        // 清除空闲超时定时器
        clearTimeout(connection.idleTimeoutTimer);
        this.activeConnections.add(connection);
        this.emit("connectionAcquired", "从空闲队列获取连接成功");
        return connection;
      } else {
        // 无效连接直接销毁
        await this.adapter.destroy(connection);
        this.emit("connectionDestroyed", "空闲连接无效，已销毁");
      }
    }

    // 空闲连接不足，判断是否可创建新连接
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

    // 已达最大连接数，加入等待队列
    return new Promise((resolve, reject) => {
      this.pendingRequests.push({ resolve, reject });
      this.emit("requestPending", "连接池达最大连接数，请求进入等待队列");
    });
  }

  /**
   * 释放连接（归还到连接池）
   * @param {*} connection 连接实例
   */
  async release(connection) {
    // 验证连接是否为活跃连接
    if (!this.activeConnections.has(connection)) {
      const errorMsg = "无效的连接，无法释放";
      this.emit("error", errorMsg);
      throw new Error(errorMsg);
    }

    // 先验证连接是否有效，无效则直接销毁，不归还
    const isValid = await this.adapter.isValid(connection);
    if (!isValid) {
      this.activeConnections.delete(connection);
      await this.adapter.destroy(connection);
      this.emit("connectionDestroyed", "释放的连接无效，已销毁");
      // 补充最小空闲连接
      this.refreshMinConnections();
      return;
    }

    // 从活跃连接集合中移除
    this.activeConnections.delete(connection);

    // 优先处理等待队列中的请求
    if (this.pendingRequests.length > 0) {
      const { resolve } = this.pendingRequests.shift();
      this.activeConnections.add(connection);
      resolve(connection);
      this.emit("connectionReused", "释放的连接直接复用给等待请求");
      return;
    }

    // 无等待请求，归还到空闲连接队列
    this.addIdleConnection(connection);
    this.emit("connectionReleased", "连接成功归还到空闲队列");

    // 确保最小空闲连接数
    this.refreshMinConnections();
  }

  /**
   * 补充最小空闲连接（抽离为独立方法，便于复用）
   */
  async refreshMinConnections() {
    if (!this.isRefreshingMin) {
      this.isRefreshingMin = true;
      await this.initMinConnections();
      this.isRefreshingMin = false;
    }
  }

  /**
   * 销毁连接池（关闭所有连接，释放资源）
   */
  async destroy() {
    // 拒绝所有等待队列中的请求
    this.pendingRequests.forEach(({ reject }) => {
      const errorMsg = "连接池已销毁";
      reject(new Error(errorMsg));
      this.emit("error", errorMsg);
    });
    this.pendingRequests = [];

    // 销毁所有空闲连接
    for (const conn of this.availableConnections) {
      clearTimeout(conn.idleTimeoutTimer);
      await this.adapter.destroy(conn);
    }
    this.availableConnections = [];

    // 销毁所有活跃连接
    for (const conn of this.activeConnections) {
      await this.adapter.destroy(conn);
    }
    this.activeConnections.clear();

    this.emit("poolDestroyed", "连接池已完全销毁，所有连接关闭");
  }
}

export default ConnPool;