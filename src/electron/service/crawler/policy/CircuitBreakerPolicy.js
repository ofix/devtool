// src/crawler/policy/policies/CircuitBreakerPolicy.js
import PolicyInterface from './PolicyInterface.js';
import CircuitBreaker from './CircuitBreaker.js';

export default class CircuitBreakerPolicy extends PolicyInterface {
    constructor(config) {
        super();
        this.config = config;
        this.breakers = new Map();
    }
    
    getName() {
        return 'circuitBreaker';
    }
    
    _getBreaker(url) {
        const groupBy = this.config.group_by;
        let key = 'default';
        
        if (groupBy === 'domain') {
            try {
                const urlObj = new URL(url);
                key = urlObj.hostname;
            } catch {}
        } else if (groupBy === 'pattern' && this.config.groups) {
            for (const [group, groupConfig] of Object.entries(this.config.groups)) {
                if (groupConfig.pattern && new RegExp(groupConfig.pattern).test(url)) {
                    key = group;
                    break;
                }
            }
        }
        
        if (!this.breakers.has(key)) {
            const breakerConfig = {
                name: key,
                ...this.config,
                ...(this.config.groups?.[key] || {})
            };
            this.breakers.set(key, new CircuitBreaker(breakerConfig));
        }
        
        return this.breakers.get(key);
    }
    
    async before(context) {
        const breaker = this._getBreaker(context.url);
        context.circuitBreaker = breaker;
        
        if (breaker.isOpen()) {
            const error = new Error(`Circuit breaker open for ${context.url}`);
            error.circuitBreakerOpen = true;
            throw error;
        }
    }
    
    async after(context, result) {
        if (context.circuitBreaker) {
            context.circuitBreaker.recordSuccess();
        }
    }
    
    async onError(context, error) {
        if (context.circuitBreaker && !error.circuitBreakerOpen) {
            context.circuitBreaker.recordFailure(error);
        }
    }
    
    getStats() {
        const stats = {};
        for (const [key, breaker] of this.breakers) {
            stats[key] = breaker.getStats();
        }
        return stats;
    }
}