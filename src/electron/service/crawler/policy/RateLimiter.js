// 限流器
export default class RateLimiter {
    constructor(config) {
        this.config = config;
        this.algorithm = config.algorithm || 'token_bucket';
        this.groupLimits = new Map(); // 分组限流器
        
        if (this.algorithm === 'token_bucket') {
            this.initTokenBucket();
        } else if (this.algorithm === 'leaky_bucket') {
            this.initLeakyBucket();
        } else if (this.algorithm === 'sliding_window') {
            this.initSlidingWindow();
        }
    }
    
    // 令牌桶算法
    initTokenBucket() {
        const qps = this.config.qps || 10;
        const burst = this.config.burst || qps;
        
        this.tokenBucket = {
            capacity: burst,           // 桶容量
            tokens: burst,             // 当前令牌数
            refillRate: qps,           // 每秒补充速率
            lastRefill: Date.now()
        };
    }
    
    // 漏桶算法
    initLeakyBucket() {
        const qps = this.config.qps || 10;
        this.leakyBucket = {
            capacity: qps,
            water: 0,
            leakRate: qps / 1000,      // 每毫秒漏出速率
            lastLeak: Date.now()
        };
    }
    
    // 滑动窗口算法
    initSlidingWindow() {
        const windowSize = this.config.window_size || 1000; // 窗口大小（毫秒）
        const maxRequests = this.config.qps || 10;
        
        this.slidingWindow = {
            windowSize,
            maxRequests,
            requests: []  // 时间戳数组
        };
    }
    
    async acquire(groupKey = 'default') {
        // 获取分组的限流器
        const limiter = this.getGroupLimiter(groupKey);
        
        while (true) {
            const canAcquire = await this.checkLimit(limiter);
            if (canAcquire) {
                await this.recordRequest(limiter);
                return true;
            }
            
            // 根据配置决定行为
            if (this.config.action === 'drop') {
                throw new Error('Rate limit exceeded, request dropped');
            } else if (this.config.action === 'queue') {
                // 等待队列
                await this.waitInQueue(limiter);
            } else {
                // 等待后重试
                await this.sleep(100);
            }
        }
    }
    
    async checkLimit(limiter) {
        if (this.algorithm === 'token_bucket') {
            return this.checkTokenBucket(limiter);
        } else if (this.algorithm === 'leaky_bucket') {
            return this.checkLeakyBucket(limiter);
        } else if (this.algorithm === 'sliding_window') {
            return this.checkSlidingWindow(limiter);
        }
        return true;
    }
    
    checkTokenBucket(limiter) {
        const now = Date.now();
        const elapsed = now - limiter.lastRefill;
        
        // 补充令牌
        const newTokens = elapsed * (limiter.refillRate / 1000);
        limiter.tokens = Math.min(limiter.capacity, limiter.tokens + newTokens);
        limiter.lastRefill = now;
        
        if (limiter.tokens >= 1) {
            limiter.tokens -= 1;
            return true;
        }
        return false;
    }
    
    checkLeakyBucket(limiter) {
        const now = Date.now();
        const elapsed = now - limiter.lastLeak;
        
        // 漏水
        const leaked = elapsed * limiter.leakRate;
        limiter.water = Math.max(0, limiter.water - leaked);
        limiter.lastLeak = now;
        
        if (limiter.water < limiter.capacity) {
            limiter.water += 1;
            return true;
        }
        return false;
    }
    
    checkSlidingWindow(limiter) {
        const now = Date.now();
        const windowStart = now - limiter.windowSize;
        
        // 清理过期请求
        limiter.requests = limiter.requests.filter(t => t > windowStart);
        
        if (limiter.requests.length < limiter.maxRequests) {
            return true;
        }
        return false;
    }
    
    recordRequest(limiter) {
        if (this.algorithm === 'sliding_window') {
            limiter.requests.push(Date.now());
        }
        // 其他算法在 check 时已经记录了
    }
    
    getGroupLimiter(groupKey) {
        if (!this.groupLimits.has(groupKey)) {
            const limiter = this.createLimiterCopy();
            this.groupLimits.set(groupKey, limiter);
        }
        return this.groupLimits.get(groupKey);
    }
    
    createLimiterCopy() {
        if (this.algorithm === 'token_bucket') {
            return {
                capacity: this.tokenBucket.capacity,
                tokens: this.tokenBucket.capacity,
                refillRate: this.tokenBucket.refillRate,
                lastRefill: Date.now()
            };
        } else if (this.algorithm === 'leaky_bucket') {
            return {
                capacity: this.leakyBucket.capacity,
                water: 0,
                leakRate: this.leakyBucket.leakRate,
                lastLeak: Date.now()
            };
        } else if (this.algorithm === 'sliding_window') {
            return {
                windowSize: this.slidingWindow.windowSize,
                maxRequests: this.slidingWindow.maxRequests,
                requests: []
            };
        }
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    async waitInQueue(limiter) {
        // 简单的队列实现
        const queueSize = this.config.queueSize || 100;
        // 实际应该用真正的队列
        await this.sleep(100);
    }
}