// src/crawler/policy/policies/ProxyPolicy.js
import PolicyInterface from './PolicyInterface.js';
import ProxyPool from './ProxyPool.js';

export default class ProxyPolicy extends PolicyInterface {
    constructor(config) {
        super();
        this.config = config;
        this.proxyPool = new ProxyPool(config);
    }
    
    getName() {
        return 'proxy';
    }
    
    shouldExecute(context) {
        return this.config.enabled !== false;
    }
    
    async before(context) {
        context.proxy = await this.proxyPool.getProxy();
    }
    
    async after(context, result) {
        if (context.proxy) {
            this.proxyPool.markSuccess(context.proxy);
        }
    }
    
    async onError(context, error) {
        if (context.proxy) {
            this.proxyPool.markFailure(context.proxy);
        }
    }
    
    getStats() {
        return this.proxyPool.getStats();
    }
}