// src/crawler/infrastructure/ResourceFetcher.js
import axios from 'axios';
import https from 'https';
import * as cheerio from 'cheerio';
import { EventEmitter } from 'events';

import PageResult from './PageResult.js';
import PolicyExecutor from '../policy/PolicyExecutor.js';
import CachePolicy from '../policy/policies/CachePolicy.js';
import DelayPolicy from '../policy/policies/DelayPolicy.js';
import RateLimitPolicy from '../policy/policies/RateLimitPolicy.js';
import ProxyPolicy from '../policy/policies/ProxyPolicy.js';
import CircuitBreakerPolicy from '../policy/policies/CircuitBreakerPolicy.js';
import RetryPolicy from '../policy/policies/RetryPolicy.js';
import CacheManager from '../policy/CacheManager.js';

/**
 * 统一资源获取器
 * 职责：只负责 HTTP 请求，策略由 PolicyExecutor 管理
 */
export default class ResourceFetcher extends EventEmitter {
    constructor(policyConfig, options = {}) {
        super();

        this.policyConfig = policyConfig;
        this.browserManager = options.browserManager;
        this.authContext = options.authContext || null;
        this.timeout = policyConfig.timeout || options.timeout || 30000;
        this.userAgent = policyConfig.user_agent || options.userAgent || 'Mozilla/5.0...';

        // 创建策略执行器
        this.policyExecutor = this._createPolicyExecutor(policyConfig);

        // HTTP 客户端
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

        // 事件转发
        this._setupEventForwarding();
    }

    /**
     * 创建策略执行器
     */
    _createPolicyExecutor(policyConfig) {
        const policies = [];

        // 缓存策略
        if (policyConfig.cache?.enabled !== false) {
            const cachePolicy = new CachePolicy(policyConfig.cache);
            const cacheManager = new CacheManager(policyConfig.cache);
            cachePolicy.setCacheManager(cacheManager);
            policies.push(cachePolicy);
        }

        // 延迟策略
        if (policyConfig.delay) {
            policies.push(new DelayPolicy(policyConfig.delay));
        }

        // 限流策略
        if (policyConfig.rate_limit?.enabled !== false) {
            policies.push(new RateLimitPolicy(policyConfig.rate_limit));
        }

        // 代理策略
        if (policyConfig.proxy?.enabled) {
            policies.push(new ProxyPolicy(policyConfig.proxy));
        }

        // 熔断策略
        if (policyConfig.circuit_breaker?.enabled !== false) {
            policies.push(new CircuitBreakerPolicy(policyConfig.circuit_breaker));
        }

        // 重试策略（总是有，但可以配置）
        const retryConfig = policyConfig.retry || { max_attempts: 3 };
        policies.push(new RetryPolicy(retryConfig));

        return new PolicyExecutor(policies);
    }

    /**
     * 设置请求拦截器
     */
    _setupInterceptors() {
        this.httpClient.interceptors.request.use(config => {
            config.headers['User-Agent'] = config.headers['User-Agent'] || this.userAgent;

            if (this.authContext && this.authContext.isValid()) {
                const authHeaders = this.authContext.getHeaders();
                for (const [key, value] of Object.entries(authHeaders)) {
                    config.headers[key] = value;
                }

                const cookieString = this.authContext.getCookieString();
                if (cookieString) {
                    config.headers['Cookie'] = cookieString;
                }
            }

            this.emit('request', { url: config.url, method: config.method });
            return config;
        });

        this.httpClient.interceptors.response.use(
            response => {
                this.emit('response', {
                    url: response.config.url,
                    status: response.status,
                    size: response.data?.length
                });
                return response;
            },
            error => {
                this.emit('error', { url: error.config?.url, error: error.message });
                return Promise.reject(error);
            }
        );
    }

    /**
     * 设置事件转发
     */
    _setupEventForwarding() {
        // 这里可以转发策略内部的事件
    }

