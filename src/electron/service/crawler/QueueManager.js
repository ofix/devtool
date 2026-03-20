// src/main/crawler/handlers/QueueManager.js
import EventEmitter from 'events';
/*
主要特性
1. 双层并发控制
全局并发：控制所有站点同时运行的任务总数

站点级并发：每个站点独立控制并发数，防止同一站点请求过多被封

2. 优先级队列
支持 1-10 级优先级，数字越大优先级越高

高优先级任务自动排在队列前面

3. 任务重试机制
支持失败自动重试

指数退避策略（2^n 秒延迟）

可配置最大重试次数

智能判断可重试的错误类型

4. 超时控制
每个任务独立的超时时间

自动清理超时任务

定期清理定时器

5. 队列管理
支持暂停/恢复指定站点

支持清空队列

支持等待所有任务完成

6. 统计监控
实时统计任务数量、成功率、平均等待时间

按站点统计详细数据

事件通知系统

7. 延迟控制
支持站点级任务间延迟

防止请求过快被封

8. 灵活配置
动态调整全局和站点级并发数

运行时启用/禁用站点
*/
/**
 * 队列管理器 - 管理爬虫任务的并发和排队
 * 支持站点级和全局级并发控制，防止同一站点并发请求过多被封
 */
export default class QueueManager extends EventEmitter {
  /**
   * 构造函数
   * @param {Object} options - 配置选项
   * @param {number} options.globalConcurrent - 全局最大并发数
   * @param {number} options.maxConcurrentPerSite - 单站点最大并发数
   * @param {number} options.queueTimeout - 队列超时时间(ms)
   * @param {boolean} options.autoProcess - 是否自动处理队列
   */
  constructor(options = {}) {
    super();
    
    // 全局配置
    this.globalMax = options.globalConcurrent || 3;        // 全局最大并发数
    this.siteMaxConcurrent = options.maxConcurrentPerSite || 1;  // 单站点最大并发数
    this.queueTimeout = options.queueTimeout || 30000;     // 队列超时时间
    this.autoProcess = options.autoProcess !== false;      // 自动处理队列
    
    // 全局状态
    this.globalRunning = 0;                                // 当前全局运行任务数
    this.globalQueue = [];                                 // 全局等待队列
    
    // 站点级状态
    this.siteQueues = new Map();                           // 站点队列映射
    this.siteRunning = new Map();                          // 站点运行任务数映射
    this.siteConfigs = new Map();                          // 站点配置映射
    
    // 任务统计
    this.stats = {
      totalEnqueued: 0,
      totalProcessed: 0,
      totalSuccess: 0,
      totalFailed: 0,
      totalTimeout: 0,
      averageWaitTime: 0,
      bySite: new Map()
    };
    
    // 定时清理超时任务
    this.cleanupInterval = setInterval(() => this.cleanupTimeoutTasks(), 5000);
  }
  
  /**
   * 注册站点配置
   * @param {string} siteName - 站点名称
   * @param {Object} config - 站点配置
   * @param {number} config.maxConcurrent - 该站点的最大并发数
   * @param {number} config.delay - 任务间延迟(ms)
   * @param {boolean} config.enabled - 是否启用
   */
  registerSite(siteName, config = {}) {
    if (!this.siteQueues.has(siteName)) {
      this.siteQueues.set(siteName, []);
      this.siteRunning.set(siteName, 0);
      this.stats.bySite.set(siteName, {
        enqueued: 0,
        processed: 0,
        success: 0,
        failed: 0
      });
    }
    
    this.siteConfigs.set(siteName, {
      maxConcurrent: config.maxConcurrent || this.siteMaxConcurrent,
      delay: config.delay || 0,
      enabled: config.enabled !== false,
      retryCount: config.retryCount || 0,
      timeout: config.timeout || this.queueTimeout
    });
    
    this.emit('siteRegistered', { siteName, config: this.siteConfigs.get(siteName) });
  }
  
  /**
   * 获取站点队列
   * @param {string} siteName - 站点名称
   * @returns {Array} 站点队列
   */
  getSiteQueue(siteName) {
    if (!this.siteQueues.has(siteName)) {
      this.registerSite(siteName);
    }
    return this.siteQueues.get(siteName);
  }
  
