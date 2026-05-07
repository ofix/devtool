class TaskQueue {
    constructor() {
      // 每个供应商独立任务队列
      this.queues = new Map();
      // 每个供应商消费锁
      this.processing = new Map();
      // 请求去重池：uniqueKey => Promise
      this.requestMap = new Map();
  
      // 配置项
      this.MAX_RETRY = 2;        // 最大重试次数
      this.TASK_TIMEOUT = 10000;// 任务超时毫秒 默认10s
      this.errorReportFn = null;// 自定义错误上报回调
    }
  
    /**
     * 注册全局错误上报回调
     * @param {Function} fn 回调 (err, task) => {}
     */
    setErrorReport(fn) {
      this.errorReportFn = fn;
    }
  
    /**
     * 添加任务 + 自动去重合并
     * @param {Object} provider 供应商对象 {name, delayMin, delayMax}
     * @param {string} taskKey 任务唯一标识(用于去重)
     * @param {Function} taskFn 任务异步函数
     * @returns {Promise}
     */
    addTask(provider, taskKey, taskFn) {
      const uniqueKey = `${provider.name}:${taskKey}`;
  
      // 重复请求直接复用，不进队列
      if (this.requestMap.has(uniqueKey)) {
        return this.requestMap.get(uniqueKey);
      }
  
      const promise = new Promise((resolve, reject) => {
        const providerKey = provider.name;
        if (!this.queues.has(providerKey)) {
          this.queues.set(providerKey, []);
          this.processing.set(providerKey, false);
        }
  
        const task = {
          provider,
          taskKey,
          uniqueKey,
          taskFn,
          resolve,
          reject,
          retryCount: 0,
          createTime: Date.now()
        };
  
        this.queues.get(providerKey).push(task);
        this.startProcessing(providerKey);
      });
  
      this.requestMap.set(uniqueKey, promise);
  
      // 无论成功失败、超时、拒绝，都清理去重池
      promise.finally(() => {
        this.requestMap.delete(uniqueKey);
      });
  
      return promise;
    }
  
    async startProcessing(providerKey) {
      if (this.processing.get(providerKey)) return;
      this.processing.set(providerKey, true);
  
      const queue = this.queues.get(providerKey);
  
      while (queue.length > 0) {
        const task = queue.shift();
        const { provider } = task;
  
        try {
          // 1. 随机延时（保留你原有逻辑）
          const { delayMin, delayMax } = provider;
          const delay = Math.random() * (delayMax - delayMin) + delayMin;
          await new Promise(r => setTimeout(r, delay));
  
          // 2. 带超时执行任务
          const result = await this.runWithTimeout(task);
          task.resolve(result);
  
        } catch (err) {
          // 超时/业务报错 统一错误上报
          this.reportError(err, task);
  
          // 重试逻辑
          if (task.retryCount < this.MAX_RETRY) {
            task.retryCount++;
            queue.unshift(task);
          } else {
            task.reject(err);
          }
        }
      }
  
      this.processing.set(providerKey, false);
    }
  
    /**
     * 包装任务：带超时控制
     */
    runWithTimeout(task) {
      return new Promise((resolve, reject) => {
        let timer = setTimeout(() => {
          reject(new Error(`[TaskTimeout] 任务超时 ${this.TASK_TIMEOUT}ms, key:${task.uniqueKey}`));
        }, this.TASK_TIMEOUT);
  
        task.taskFn()
          .then(resolve)
          .catch(reject)
          .finally(() => clearTimeout(timer));
      });
    }
  
    /**
     * 错误上报统一入口
     */
    reportError(err, task) {
      if (typeof this.errorReportFn === 'function') {
        try {
          this.errorReportFn(err, task);
        } catch (e) {
          // 防止上报函数自身报错炸掉流程
        }
      }
    }
  
    // ========== 队列监控接口 ==========
    /**
     * 获取所有供应商队列状态
     */
    getQueueStats() {
      const stats = [];
      for (const [name, queue] of this.queues) {
        stats.push({
          providerName: name,
          pendingCount: queue.length,
          isProcessing: this.processing.get(name),
          dedupPoolSize: this.requestMap.size
        });
      }
      return stats;
    }
  
    /**
     * 获取全局总等待任务数
     */
    getTotalPending() {
      let total = 0;
      for (const q of this.queues.values()) {
        total += q.length;
      }
      return total;
    }
  
    /**
     * 清空指定供应商队列（紧急限流用）
     */
    clearProviderQueue(providerName) {
      if (this.queues.has(providerName)) {
        this.queues.set(providerName, []);
      }
    }
  }
  
  // 全局单例
  global.taskQueue = new TaskQueue();