    /**
     * 获取页面内容
     */
    async fetch(url, options = {}) {
        const context = {
            url,
            options: { ...options },
            proxy: null,
            cached: false,
            cacheResult: null,
            startTime: Date.now()
        };

        // 使用策略执行器执行
        const result = await this.policyExecutor.execute(context, async () => {
            return await this._doRequest(context);
        });

        return result;
    }

    /**
     * 实际执行请求
     */
    async _doRequest(context) {
        const { url, options, proxy } = context;
        const { dynamic = false, ...fetchOptions } = options;

        if (dynamic) {
            return await this._fetchDynamic(url, fetchOptions, proxy);
        }
        return await this._fetchStatic(url, fetchOptions, proxy);
    }

    /**
     * 静态请求
     */
    async _fetchStatic(url, options, proxy) {
        const startTime = Date.now();
        const {
            method = 'GET',
            headers = {},
            data,
            params,
            timeout = this.timeout,
            responseType = 'text'
        } = options;

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

        const response = await this.httpClient.request({
            url,
            method,
            headers: { ...headers },
            params,
            data,
            timeout,
            proxy: proxyConfig,
            responseType
        });

        const html = response.data;
        const $ = cheerio.load(html);

        const result = new PageResult({
            url,
            html,
            $,
            statusCode: response.status,
            headers: response.headers,
            mode: 'static',
            duration: Date.now() - startTime,
            response,
            proxy: proxy?.url
        });

        this.emit('requestComplete', {
            url,
            mode: 'static',
            duration: result.duration,
            status: response.status,
            proxy: proxy?.url
        });

        return result;
    }

    /**
     * 动态请求（Puppeteer）
     */
    async _fetchDynamic(url, options, proxy) {
        const startTime = Date.now();
        const page = await this.browserManager.getPage();

        try {
            if (proxy && this.browserManager.setProxy) {
                await this.browserManager.setProxy(proxy);
            }

            if (this.authContext && this.authContext.isValid()) {
                if (this.authContext.type === 'cookie' && this.authContext.cookies.length) {
                    await page.setCookie(...this.authContext.cookies);
                }

                const headers = this.authContext.getHeaders();
                if (Object.keys(headers).length > 0) {
                    await page.setExtraHTTPHeaders(headers);
                }
            }

            await page.setViewport(options.viewport || { width: 1920, height: 1080 });
            await page.setUserAgent(options.userAgent || this.userAgent);

            const timeout = options.timeout || this.timeout;
            page.setDefaultTimeout(timeout);

            await page.goto(url, {
                waitUntil: options.waitUntil || 'networkidle2',
                timeout
            });

            if (options.waitSelector) {
                await page.waitForSelector(options.waitSelector, {
                    timeout: options.waitTimeout || 10000
                });
            }

            if (options.actions) {
                await this._executeActions(page, options.actions);
            }

            if (options.scroll) {
                await this._autoScroll(page, options.scroll);
            }

            const html = await page.content();
            const $ = cheerio.load(html);

            const result = new PageResult({
                url,
                html,
                $,
                page,
                mode: 'dynamic',
                duration: Date.now() - startTime,
                cookies: await page.cookies(),
                proxy: proxy?.url
            });

            this.emit('requestComplete', {
                url,
                mode: 'dynamic',
                duration: result.duration,
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
                case 'wait':
                    await page.waitForTimeout(action.time || 1000);
                    break;
                case 'scroll':
                    await page.evaluate((x, y) => window.scrollTo(x, y), action.x || 0, action.y || 0);
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
     * 批量获取
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
        return this.policyExecutor.getStats();
    }

    /**
     * 更新认证上下文
     */
    setAuthContext(authContext) {
        this.authContext = authContext;
        this.emit('authUpdated', { type: authContext?.type });
    }

    /**
     * 关闭资源
     */
    async close() {
        this.removeAllListeners();
    }
}