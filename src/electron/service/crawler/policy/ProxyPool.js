// IP代理池
import axios from 'axios';

export default class ProxyPool {
    constructor(config) {
        this.config = config;
        this.proxies = [];
        this.currentIndex = 0;
        this.healthStatus = new Map();
        
        if (config.type === 'static' && config.url) {
            this.proxies = [{ url: config.url, auth: null }];
        } else if (config.type === 'pool' && config.pool) {
            this.initPool();
        } else if (config.type === 'api' && config.api) {
            this.initApiProxy();
        }
        
        // 启动健康检查
        if (config.pool?.health_check !== false) {
            this.startHealthCheck();
        }
    }
    
    initPool() {
        const pool = this.config.pool;
        this.proxies = pool.urls.map(url => ({
            url,
            auth: pool.auth,
            failedCount: 0,
            lastUsed: null,
            responseTime: null
        }));
    }
    
    async initApiProxy() {
        await this.refreshFromApi();
        // 定期刷新
        const interval = this.config.api.refresh_interval || 300;
        setInterval(() => this.refreshFromApi(), interval * 1000);
    }
    
    async refreshFromApi() {
        try {
            const api = this.config.api;
            const response = await axios({
                method: api.method || 'GET',
                url: api.url,
                headers: api.headers || {},
                timeout: 10000
            });
            
            const proxyList = this.extractProxies(response.data, api.response_path);
            this.proxies = proxyList.map(proxy => ({
                url: proxy,
                auth: null,
                failedCount: 0,
                lastUsed: null
            }));
            
            console.log(`Proxy pool refreshed, got ${this.proxies.length} proxies`);
        } catch (error) {
            console.error('Failed to refresh proxy pool:', error.message);
        }
    }
    
    extractProxies(data, path) {
        if (!path) return [data];
        
        const keys = path.split('.');
        let result = data;
        for (const key of keys) {
            result = result?.[key];
            if (!result) break;
        }
        
        return Array.isArray(result) ? result : [result];
    }
    
    async getProxy() {
        if (this.proxies.length === 0) {
            return null;
        }
        
        // 根据轮换策略选择代理
        let proxy = null;
        
        switch (this.config.rotation) {
            case 'round_robin':
                proxy = this.getRoundRobin();
                break;
            case 'random':
                proxy = this.getRandom();
                break;
            case 'least_used':
                proxy = this.getLeastUsed();
                break;
            default:
                proxy = this.getRoundRobin();
        }
        
        if (proxy) {
            proxy.lastUsed = Date.now();
        }
        
        return proxy;
    }
    
    getRoundRobin() {
        if (this.proxies.length === 0) return null;
        this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
        return this.proxies[this.currentIndex];
    }
    
    getRandom() {
        const validProxies = this.proxies.filter(p => this.isHealthy(p));
        if (validProxies.length === 0) return null;
        const randomIndex = Math.floor(Math.random() * validProxies.length);
        return validProxies[randomIndex];
    }
    
    getLeastUsed() {
        const validProxies = this.proxies.filter(p => this.isHealthy(p));
        if (validProxies.length === 0) return null;
        
        return validProxies.reduce((min, p) => {
            return (!min || (p.failedCount || 0) < (min.failedCount || 0)) ? p : min;
        }, null);
    }
    
    isHealthy(proxy) {
        const status = this.healthStatus.get(proxy.url);
        if (!status) return true;
        
        // 如果失败次数过多，标记为不健康
        if (proxy.failedCount > 3) return false;
        
        // 检查最后失败时间，如果超过5分钟则恢复
        if (status.lastFail && Date.now() - status.lastFail > 300000) {
            proxy.failedCount = 0;
            return true;
        }
        
        return proxy.failedCount <= 3;
    }
    
    markSuccess(proxy) {
        if (!proxy) return;
        proxy.failedCount = 0;
        this.healthStatus.set(proxy.url, {
            success: true,
            lastSuccess: Date.now()
        });
    }
    
    markFailure(proxy) {
        if (!proxy) return;
        proxy.failedCount = (proxy.failedCount || 0) + 1;
        this.healthStatus.set(proxy.url, {
            success: false,
            lastFail: Date.now(),
            failCount: proxy.failedCount
        });
    }
    
    startHealthCheck() {
        const interval = this.config.pool?.health_check_interval || 300;
        
        setInterval(async () => {
            for (const proxy of this.proxies) {
                await this.checkProxyHealth(proxy);
            }
        }, interval * 1000);
    }
    
    async checkProxyHealth(proxy) {
        try {
            const startTime = Date.now();
            await axios.get('http://httpbin.org/ip', {
                proxy: {
                    host: proxy.url.split('://')[1].split(':')[0],
                    port: parseInt(proxy.url.split(':')[2] || '80')
                },
                timeout: 5000
            });
            proxy.responseTime = Date.now() - startTime;
            this.markSuccess(proxy);
        } catch (error) {
            this.markFailure(proxy);
        }
    }
    
    async retryWithNewProxy(fn, maxRetries = 3) {
        let lastError = null;
        
        for (let i = 0; i < maxRetries; i++) {
            const proxy = await this.getProxy();
            
            if (!proxy) {
                await this.sleep(1000);
                continue;
            }
            
            try {
                const result = await fn(proxy);
                this.markSuccess(proxy);
                return result;
            } catch (error) {
                lastError = error;
                this.markFailure(proxy);
                
                if (this.config.retry_on_fail === false) {
                    break;
                }
            }
        }
        
        throw lastError || new Error('All proxies failed');
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}