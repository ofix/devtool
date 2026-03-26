// 重试处理器
export default class RetryHandler {
    constructor(config) {
        this.config = config;
        this.maxAttempts = config.maxAttempts || 3;
        this.backoff = config.backoff || 'exponential';
        this.delay = config.delay || 1000;
        this.maxDelay = config.maxDelay || 30000;
        this.factor = config.factor || 2;
        this.retryOnStatus = config.retryOnStatus || [500, 502, 503, 504];
        this.retryOnErrors = config.retryOnErrors || ['ECONNRESET', 'ETIMEDOUT'];
    }
    
    async execute(fn, context = {}) {
        let lastError = null;
        let attempt = 0;
        
        while (attempt < this.maxAttempts) {
            attempt++;
            
            try {
                const result = await fn();
                return result;
            } catch (error) {
                lastError = error;
                
                if (!this.shouldRetry(error, attempt)) {
                    throw error;
                }
                
                const delay = this.calculateDelay(attempt);
                console.log(`Retry attempt ${attempt}/${this.maxAttempts} after ${delay}ms: ${error.message}`);
                
                await this.sleep(delay);
            }
        }
        
        throw lastError;
    }
    
    shouldRetry(error, attempt) {
        // 达到最大重试次数
        if (attempt >= this.maxAttempts) {
            return false;
        }
        
        // 检查错误码
        if (error.code && this.retryOnErrors.includes(error.code)) {
            return true;
        }
        
        // 检查HTTP状态码
        if (error.response && this.retryOnStatus.includes(error.response.status)) {
            return true;
        }
        
        // 检查超时
        if (this.config.retryOnTimeout && error.code === 'ETIMEDOUT') {
            return true;
        }
        
        return false;
    }
    
    calculateDelay(attempt) {
        let delay = this.delay;
        
        if (this.backoff === 'linear') {
            delay = this.delay * attempt;
        } else if (this.backoff === 'exponential') {
            delay = this.delay * Math.pow(this.factor, attempt - 1);
        }
        
        // 添加随机抖动，避免雷群效应
        delay = delay * (0.5 + Math.random() * 0.5);
        
        return Math.min(delay, this.maxDelay);
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}