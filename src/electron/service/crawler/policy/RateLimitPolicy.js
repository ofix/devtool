// src/crawler/policy/policies/RateLimitPolicy.js
import PolicyInterface from './PolicyInterface.js';
import RateLimiter from './RateLimiter.js';

export default class RateLimitPolicy extends PolicyInterface {
    constructor(config) {
        super();
        this.config = config;
        this.rateLimiter = new RateLimiter(config);
    }
    
    getName() {
        return 'rateLimit';
    }
    
    shouldExecute(context) {
        return this.config.enabled !== false;
    }
    
    async before(context) {
        const groupKey = this._getGroupKey(context.url);
        await this.rateLimiter.acquire(groupKey);
    }
    
    _getGroupKey(url) {
        const groupBy = this.config.group_by || 'domain';
        
        if (groupBy === 'domain') {
            try {
                const urlObj = new URL(url);
                return urlObj.hostname;
            } catch {
                return 'default';
            }
        } else if (groupBy === 'url') {
            return url;
        }
        return 'default';
    }
    
    getStats() {
        return this.rateLimiter.getStats();
    }
}