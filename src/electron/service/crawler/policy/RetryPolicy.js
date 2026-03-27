// src/crawler/policy/policies/RetryPolicy.js
import PolicyInterface from './PolicyInterface.js';
import RetryHandler from './RetryHandler.js';

export default class RetryPolicy extends PolicyInterface {
    constructor(config) {
        super();
        this.config = config;
        this.retryHandler = new RetryHandler(config);
    }
    
    getName() {
        return 'retry';
    }
    
    async before(context) {
        // 重试策略需要包装执行函数
        // 这里我们返回一个标记，让 PolicyExecutor 知道需要包装
        context.needsRetryWrapper = true;
    }
    
    async executeWithRetry(fn, context) {
        return await this.retryHandler.execute(fn);
    }
}