  /**
   * 将任务加入队列
   * @param {string} siteName - 站点名称
   * @param {Function} task - 任务函数
   * @param {Object} options - 任务选项
   * @param {number} options.priority - 优先级(1-10, 数字越大优先级越高)
   * @param {number} options.timeout - 任务超时时间
   * @param {boolean} options.retryOnFail - 失败是否重试
   * @returns {Promise} 任务执行结果
   */
  async enqueue(siteName, task, options = {}) {
    // 检查站点是否启用
    const siteConfig = this.siteConfigs.get(siteName);
    if (siteConfig && !siteConfig.enabled) {
      throw new Error(`Site ${siteName} is disabled`);
    }
    
    // 更新统计
    this.stats.totalEnqueued++;
    const siteStats = this.stats.bySite.get(siteName);
    if (siteStats) {
      siteStats.enqueued++;
    }
    
    // 创建任务包装器
    const taskWrapper = {
      id: this.generateTaskId(),
      siteName,
      task,
      options: {
        priority: options.priority || 5,
        timeout: options.timeout || siteConfig?.timeout || this.queueTimeout,
        retryOnFail: options.retryOnFail !== false,
        retryCount: options.retryCount || 0,
        maxRetries: options.maxRetries || siteConfig?.retryCount || 3,
        createdAt: Date.now(),
        ...options
      },
      status: 'pending', // pending, running, completed, failed, timeout
      resolve: null,
      reject: null,
      retries: 0,
      startTime: null,
      endTime: null
    };
    
    // 返回Promise
    return new Promise((resolve, reject) => {
      taskWrapper.resolve = resolve;
      taskWrapper.reject = reject;
      
      // 获取站点队列并按优先级插入
      const queue = this.getSiteQueue(siteName);
      this.insertByPriority(queue, taskWrapper);
      
      this.emit('enqueued', {
        taskId: taskWrapper.id,
        siteName,
        queueLength: queue.length,
        priority: taskWrapper.options.priority
      });
      
      // 尝试处理队列
      if (this.autoProcess) {
        this.processQueue(siteName);
      }
    });
  }
  
