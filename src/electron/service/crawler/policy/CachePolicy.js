// src/crawler/policy/policies/CachePolicy.js
import PolicyInterface from './PolicyInterface.js';

export default class CachePolicy extends PolicyInterface {
    constructor(config) {
        super();
        this.config = config;
        this.name = 'cache';
        this.cacheManager = null;
    }
    
    getName() {
        return 'cache';
    }
    
    setCacheManager(cacheManager) {
        this.cacheManager = cacheManager;
    }
    
    async before(context) {
        if (!this.cacheManager) return;
        
        const cached = await this.cacheManager.get({
            url: context.url,
            options: context.options
        });
        
        if (cached) {
            context.cached = true;
            context.cacheResult = cached;
            // 抛出特殊错误，跳过后续执行
            const error = new Error('CACHE_HIT');
            error.cacheResult = cached;
            throw error;
        }
    }
    
    async after(context, result) {
        if (!this.cacheManager || context.cached) return;
        
        if (result.statusCode >= 200 && result.statusCode < 300) {
            await this.cacheManager.set({
                url: context.url,
                options: context.options
            }, result);
        }
    }
}