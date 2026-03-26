// 熔断器
export default class CircuitBreaker {
    constructor(config) {
        this.config = {
            name: config.name || 'default',
            // 熔断阈值
            failureThreshold: config.failure_threshold || 5,      // 失败次数阈值
            failureRateThreshold: config.failure_rate_threshold || 0.5, // 失败率阈值（50%）
            slidingWindowSize: config.sliding_window_size || 60,  // 滑动窗口大小（秒）
            // 熔断状态
            timeout: config.timeout || 60000,                     // 熔断超时时间（毫秒）
            halfOpenMaxAttempts: config.half_open_max_attempts || 3, // 半开状态最大尝试次数
            // 恢复策略
            recoveryStrategy: config.recovery_strategy || 'timeout', // timeout / half_open
            // 监控
            monitorInterval: config.monitor_interval || 10000,    // 监控间隔（毫秒）
            // 回调
            onOpen: config.on_open,
            onClose: config.on_close,
            onHalfOpen: config.on_half_open
        };
        
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failures = 0;
        this.totalRequests = 0;
        this.lastFailureTime = null;
        this.openTime = null;
        this.halfOpenAttempts = 0;
        
        // 滑动窗口记录
        this.window = [];
        this.windowSize = this.config.slidingWindowSize * 1000; // 转换为毫秒
        
        // 监控定时器
        this.monitorTimer = null;
        
        if (this.config.monitorInterval > 0) {
            this.startMonitoring();
        }
    }
    
    async execute(fn, fallback = null) {
        // 检查熔断器状态
        if (this.state === 'OPEN') {
            const now = Date.now();
            if (now - this.openTime >= this.config.timeout) {
                // 熔断超时，进入半开状态
                this.transitionTo('HALF_OPEN');
            } else {
                // 熔断中，执行降级
                if (fallback) {
                    return await fallback();
                }
                throw new Error(`Circuit breaker ${this.config.name} is OPEN`);
            }
        }
        
        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure(error);
            
            if (fallback) {
                return await fallback();
            }
            throw error;
        }
    }
    
    onSuccess() {
        this.totalRequests++;
        
        if (this.state === 'HALF_OPEN') {
            this.halfOpenAttempts++;
            // 成功次数达到阈值，关闭熔断器
            if (this.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
                this.transitionTo('CLOSED');
            }
        }
        
        // 记录成功
        this.recordRequest(true);
    }
    
    onFailure(error) {
        this.failures++;
        this.totalRequests++;
        this.lastFailureTime = Date.now();
        
        // 记录失败
        this.recordRequest(false);
        
        if (this.state === 'CLOSED') {
            this.checkCircuitBreaker();
        } else if (this.state === 'HALF_OPEN') {
            this.halfOpenAttempts++;
            // 半开状态下失败，立即重新打开熔断器
            if (this.halfOpenAttempts <= this.config.halfOpenMaxAttempts) {
                this.transitionTo('OPEN');
            }
        }
    }
    
    recordRequest(success) {
        const now = Date.now();
        this.window.push({
            timestamp: now,
            success: success
        });
        
        // 清理过期记录
        this.cleanWindow(now);
    }
    
    cleanWindow(now) {
        const cutoff = now - this.windowSize;
        this.window = this.window.filter(w => w.timestamp > cutoff);
    }
    
    checkCircuitBreaker() {
        // 清理窗口
        this.cleanWindow(Date.now());
        
        // 检查失败次数阈值
        if (this.failures >= this.config.failureThreshold) {
            this.transitionTo('OPEN');
            return;
        }
        
        // 检查失败率阈值
        if (this.totalRequests >= this.config.slidingWindowSize) {
            const failureRate = this.failures / this.totalRequests;
            if (failureRate >= this.config.failureRateThreshold) {
                this.transitionTo('OPEN');
            }
        }
    }
    
    transitionTo(newState) {
        const oldState = this.state;
        this.state = newState;
        
        if (newState === 'OPEN') {
            this.openTime = Date.now();
            this.halfOpenAttempts = 0;
            if (this.config.onOpen) {
                this.config.onOpen(this);
            }
            console.log(`Circuit breaker ${this.config.name} opened at ${new Date().toISOString()}`);
        } else if (newState === 'CLOSED') {
            // 重置计数器
            this.failures = 0;
            this.totalRequests = 0;
            this.window = [];
            this.halfOpenAttempts = 0;
            if (this.config.onClose) {
                this.config.onClose(this);
            }
            console.log(`Circuit breaker ${this.config.name} closed at ${new Date().toISOString()}`);
        } else if (newState === 'HALF_OPEN') {
            this.halfOpenAttempts = 0;
            if (this.config.onHalfOpen) {
                this.config.onHalfOpen(this);
            }
            console.log(`Circuit breaker ${this.config.name} half-opened at ${new Date().toISOString()}`);
        }
    }
    
    startMonitoring() {
        this.monitorTimer = setInterval(() => {
            const stats = this.getStats();
            console.log(`Circuit breaker ${this.config.name} stats:`, stats);
        }, this.config.monitorInterval);
    }
    
    getStats() {
        this.cleanWindow(Date.now());
        
        return {
            name: this.config.name,
            state: this.state,
            totalRequests: this.totalRequests,
            failures: this.failures,
            failureRate: this.totalRequests > 0 ? this.failures / this.totalRequests : 0,
            windowRequests: this.window.length,
            windowFailures: this.window.filter(w => !w.success).length,
            lastFailureTime: this.lastFailureTime,
            openTime: this.openTime,
            halfOpenAttempts: this.halfOpenAttempts
        };
    }
    
    stopMonitoring() {
        if (this.monitorTimer) {
            clearInterval(this.monitorTimer);
            this.monitorTimer = null;
        }
    }
    
    getState() {
        return this.state;
    }
    
    isOpen() {
        return this.state === 'OPEN';
    }
    
    isClosed() {
        return this.state === 'CLOSED';
    }
    
    isHalfOpen() {
        return this.state === 'HALF_OPEN';
    }
}