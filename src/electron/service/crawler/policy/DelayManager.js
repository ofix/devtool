// 请求延迟策略
export default class DelayManager {
    constructor(config) {
        this.config = config;
        this.type = config.type || 'fixed';
        this.value = config.value || 1000;
        this.min = config.min;
        this.max = config.max;
        
        // 自适应调整
        if (config.adaptive?.enabled) {
            this.adaptive = {
                targetRate: config.adaptive.targetRate,
                adjustmentFactor: config.adaptive.adjustmentFactor || 0.1,
                currentDelay: this.value,
                requestCount: 0,
                startTime: Date.now()
            };
        }
    }
    
    async wait() {
        const delay = this.calculateDelay();
        
        if (this.adaptive) {
            this.updateAdaptiveStats();
        }
        
        return new Promise(resolve => setTimeout(resolve, delay));
    }
    
    calculateDelay() {
        if (this.type === 'fixed') {
            return this.value;
        } else if (this.type === 'random') {
            const min = this.min || this.value * 0.5;
            const max = this.max || this.value * 1.5;
            return min + Math.random() * (max - min);
        } else if (this.type === 'adaptive' && this.adaptive) {
            return this.adaptive.currentDelay;
        }
        
        return this.value;
    }
    
    updateAdaptiveStats() {
        const now = Date.now();
        const elapsed = (now - this.adaptive.startTime) / 1000;
        
        if (elapsed >= 1) {
            const currentRate = this.adaptive.requestCount / elapsed;
            const targetRate = this.adaptive.targetRate;
            
            // 根据当前速率调整延迟
            if (currentRate > targetRate) {
                // 速率过快，增加延迟
                const increase = this.adaptive.currentDelay * this.adaptive.adjustmentFactor;
                this.adaptive.currentDelay = Math.min(
                    this.adaptive.currentDelay + increase,
                    this.max || Infinity
                );
            } else if (currentRate < targetRate * 0.8) {
                // 速率过慢，减少延迟
                const decrease = this.adaptive.currentDelay * this.adaptive.adjustmentFactor;
                this.adaptive.currentDelay = Math.max(
                    this.adaptive.currentDelay - decrease,
                    this.min || 0
                );
            }
            
            // 重置统计
            this.adaptive.requestCount = 0;
            this.adaptive.startTime = now;
        }
        
        this.adaptive.requestCount++;
    }
    
    recordRequest() {
        if (this.adaptive) {
            this.adaptive.requestCount++;
        }
    }
}