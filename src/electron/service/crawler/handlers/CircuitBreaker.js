// src/main/crawler/handlers/CircuitBreaker.js
const EventEmitter = require('events');

/**
 * 熔断器 - 防止级联失败
 * 状态机模式：CLOSED(关闭) -> OPEN(打开) -> HALF_OPEN(半开) -> CLOSED
 */
export default class CircuitBreaker extends EventEmitter {
  /**
   * 构造函数
   * @param {Object} options - 配置选项
   */
  constructor(options = {}) {
    super();
    
    this.name = options.name;                           // 熔断器名称
    this.failureThreshold = options.failureThreshold || 3;  // 失败阈值
    this.timeout = options.timeout || 60000;            // 超时时间(ms)
    this.halfOpenTimeout = options.halfOpenTimeout || 5000; // 半开状态超时
    
    this.state = 'CLOSED';      // CLOSED(关闭), OPEN(打开), HALF_OPEN(半开)
    this.failureCount = 0;      // 连续失败次数
    this.lastFailureTime = null; // 最后一次失败时间
    this.resetTime = null;       // 重置时间
    
    // 统计信息
    this.stats = {
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      openCount: 0,
      halfOpenCount: 0,
      lastOpenTime: null,
      lastCloseTime: null
    };
  }
  
  /**
   * 记录失败
   */
  recordFailure() {
    this.stats.totalRequests++;
    this.stats.failureCount++;
    this.stats.lastFailureTime = new Date();
    
    if (this.state === 'OPEN') return;
    
    this.failureCount++;
    this.lastFailureTime = new Date();
    
    // 检查是否需要打开熔断器
    if (this.failureCount >= this.failureThreshold) {
      this.open();
    }
    
    this.emit('failure', {
      name: this.name,
      failureCount: this.failureCount,
      state: this.state,
      timestamp: this.lastFailureTime
    });
  }
  
  /**
   * 记录成功
   */
  recordSuccess() {
    this.stats.totalRequests++;
    this.stats.successCount++;
    
    if (this.state === 'HALF_OPEN') {
      // 半开状态下成功，关闭熔断器
      this.close();
    } else if (this.state === 'CLOSED') {
      // 关闭状态下成功，重置失败计数
      this.failureCount = 0;
    }
    
    this.emit('success', {
      name: this.name,
      state: this.state,
      timestamp: new Date()
    });
  }
  
  /**
   * 打开熔断器
   */
  open() {
    if (this.state === 'OPEN') return;
    
    this.state = 'OPEN';
    this.resetTime = new Date(Date.now() + this.timeout);
    this.stats.openCount++;
    this.stats.lastOpenTime = new Date();
    
    this.emit('open', {
      name: this.name,
      resetTime: this.resetTime,
      failureCount: this.failureCount,
      threshold: this.failureThreshold
    });
    
    // 设置自动重置定时器
    setTimeout(() => {
      if (this.state === 'OPEN') {
        this.halfOpen();
      }
    }, this.timeout);
  }
  
  /**
   * 半开状态（允许少量请求通过测试）
   */
  halfOpen() {
    if (this.state !== 'OPEN') return;
    
    this.state = 'HALF_OPEN';
    this.stats.halfOpenCount++;
    
    this.emit('halfOpen', {
      name: this.name,
      timestamp: new Date()
    });
    
    // 设置半开状态超时
    setTimeout(() => {
      if (this.state === 'HALF_OPEN') {
        // 超时没有成功，重新打开
        this.open();
      }
    }, this.halfOpenTimeout);
  }
  
  /**
   * 关闭熔断器（恢复正常）
   */
  close() {
    if (this.state === 'CLOSED') return;
    
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.resetTime = null;
    this.stats.lastCloseTime = new Date();
    
    this.emit('close', {
      name: this.name,
      timestamp: new Date()
    });
  }
  
  /**
   * 重置熔断器
   */
  reset() {
    this.failureCount = 0;
    this.state = 'CLOSED';
    this.lastFailureTime = null;
    this.resetTime = null;
    
    this.emit('reset', {
      name: this.name,
      timestamp: new Date()
    });
  }
  
  /**
   * 检查熔断器是否打开
   */
  isOpen() {
    if (this.state === 'OPEN') {
      // 检查是否超时
      if (this.resetTime && new Date() > this.resetTime) {
        this.halfOpen();
        return false;
      }
      return true;
    }
    return false;
  }
  
  /**
   * 获取熔断器状态
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      failureThreshold: this.failureThreshold,
      lastFailureTime: this.lastFailureTime,
      resetTime: this.resetTime,
      stats: { ...this.stats },
      canReset: this.state === 'OPEN' || this.state === 'HALF_OPEN'
    };
  }
  
  /**
   * 获取可视化配置
   */
  getConfig() {
    return {
      failureThreshold: this.failureThreshold,
      timeout: this.timeout,
      halfOpenTimeout: this.halfOpenTimeout
    };
  }
  
  /**
   * 更新配置（支持可视化配置）
   */
  updateConfig(config) {
    if (config.failureThreshold !== undefined) {
      this.failureThreshold = config.failureThreshold;
    }
    if (config.timeout !== undefined) {
      this.timeout = config.timeout;
    }
    if (config.halfOpenTimeout !== undefined) {
      this.halfOpenTimeout = config.halfOpenTimeout;
    }
    
    this.emit('configUpdated', {
      name: this.name,
      config: this.getConfig()
    });
  }
}