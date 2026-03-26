import axios from 'axios';
import https from 'https';
import * as cheerio from 'cheerio';
import { EventEmitter } from 'events';

import PageResult from "./PageResult.js";
import RateLimiter from '../policy/RateLimiter.js';
import ProxyPool from '../policy/ProxyPool.js';
import CircuitBreaker from '../policy/CircuitBreaker.js';
import CacheManager from '../policy/CacheManager.js';
import RetryHandler from '../policy/RetryHandler.js';
import DelayManager from '../policy/DelayManager.js';

/**
 * 统一资源获取器
 * 集成：限流、代理池、熔断器、缓存、重试策略、动态延迟
 */
export default class ResourceFetcher extends EventEmitter {
    constructor(policyConfig, options = {}) {
        super();
        // 策略配置（已经合并好）
        this.policyConfig = policyConfig;

        // 基础配置
        this.browserManager = options.browserManager;
        this.authContext = options.authContext || null;
        this.timeout = options.timeout || 30000;
        this.userAgent = options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
        this.maxRetries = options.maxRetries || 3;
        this.retryDelay = options.retryDelay || 1000;

        // 根据策略初始化各模块
        this._initModulesFromPolicy();

        // HTTP 客户端配置
        this.httpClient = axios.create({
            timeout: this.timeout,
            httpsAgent: new https.Agent({
                rejectUnauthorized: false,
                keepAlive: true,
                maxSockets: 50
            }),
            maxRedirects: 5,
            validateStatus: (status) => status < 500,
            decompress: true
        });

        // 设置拦截器
        this._setupInterceptors();
    }

    _initModulesFromPolicy() {
        // 限流器
        if (this.policyConfig.rate_limit?.enabled !== false) {
            this.rateLimiter = new RateLimiter(this.policyConfig.rate_limit);
        }

        // 代理池
        if (this.policyConfig.proxy?.enabled) {
            this.proxyPool = new ProxyPool(this.policyConfig.proxy);
        }

        // 熔断器
        if (this.policyConfig.circuit_breaker?.enabled !== false) {
            this.circuitBreakers = new Map();
            this._initCircuitBreaker(this.policyConfig.circuit_breaker);
        }

        // 缓存管理器
        if (this.policyConfig.cache?.enabled !== false) {
            this.cacheManager = new CacheManager(this.policyConfig.cache);
        }

        // 重试处理器
        this.retryHandler = new RetryHandler(this.policyConfig.retry);

        // 延迟管理器
        if (this.policyConfig.delay) {
            this.delayManager = new DelayManager(this.policyConfig.delay);
        }

        // 其他配置
        this.timeout = this.policyConfig.timeout || 30000;
        this.userAgent = this.policyConfig.user_agent;
    }


    /**
     * 初始化熔断器（支持多组）
     */
    _initCircuitBreaker(cbConfig) {
        // 创建默认熔断器
        const defaultCB = new CircuitBreaker({
            name: 'default',
            ...cbConfig
        });
        this.circuitBreakers.set('default', defaultCB);

        // 监听熔断器事件
        defaultCB.on('open', (data) => this.emit('circuitBreakerOpen', data));
        defaultCB.on('close', (data) => this.emit('circuitBreakerClose', data));
        defaultCB.on('halfOpen', (data) => this.emit('circuitBreakerHalfOpen', data));

        // 按域名分组
        if (cbConfig.groups) {
            for (const [group, groupConfig] of Object.entries(cbConfig.groups)) {
                const groupCB = new CircuitBreaker({
                    name: group,
                    ...cbConfig,
                    ...groupConfig
                });
                this.circuitBreakers.set(group, groupCB);

                groupCB.on('open', (data) => this.emit('circuitBreakerOpen', data));
                groupCB.on('close', (data) => this.emit('circuitBreakerClose', data));
                groupCB.on('halfOpen', (data) => this.emit('circuitBreakerHalfOpen', data));
            }
        }
    }

