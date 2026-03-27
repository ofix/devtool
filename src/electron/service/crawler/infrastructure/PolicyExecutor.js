// src/crawler/policy/PolicyExecutor.js

/**
 * 策略执行器
 * 负责按顺序执行各个策略
 */
export default class PolicyExecutor {
    constructor(policies = []) {
        this.policies = policies;
        this.retryPolicy = policies.find(p => p.getName() === 'retry');
    }
    
    /**
     * 执行策略链
     * @param {Object} context - 执行上下文
     * @param {Function} fn - 实际执行函数
     * @returns {Promise<any>}
     */
    async execute(context, fn) {
        // 1. 过滤需要执行的策略
        const activePolicies = this.policies.filter(p => p.shouldExecute(context));
        
        // 2. 如果有重试策略，包装执行函数
        let executeFn = fn;
        if (this.retryPolicy && this.retryPolicy.shouldExecute(context)) {
            executeFn = async () => {
                return await this.retryPolicy.executeWithRetry(fn, context);
            };
        }
        
        // 3. 执行前钩子
        for (const policy of activePolicies) {
            try {
                await policy.before(context);
            } catch (error) {
                // 特殊处理缓存命中
                if (error.message === 'CACHE_HIT' && error.cacheResult) {
                    return error.cacheResult;
                }
                // 其他错误，进入错误处理流程
                await this._handleError(activePolicies, context, error);
                throw error;
            }
        }
        
        // 4. 执行实际函数
        let result;
        try {
            result = await executeFn();
        } catch (error) {
            await this._handleError(activePolicies, context, error);
            throw error;
        }
        
        // 5. 执行后钩子
        for (const policy of activePolicies) {
            await policy.after(context, result);
        }
        
        return result;
    }
    
    /**
     * 错误处理
     */
    async _handleError(policies, context, error) {
        for (const policy of policies) {
            await policy.onError(context, error);
        }
    }
    
    /**
     * 获取统计信息
     */
    getStats() {
        const stats = {};
        for (const policy of this.policies) {
            if (policy.getStats) {
                stats[policy.getName()] = policy.getStats();
            }
        }
        return stats;
    }
    
    /**
     * 添加策略
     */
    addPolicy(policy) {
        this.policies.push(policy);
        if (policy.getName() === 'retry') {
            this.retryPolicy = policy;
        }
    }
    
    /**
     * 移除策略
     */
    removePolicy(name) {
        const index = this.policies.findIndex(p => p.getName() === name);
        if (index !== -1) {
            this.policies.splice(index, 1);
            if (name === 'retry') {
                this.retryPolicy = null;
            }
        }
    }
}