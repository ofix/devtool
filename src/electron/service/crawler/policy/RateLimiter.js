// src/crawler/policy/RateLimiter.js

/**
 * 限流器
 * 支持令牌桶、漏桶、滑动窗口三种算法
 */
export default class RateLimiter {
    constructor(config) {
        this.config = config;
        this.algorithm = config.algorithm || 'token_bucket';
        this.groupLimits = new Map(); // 分组限流器

        // 超时配置
        this.acquireTimeout = config.acquire_timeout || 30000;  // 获取令牌超时时间（毫秒）
        this.maxQueueSize = config.queue_size || 100;            // 最大队列大小

        if (this.algorithm === 'token_bucket') {
            this.initTokenBucket();
        } else if (this.algorithm === 'leaky_bucket') {
            this.initLeakyBucket();
        } else if (this.algorithm === 'sliding_window') {
            this.initSlidingWindow();
        }
    }

    /**
     * 获取令牌（带超时和队列管理）
     * @param {string} groupKey - 分组键
     * @returns {Promise<boolean>} 是否获取成功
     */
    async acquire(groupKey = 'default') {
        const limiter = this.getGroupLimiter(groupKey);

        // 创建 Promise 队列管理
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                // 超时处理
                if (this.config.action === 'drop') {
                    reject(new Error(`Rate limit acquire timeout after ${this.acquireTimeout}ms`));
                } else {
                    // 移除队列中的等待项
                    const index = limiter.waitQueue.indexOf(waiter);
                    if (index !== -1) limiter.waitQueue.splice(index, 1);
                    reject(new Error(`Rate limit timeout: ${groupKey}`));
                }
            }, this.acquireTimeout);

            const waiter = {
                resolve: () => {
                    clearTimeout(timeoutId);
                    resolve(true);
                },
                reject: (err) => {
                    clearTimeout(timeoutId);
                    reject(err);
                }
            };

            // 尝试立即获取令牌
            if (this._tryAcquire(limiter)) {
                waiter.resolve();
                return;
            }

            // 根据配置决定行为
            if (this.config.action === 'drop') {
                waiter.reject(new Error(`Rate limit exceeded: ${groupKey}`));
            } else if (this.config.action === 'queue') {
                // 检查队列大小
                if (limiter.waitQueue.length >= this.maxQueueSize) {
                    waiter.reject(new Error(`Rate limit queue full: ${groupKey}`));
                } else {
                    limiter.waitQueue.push(waiter);
                }
            } else {
                // wait 模式：加入等待队列，定期重试
                limiter.waitQueue.push(waiter);
                this._scheduleRetry(limiter);
            }
        });
    }

    /**
     * 尝试立即获取令牌（非阻塞）
     * @returns {boolean} 是否获取成功
     */
    tryAcquire(groupKey = 'default') {
        const limiter = this.getGroupLimiter(groupKey);
        return this._tryAcquire(limiter);
    }

    /**
     * 尝试获取令牌（内部实现）
     * @private
     */
    _tryAcquire(limiter) {
        if (this.algorithm === 'token_bucket') {
            return this._checkTokenBucket(limiter);
        } else if (this.algorithm === 'leaky_bucket') {
            return this._checkLeakyBucket(limiter);
        } else if (this.algorithm === 'sliding_window') {
            return this._checkSlidingWindow(limiter);
        }
        return true;
    }

    /**
     * 安排重试（处理等待队列）
     * @private
     */
    _scheduleRetry(limiter) {
        if (limiter.retryTimer) return;

        limiter.retryTimer = setInterval(() => {
            // 处理等待队列
            while (limiter.waitQueue.length > 0 && this._tryAcquire(limiter)) {
                const waiter = limiter.waitQueue.shift();
                waiter.resolve();
            }

            // 队列为空，停止定时器
            if (limiter.waitQueue.length === 0 && limiter.retryTimer) {
                clearInterval(limiter.retryTimer);
                limiter.retryTimer = null;
            }
        }, 100); // 每100ms尝试一次
    }

    /**
     * 令牌桶算法检查
     */
    _checkTokenBucket(limiter) {
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

    /**
     * 漏桶算法检查
     */
    _checkLeakyBucket(limiter) {
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

    /**
     * 滑动窗口算法检查
     */
    _checkSlidingWindow(limiter) {
        const now = Date.now();
        const windowStart = now - limiter.windowSize;

        // 清理过期请求
        limiter.requests = limiter.requests.filter(t => t > windowStart);

        if (limiter.requests.length < limiter.maxRequests) {
            limiter.requests.push(now);
            return true;
        }
        return false;
    }

    /**
     * 获取分组限流器
     */
    getGroupLimiter(groupKey) {
        if (!this.groupLimits.has(groupKey)) {
            const limiter = this.createLimiterCopy();
            limiter.waitQueue = [];      // 等待队列
            limiter.retryTimer = null;    // 重试定时器
            this.groupLimits.set(groupKey, limiter);
        }
        return this.groupLimits.get(groupKey);
    }

    /**
     * 创建限流器副本
     */
    createLimiterCopy() {
        if (this.algorithm === 'token_bucket') {
            return {
                capacity: this.tokenBucket.capacity,
                tokens: this.tokenBucket.capacity,
                refillRate: this.tokenBucket.refillRate,
                lastRefill: Date.now(),
                waitQueue: [],
                retryTimer: null
            };
        } else if (this.algorithm === 'leaky_bucket') {
            return {
                capacity: this.leakyBucket.capacity,
                water: 0,
                leakRate: this.leakyBucket.leakRate,
                lastLeak: Date.now(),
                waitQueue: [],
                retryTimer: null
            };
        } else if (this.algorithm === 'sliding_window') {
            return {
                windowSize: this.slidingWindow.windowSize,
                maxRequests: this.slidingWindow.maxRequests,
                requests: [],
                waitQueue: [],
                retryTimer: null
            };
        }
    }

    /**
     * 获取限流器状态
     */
    getStats(groupKey = null) {
        if (groupKey) {
            const limiter = this.groupLimits.get(groupKey);
            if (!limiter) return null;

            if (this.algorithm === 'token_bucket') {
                return {
                    group: groupKey,
                    algorithm: 'token_bucket',
                    tokens: limiter.tokens,
                    capacity: limiter.capacity,
                    waiting: limiter.waitQueue.length
                };
            } else if (this.algorithm === 'leaky_bucket') {
                return {
                    group: groupKey,
                    algorithm: 'leaky_bucket',
                    water: limiter.water,
                    capacity: limiter.capacity,
                    waiting: limiter.waitQueue.length
                };
            } else {
                return {
                    group: groupKey,
                    algorithm: 'sliding_window',
                    requestsInWindow: limiter.requests.length,
                    maxRequests: limiter.maxRequests,
                    waiting: limiter.waitQueue.length
                };
            }
        }

        // 返回所有分组的状态
        const stats = {};
        for (const [key, limiter] of this.groupLimits) {
            stats[key] = this.getStats(key);
        }
        return stats;
    }

    /**
     * 重置分组限流器
     */
    resetGroup(groupKey) {
        if (this.groupLimits.has(groupKey)) {
            const oldLimiter = this.groupLimits.get(groupKey);
            if (oldLimiter.retryTimer) {
                clearInterval(oldLimiter.retryTimer);
            }
            this.groupLimits.delete(groupKey);
        }
    }

    /**
     * 重置所有限流器
     */
    resetAll() {
        for (const [key] of this.groupLimits) {
            this.resetGroup(key);
        }
    }
}