    /**
     * 设置请求/响应拦截器
     */
    _setupInterceptors() {
        // 请求拦截器：自动添加认证信息
        this.httpClient.interceptors.request.use(config => {
            // 默认 User-Agent
            config.headers['User-Agent'] = config.headers['User-Agent'] || this.userAgent;

            // 自动添加认证信息
            if (this.authContext && this.authContext.isValid()) {
                const authHeaders = this.authContext.getHeaders();
                for (const [key, value] of Object.entries(authHeaders)) {
                    config.headers[key] = value;
                }

                // Cookie 特殊处理
                const cookieString = this.authContext.getCookieString();
                if (cookieString) {
                    config.headers['Cookie'] = cookieString;
                }
            }

            // 添加默认 Accept 头
            if (!config.headers['Accept']) {
                config.headers['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8';
            }
            if (!config.headers['Accept-Language']) {
                config.headers['Accept-Language'] = 'zh-CN,zh;q=0.9,en;q=0.8';
            }
            if (!config.headers['Accept-Encoding']) {
                config.headers['Accept-Encoding'] = 'gzip, deflate, br';
            }
            if (!config.headers['Connection']) {
                config.headers['Connection'] = 'keep-alive';
            }

            this.emit('request', { url: config.url, method: config.method, headers: config.headers });
            return config;
        });

        // 响应拦截器
        this.httpClient.interceptors.response.use(
            response => {
                this.emit('response', { url: response.config.url, status: response.status, size: response.data?.length });
                return response;
            },
            error => {
                this.emit('error', { url: error.config?.url, error: error.message });
                return Promise.reject(error);
            }
        );
    }

    /**
     * 更新认证上下文
     */
    setAuthContext(authContext) {
        this.authContext = authContext;
        this.emit('authUpdated', { type: authContext?.type, isValid: authContext?.isValid() });
    }

    /**
     * 获取页面内容（集成所有功能）
     */
    async fetch(url, options = {}) {
        const { dynamic = false, ...fetchOptions } = options;

        // 1. 获取对应的熔断器
        const cb = this._getCircuitBreaker(url);

        // 2. 定义实际执行函数
        const executeRequest = async () => {
            // 2.1 检查缓存
            if (this.cacheManager) {
                const cached = await this.cacheManager.get({ url, options: fetchOptions });
                if (cached) {
                    this.emit('cacheHit', { url });
                    return cached;
                }
            }

            // 2.2 应用延迟
            if (this.delayManager) {
                await this.delayManager.wait();
            }

            // 2.3 限流检查
            if (this.rateLimiter) {
                const groupKey = this._getRateLimitGroupKey(url);
                await this.rateLimiter.acquire(groupKey);
            }

            // 2.4 执行实际请求（带重试和代理）
            const result = await this._executeWithRetry(url, dynamic, fetchOptions);

            // 2.5 缓存结果
            if (this.cacheManager && this._shouldCache(result)) {
                await this.cacheManager.set({ url, options: fetchOptions }, result);
            }

            // 2.6 记录请求（用于自适应延迟）
            if (this.delayManager?.adaptive) {
                this.delayManager.recordRequest();
            }

            return result;
        };

        // 3. 定义降级函数
        const fallback = async () => {
            if (this.config.circuit_breaker?.fallback) {
                return await this._getFallbackResponse(url, fetchOptions);
            }
            throw new Error(`Circuit breaker open for ${url}`);
        };

        // 4. 使用熔断器执行（如果有）
        if (cb) {
            return await cb.execute(executeRequest, fallback);
        }

        // 5. 没有熔断器，直接执行
        return await executeRequest();
    }

    /**
     * 执行请求（带重试和代理）
     */
    async _executeWithRetry(url, dynamic, options) {
        const executor = async () => {
            if (this.proxyPool) {
                // 使用代理池执行
                return await this.proxyPool.executeWithProxy(
                    (proxy) => this._makeRequest(url, dynamic, options, proxy),
                    {
                        retryOnFail: this.config.proxy?.retry_on_fail !== false,
                        maxRetries: this.config.proxy?.max_retries || 3
                    }
                );
            } else {
                // 直接执行
                return await this._makeRequest(url, dynamic, options);
            }
        };

        return await this.retryHandler.execute(executor);
    }

    /**
     * 实际发起请求
     */
    async _makeRequest(url, dynamic, options, proxy = null) {
        const startTime = Date.now();

        if (dynamic) {
            return await this._fetchDynamic(url, options, proxy, startTime);
        }
        return await this._fetchStatic(url, options, proxy, startTime);
    }

    /**
     * 静态获取（HTTP 请求）
     */
    async _fetchStatic(url, options, proxy, startTime) {
        const {
            method = 'GET',
            headers = {},
            data,
            params,
            timeout = this.timeout,
            responseType = 'text',
            maxRedirects = 5
        } = options;

        // 配置代理
        let proxyConfig = null;
        if (proxy) {
            const [protocol, rest] = proxy.url.split('://');
            const [host, port] = rest.split(':');
            proxyConfig = {
                protocol: protocol || 'http',
                host: host,
                port: parseInt(port) || (protocol === 'https' ? 443 : 80)
            };
            if (proxy.auth) {
                proxyConfig.auth = proxy.auth;
            }
        }

        const requestConfig = {
            url,
            method,
            headers: { ...headers },
            params,
            data,
            timeout,
            proxy: proxyConfig,
            responseType,
            maxRedirects
        };

        const response = await this.httpClient.request(requestConfig);
        const html = response.data;
        const $ = cheerio.load(html);

        const duration = Date.now() - startTime;

        const result = new PageResult({
            url,
            html,
            $,
            statusCode: response.status,
            headers: response.headers,
            mode: 'static',
            duration,
            response,
            proxy: proxy?.url
        });

        this.emit('requestComplete', {
            url,
            mode: 'static',
            duration,
            status: response.status,
            proxy: proxy?.url
        });

        return result;
    }

    /**
     * 动态获取（Puppeteer）
     */
    async _fetchDynamic(url, options, proxy, startTime) {
        const page = await this.browserManager.getPage();

        try {
            // 设置代理（Puppeteer 代理需要通过启动参数）
            if (proxy && this.browserManager.setProxy) {
                await this.browserManager.setProxy(proxy);
            }

            // 设置认证信息
            if (this.authContext && this.authContext.isValid()) {
                if (this.authContext.type === 'cookie' && this.authContext.cookies.length) {
                    await page.setCookie(...this.authContext.cookies);
                }

                const headers = this.authContext.getHeaders();
                if (Object.keys(headers).length > 0) {
                    await page.setExtraHTTPHeaders(headers);
                }
            }

            // 设置视口
            if (options.viewport) {
                await page.setViewport(options.viewport);
            } else {
                await page.setViewport({ width: 1920, height: 1080 });
            }

            // 设置 User-Agent
            if (options.userAgent) {
                await page.setUserAgent(options.userAgent);
            } else {
                await page.setUserAgent(this.userAgent);
            }

            // 设置自定义 Headers
            if (options.headers) {
                await page.setExtraHTTPHeaders(options.headers);
            }

            // 设置超时
            const timeout = options.timeout || this.timeout;
            page.setDefaultTimeout(timeout);
            page.setDefaultNavigationTimeout(timeout);

            // 请求拦截（可选）
            if (options.blockResources) {
                await page.setRequestInterception(true);
                page.on('request', (request) => {
                    const resourceType = request.resourceType();
                    if (options.blockResources.includes(resourceType)) {
                        request.abort();
                    } else {
                        request.continue();
                    }
                });
            }

            // 访问页面
            await page.goto(url, {
                waitUntil: options.waitUntil || 'networkidle2',
                timeout: timeout
            });

            // 等待指定元素
            if (options.waitSelector) {
                await page.waitForSelector(options.waitSelector, {
                    timeout: options.waitTimeout || 10000,
                    visible: options.waitVisible !== false
                });
            }

            // 等待指定函数
            if (options.waitFunction) {
                await page.waitForFunction(options.waitFunction, {
                    timeout: options.waitTimeout || 10000
                });
            }

            // 执行交互动作
            if (options.actions) {
                await this._executeActions(page, options.actions);
            }

            // 自动滚动
            if (options.scroll) {
                await this._autoScroll(page, options.scroll);
            }

            // 获取 HTML
            const html = await page.content();
            const $ = cheerio.load(html);

            const duration = Date.now() - startTime;

            const result = new PageResult({
                url,
                html,
                $,
                page,
                mode: 'dynamic',
                duration,
                cookies: await page.cookies(),
                proxy: proxy?.url
            });

            this.emit('requestComplete', {
                url,
                mode: 'dynamic',
                duration,
                proxy: proxy?.url
            });

            return result;

        } finally {
            // 不关闭页面，复用
        }
    }

    /**
     * 执行交互动作
     */
    async _executeActions(page, actions) {
        for (const action of actions) {
            switch (action.type) {
                case 'click':
                    await page.click(action.selector);
                    if (action.waitAfter) {
                        await page.waitForTimeout(action.waitAfter);
                    }
                    break;

                case 'input':
                    await page.type(action.selector, action.value, {
                        delay: action.delay || 100
                    });
                    break;

                case 'select':
                    await page.select(action.selector, action.value);
                    break;

                case 'hover':
                    await page.hover(action.selector);
                    if (action.waitAfter) {
                        await page.waitForTimeout(action.waitAfter);
                    }
                    break;

                case 'wait':
                    await page.waitForTimeout(action.time || 1000);
                    break;

                case 'scroll':
                    await page.evaluate((x, y) => window.scrollTo(x, y), action.x || 0, action.y || 0);
                    break;

                case 'evaluate':
                    await page.evaluate(action.function, ...(action.args || []));
                    break;

                case 'screenshot':
                    const screenshot = await page.screenshot(action.options);
                    if (action.savePath) {
                        const fs = await import('fs-extra');
                        await fs.writeFile(action.savePath, screenshot);
                    }
                    break;
            }
        }
    }

    /**
     * 自动滚动
     */
    async _autoScroll(page, config) {
        const count = config.count || 5;
        const distance = config.distance || 1000;
        const wait = config.wait || 1000;

        for (let i = 0; i < count; i++) {
            await page.evaluate((d) => window.scrollBy(0, d), distance);
            await page.waitForTimeout(wait);

            const isBottom = await page.evaluate(() => {
                return window.scrollY + window.innerHeight >= document.body.scrollHeight - 100;
            });

            if (isBottom && config.stopOnBottom !== false) {
                break;
            }
        }
    }

    /**
     * 获取降级响应
     */
    async _getFallbackResponse(url, options) {
        const fallback = this.config.circuit_breaker.fallback;

        if (fallback.type === 'cache' && this.cacheManager) {
            // 从缓存获取过期数据
            const cached = await this.cacheManager.get({ url, options }, { allowStale: true });
            if (cached) {
                return {
                    ...cached,
                    fromFallback: true,
                    fallbackReason: 'circuit_breaker_open'
                };
            }
        } else if (fallback.type === 'static') {
            // 返回静态数据
            const html = fallback.value;
            const $ = cheerio.load(html);
            return new PageResult({
                url,
                html,
                $,
                mode: 'static',
                fromFallback: true,
                fallbackReason: 'circuit_breaker_open'
            });
        }

        return null;
    }

    /**
     * 获取熔断器
     */
    _getCircuitBreaker(url) {
        if (!this.circuitBreakers) return null;

        const groupBy = this.config.circuit_breaker?.group_by;

        if (groupBy === 'domain') {
            try {
                const urlObj = new URL(url);
                const hostname = urlObj.hostname;

                if (this.circuitBreakers.has(hostname)) {
                    return this.circuitBreakers.get(hostname);
                }
            } catch {
                // 忽略 URL 解析错误
            }
        }

        // 按 URL 模式匹配
        if (this.config.circuit_breaker?.groups) {
            for (const [group, groupConfig] of Object.entries(this.config.circuit_breaker.groups)) {
                if (groupConfig.pattern && new RegExp(groupConfig.pattern).test(url)) {
                    if (this.circuitBreakers.has(group)) {
                        return this.circuitBreakers.get(group);
                    }
                }
            }
        }

        return this.circuitBreakers.get('default');
    }

    /**
     * 获取限流分组键
     */
    _getRateLimitGroupKey(url) {
        const groupBy = this.config.rate_limit?.group_by || 'domain';

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

    /**
     * 判断是否应该缓存
     */
    _shouldCache(result) {
        return result && result.statusCode >= 200 && result.statusCode < 300;
    }

    /**
     * 批量获取多个 URL
     */
    async fetchAll(urls, options = {}) {
        const concurrency = options.concurrency || 5;
        const results = [];
        const queue = [...urls];

        const workers = [];
        for (let i = 0; i < concurrency; i++) {
            workers.push(this._worker(queue, results, options));
        }

        await Promise.all(workers);
        return results;
    }

    async _worker(queue, results, options) {
        while (queue.length > 0) {
            const url = queue.shift();
            if (!url) break;

            try {
                const result = await this.fetch(url, options);
                results.push({ url, success: true, result });
            } catch (error) {
                results.push({ url, success: false, error: error.message });
            }
        }
    }

    /**
     * 获取统计信息
     */
    getStats() {
        const stats = {
            circuitBreakers: {},
            cache: null,
            rateLimiter: null
        };

        if (this.circuitBreakers) {
            for (const [name, cb] of this.circuitBreakers.entries()) {
                stats.circuitBreakers[name] = cb.getStats();
            }
        }

        if (this.cacheManager) {
            stats.cache = this.cacheManager.getStats();
        }

        if (this.rateLimiter) {
            stats.rateLimiter = this.rateLimiter.getStats?.();
        }

        return stats;
    }

    /**
     * 重置熔断器
     */
    resetCircuitBreaker(name = 'default') {
        if (this.circuitBreakers && this.circuitBreakers.has(name)) {
            this.circuitBreakers.get(name).reset();
        }
    }

    /**
     * 关闭资源
     */
    async close() {
        if (this.proxyPool) {
            await this.proxyPool.close();
        }
        if (this.cacheManager) {
            await this.cacheManager.close();
        }
        if (this.circuitBreakers) {
            for (const cb of this.circuitBreakers.values()) {
                cb.stopMonitoring();
            }
        }
        this.removeAllListeners();
    }
}