  /**
   * 按优先级插入队列
   * @param {Array} queue - 队列
   * @param {Object} task - 任务
   */
  insertByPriority(queue, task) {
    const priority = task.options.priority;
    let insertIndex = queue.length;
    
    // 从后往前找，找到第一个优先级小于当前任务的位置
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].options.priority >= priority) {
        insertIndex = i + 1;
        break;
      }
    }
    
    queue.splice(insertIndex, 0, task);
  }
  
  /**
   * 处理站点队列
   * @param {string} siteName - 站点名称
   */
  async processQueue(siteName) {
    // 检查全局并发限制
    if (this.globalRunning >= this.globalMax) {
      this.emit('globalQueueWaiting', {
        globalRunning: this.globalRunning,
        globalMax: this.globalMax
      });
      return;
    }
    
    // 获取站点配置
    const siteConfig = this.siteConfigs.get(siteName);
    if (!siteConfig || !siteConfig.enabled) {
      return;
    }
    
    // 获取站点队列和运行数
    const queue = this.siteQueues.get(siteName);
    const running = this.siteRunning.get(siteName) || 0;
    
    // 检查站点并发限制
    const availableSlots = siteConfig.maxConcurrent - running;
    if (availableSlots <= 0) {
      this.emit('siteQueueWaiting', {
        siteName,
        running,
        maxConcurrent: siteConfig.maxConcurrent
      });
      return;
    }
    
    // 检查是否有待处理任务
    if (!queue || queue.length === 0) {
      return;
    }
    
    // 取出任务
    const taskWrapper = queue.shift();
    
    // 检查任务是否超时
    if (Date.now() - taskWrapper.options.createdAt > taskWrapper.options.timeout) {
      this.handleTaskTimeout(taskWrapper);
      // 继续处理下一个任务
      this.processQueue(siteName);
      return;
    }
    
    // 执行任务
    await this.executeTask(taskWrapper, siteConfig);
    
    // 递归处理下一个任务（延迟后）
    if (siteConfig.delay > 0) {
      setTimeout(() => {
        this.processQueue(siteName);
      }, siteConfig.delay);
    } else {
      // 使用 setImmediate 避免递归过深
      setImmediate(() => {
        this.processQueue(siteName);
      });
    }
  }
  
  /**
   * 执行单个任务
   * @param {Object} taskWrapper - 任务包装器
   * @param {Object} siteConfig - 站点配置
   */
  async executeTask(taskWrapper, siteConfig) {
    const { siteName, task, resolve, reject, options, id } = taskWrapper;
    
    // 更新状态
    taskWrapper.status = 'running';
    taskWrapper.startTime = Date.now();
    this.globalRunning++;
    this.siteRunning.set(siteName, (this.siteRunning.get(siteName) || 0) + 1);
    
    this.emit('taskStart', {
      taskId: id,
      siteName,
      queueLength: this.siteQueues.get(siteName)?.length || 0,
      globalRunning: this.globalRunning,
      siteRunning: this.siteRunning.get(siteName)
    });
    
    // 设置超时定时器
    let timeoutId = null;
    const timeoutPromise = new Promise((_, rejectTimeout) => {
      timeoutId = setTimeout(() => {
        rejectTimeout(new Error(`Task timeout after ${options.timeout}ms`));
      }, options.timeout);
    });
    
    try {
      // 执行任务（带超时控制）
      const result = await Promise.race([
        task(),
        timeoutPromise
      ]);
      
      // 清除超时定时器
      if (timeoutId) clearTimeout(timeoutId);
      
      // 任务成功
      taskWrapper.status = 'completed';
      taskWrapper.endTime = Date.now();
      const duration = taskWrapper.endTime - taskWrapper.startTime;
      
      // 更新统计
      this.updateStats(siteName, true, duration);
      
      resolve(result);
      
      this.emit('taskComplete', {
        taskId: id,
        siteName,
        duration,
        success: true
      });
      
    } catch (error) {
      // 清除超时定时器
      if (timeoutId) clearTimeout(timeoutId);
      
      // 判断是否需要重试
      const shouldRetry = options.retryOnFail && 
                          taskWrapper.retries < options.maxRetries &&
                          this.isRetryableError(error);
      
      if (shouldRetry) {
        // 重试任务
        taskWrapper.retries++;
        taskWrapper.status = 'pending';
        taskWrapper.options.createdAt = Date.now(); // 重置创建时间
        
        // 重新加入队列（放到队首，优先重试）
        const queue = this.getSiteQueue(siteName);
        queue.unshift(taskWrapper);
        
        this.emit('taskRetry', {
          taskId: id,
          siteName,
          retryCount: taskWrapper.retries,
          maxRetries: options.maxRetries,
          error: error.message
        });
        
        // 延迟后重试
        setTimeout(() => {
          this.processQueue(siteName);
        }, Math.pow(2, taskWrapper.retries) * 1000); // 指数退避
      } else {
        // 任务失败
        taskWrapper.status = 'failed';
        taskWrapper.endTime = Date.now();
        const duration = taskWrapper.endTime - taskWrapper.startTime;
        
        // 更新统计
        this.updateStats(siteName, false, duration);
        
        reject(error);
        
        this.emit('taskFailed', {
          taskId: id,
          siteName,
          duration,
          error: error.message,
          retries: taskWrapper.retries
        });
      }
    } finally {
      // 清理状态
      this.globalRunning--;
      const siteRunning = this.siteRunning.get(siteName) || 0;
      this.siteRunning.set(siteName, Math.max(0, siteRunning - 1));
      
      // 处理全局队列中的等待任务
      this.processGlobalQueue();
    }
  }
  
  /**
   * 处理全局队列
   */
  async processGlobalQueue() {
    if (this.globalRunning >= this.globalMax) {
      return;
    }
    
    if (this.globalQueue.length === 0) {
      return;
    }
    
    const { siteName } = this.globalQueue.shift();
    this.processQueue(siteName);
  }
  
  /**
   * 处理任务超时
   * @param {Object} taskWrapper - 任务包装器
   */
  handleTaskTimeout(taskWrapper) {
    taskWrapper.status = 'timeout';
    this.stats.totalTimeout++;
    
    const error = new Error(`Task ${taskWrapper.id} timeout after ${taskWrapper.options.timeout}ms`);
    taskWrapper.reject(error);
    
    this.emit('taskTimeout', {
      taskId: taskWrapper.id,
      siteName: taskWrapper.siteName,
      timeout: taskWrapper.options.timeout
    });
  }
  
  /**
   * 判断错误是否可重试
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否可重试
   */
  isRetryableError(error) {
    const retryableMessages = [
      'timeout',
      'network',
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'socket hang up'
    ];
    
    const message = error.message.toLowerCase();
    return retryableMessages.some(msg => message.includes(msg));
  }
  
  /**
   * 更新统计信息
   * @param {string} siteName - 站点名称
   * @param {boolean} success - 是否成功
   * @param {number} duration - 执行时长
   */
  updateStats(siteName, success, duration) {
    this.stats.totalProcessed++;
    if (success) {
      this.stats.totalSuccess++;
    } else {
      this.stats.totalFailed++;
    }
    
    // 更新平均等待时间
    this.stats.averageWaitTime = (this.stats.averageWaitTime * (this.stats.totalProcessed - 1) + duration) / this.stats.totalProcessed;
    
    // 更新站点统计
    const siteStats = this.stats.bySite.get(siteName);
    if (siteStats) {
      siteStats.processed++;
      if (success) {
        siteStats.success++;
      } else {
        siteStats.failed++;
      }
    }
  }
  
  /**
   * 清理超时任务
   */
  cleanupTimeoutTasks() {
    const now = Date.now();
    
    for (const [siteName, queue] of this.siteQueues.entries()) {
      const originalLength = queue.length;
      const validTasks = [];
      
      for (const task of queue) {
        if (now - task.options.createdAt <= task.options.timeout) {
          validTasks.push(task);
        } else {
          this.handleTaskTimeout(task);
        }
      }
      
      if (validTasks.length !== originalLength) {
        this.siteQueues.set(siteName, validTasks);
        this.emit('queueCleaned', {
          siteName,
          removed: originalLength - validTasks.length,
          remaining: validTasks.length
        });
      }
    }
  }
  
  /**
   * 获取站点队列状态
   * @param {string} siteName - 站点名称
   * @returns {Object} 队列状态
   */
  getQueueStatus(siteName) {
    const queue = this.siteQueues.get(siteName) || [];
    const running = this.siteRunning.get(siteName) || 0;
    const config = this.siteConfigs.get(siteName);
    
    return {
      siteName,
      queueLength: queue.length,
      running,
      maxConcurrent: config?.maxConcurrent || this.siteMaxConcurrent,
      enabled: config?.enabled !== false,
      tasks: queue.map(task => ({
        id: task.id,
        priority: task.options.priority,
        waitingTime: Date.now() - task.options.createdAt,
        status: task.status
      }))
    };
  }
  
  /**
   * 获取所有队列状态
   * @returns {Object} 所有队列状态
   */
  getAllQueueStatus() {
    const status = {};
    for (const siteName of this.siteQueues.keys()) {
      status[siteName] = this.getQueueStatus(siteName);
    }
    return status;
  }
  
  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      globalRunning: this.globalRunning,
      globalMax: this.globalMax,
      activeSites: this.siteQueues.size,
      siteStats: Object.fromEntries(this.stats.bySite)
    };
  }
  
  /**
   * 清空指定站点的队列
   * @param {string} siteName - 站点名称
   */
  clearQueue(siteName) {
    const queue = this.siteQueues.get(siteName);
    if (queue) {
      // 拒绝所有等待中的任务
      for (const task of queue) {
        task.reject(new Error(`Queue cleared for site ${siteName}`));
      }
      this.siteQueues.set(siteName, []);
      
      this.emit('queueCleared', { siteName });
    }
  }
  
  /**
   * 清空所有队列
   */
  clearAllQueues() {
    for (const siteName of this.siteQueues.keys()) {
      this.clearQueue(siteName);
    }
  }
  
  /**
   * 暂停指定站点的队列处理
   * @param {string} siteName - 站点名称
   */
  pauseSite(siteName) {
    const config = this.siteConfigs.get(siteName);
    if (config) {
      config.enabled = false;
      this.siteConfigs.set(siteName, config);
      this.emit('sitePaused', { siteName });
    }
  }
  
  /**
   * 恢复指定站点的队列处理
   * @param {string} siteName - 站点名称
   */
  resumeSite(siteName) {
    const config = this.siteConfigs.get(siteName);
    if (config) {
      config.enabled = true;
      this.siteConfigs.set(siteName, config);
      this.emit('siteResumed', { siteName });
      
      // 恢复处理队列
      this.processQueue(siteName);
    }
  }
  
  /**
   * 等待所有任务完成
   * @returns {Promise} 等待所有任务完成
   */
  async waitForAll() {
    while (this.globalRunning > 0 || this.getTotalQueueLength() > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  /**
   * 获取总队列长度
   * @returns {number} 总队列长度
   */
  getTotalQueueLength() {
    let total = 0;
    for (const queue of this.siteQueues.values()) {
      total += queue.length;
    }
    return total;
  }
  
  /**
   * 生成任务ID
   * @returns {string} 任务ID
   */
  generateTaskId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * 更新全局并发限制
   * @param {number} maxConcurrent - 最大并发数
   */
  updateGlobalConcurrent(maxConcurrent) {
    this.globalMax = maxConcurrent;
    this.emit('globalConcurrentUpdated', { maxConcurrent });
    
    // 尝试处理更多任务
    this.processGlobalQueue();
    for (const siteName of this.siteQueues.keys()) {
      this.processQueue(siteName);
    }
  }
  
  /**
   * 更新站点并发限制
   * @param {string} siteName - 站点名称
   * @param {number} maxConcurrent - 最大并发数
   */
  updateSiteConcurrent(siteName, maxConcurrent) {
    const config = this.siteConfigs.get(siteName);
    if (config) {
      config.maxConcurrent = maxConcurrent;
      this.siteConfigs.set(siteName, config);
      this.emit('siteConcurrentUpdated', { siteName, maxConcurrent });
      
      // 尝试处理更多任务
      this.processQueue(siteName);
    }
  }
  
  /**
   * 销毁队列管理器
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clearAllQueues();
    this.removeAllListeners();
  }
}

/**
 * 使用示例
// 创建队列管理器
const queueManager = new QueueManager({
  globalConcurrent: 3,        // 全局最多同时运行3个任务
  maxConcurrentPerSite: 1,    // 每个站点最多同时运行1个任务
  queueTimeout: 30000,        // 任务超时时间30秒
  autoProcess: true           // 自动处理队列
});

// 注册站点
queueManager.registerSite('example.com', {
  maxConcurrent: 1,           // 该站点并发数
  delay: 2000,                // 任务间延迟2秒
  retryCount: 3,              // 最多重试3次
  enabled: true               // 站点启用
});

// 添加任务
queueManager.enqueue('example.com', async () => {
  // 执行爬取任务
  await crawlPage();
}, {
  priority: 8,                // 高优先级
  timeout: 60000,             // 自定义超时
  retryOnFail: true           // 失败重试
});

// 监听事件
queueManager.on('taskStart', ({ taskId, siteName }) => {
  console.log(`Task ${taskId} started on ${siteName}`);
});

queueManager.on('taskComplete', ({ taskId, duration }) => {
  console.log(`Task ${taskId} completed in ${duration}ms`);
});

queueManager.on('taskFailed', ({ taskId, error }) => {
  console.error(`Task ${taskId} failed: ${error}`);
});

// 获取状态
const status = queueManager.getQueueStatus('example.com');
console.log(status);
// {
//   siteName: 'example.com',
//   queueLength: 2,
//   running: 1,
//   maxConcurrent: 1,
//   enabled: true,
//   tasks: [...]
// }

// 暂停站点
queueManager.pauseSite('example.com');

// 恢复站点
queueManager.resumeSite('example.com');

// 等待所有任务完成
await queueManager.waitForAll();

// 销毁管理器
queueManager.destroy();
 */