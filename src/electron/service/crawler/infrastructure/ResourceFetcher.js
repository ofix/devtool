// src/crawler/infrastructure/ResourceFetcher.js
import axios from 'axios';
import https from 'https';
import * as cheerio from 'cheerio';
import { EventEmitter } from 'events';

/**
 * 统一资源获取器
 * 支持静态页面（HTTP）和动态页面（Puppeteer）
 * 自动携带认证信息
 */
export default class ResourceFetcher extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.browserManager = options.browserManager;
        this.authContext = options.authContext || null;
        this.timeout = options.timeout || 30000;
        this.userAgent = options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
        this.maxRetries = options.maxRetries || 3;
        this.retryDelay = options.retryDelay || 1000;
        
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
     * 获取页面内容
     * @param {string} url - 目标 URL
     * @param {Object} options - 获取选项
     * @param {boolean} options.dynamic - 是否使用动态模式
     * @param {Object} options.headers - 自定义请求头
     * @param {number} options.timeout - 超时时间
     * @param {string} options.method - HTTP 方法（静态模式）
     * @param {Object} options.data - POST 数据（静态模式）
     * @param {Object} options.params - URL 参数（静态模式）
     * @param {Object} options.proxy - 代理配置
     * @param {number} options.retry - 重试次数
     * @param {Function} options.onRetry - 重试回调
     * @returns {Promise<PageResult>} 页面结果
     */
    async fetch(url, options = {}) {
        const { dynamic = false, retry = this.maxRetries, onRetry, ...fetchOptions } = options;
        
        let lastError;
        for (let attempt = 1; attempt <= retry; attempt++) {
            try {
                if (dynamic) {
                    return await this._fetchDynamic(url, fetchOptions);
                }
                return await this._fetchStatic(url, fetchOptions);
            } catch (error) {
                lastError = error;
                this.emit('fetchError', { url, attempt, error: error.message, dynamic });
                
                if (attempt < retry && this._isRetryableError(error)) {
                    const delay = this._calculateRetryDelay(attempt);
                    if (onRetry) onRetry(attempt, delay, error);
                    await this._delay(delay);
                    continue;
                }
                break;
            }
        }
        
        throw lastError;
    }
    
    /**
     * 静态获取（HTTP 请求）
     */
    async _fetchStatic(url, options = {}) {
        const startTime = Date.now();
        const {
            method = 'GET',
            headers = {},
            data,
            params,
            timeout = this.timeout,
            proxy,
            responseType = 'text',
            maxRedirects = 5
        } = options;
        
        const requestConfig = {
            url,
            method,
            headers: { ...headers },
            params,
            data,
            timeout,
            proxy,
            responseType,
            maxRedirects
        };
        
        const response = await this.httpClient.request(requestConfig);
        const html = response.data;
        const $ = cheerio.load(html);
        
        const duration = Date.now() - startTime;
        
        return new PageResult({
            url,
            html,
            $,
            statusCode: response.status,
            headers: response.headers,
            mode: 'static',
            duration,
            response
        });
    }
    
    /**
     * 动态获取（Puppeteer）
     */
    async _fetchDynamic(url, options = {}) {
        const startTime = Date.now();
        const page = await this.browserManager.getPage();
        
        try {
            // 设置认证信息
            if (this.authContext && this.authContext.isValid()) {
                // 设置 Cookies
                if (this.authContext.type === 'cookie' && this.authContext.cookies.length) {
                    await page.setCookie(...this.authContext.cookies);
                }
                
                // 设置 Headers
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
            
            return new PageResult({
                url,
                html,
                $,
                page,
                mode: 'dynamic',
                duration,
                cookies: await page.cookies()
            });
            
        } finally {
            // 不关闭页面，复用
            // await page.close();
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
            
            // 检查是否到底
            const isBottom = await page.evaluate(() => {
                return window.scrollY + window.innerHeight >= document.body.scrollHeight - 100;
            });
            
            if (isBottom && config.stopOnBottom !== false) {
                break;
            }
        }
    }
    
    /**
     * 判断错误是否可重试
     */
    _isRetryableError(error) {
        const retryableMessages = [
            'timeout',
            'network',
            'ECONNRESET',
            'ECONNREFUSED',
            'ETIMEDOUT',
            'socket hang up',
            '503',
            '502',
            '504'
        ];
        
        const message = error.message?.toLowerCase() || '';
        return retryableMessages.some(msg => message.includes(msg));
    }
    
    /**
     * 计算重试延迟（指数退避）
     */
    _calculateRetryDelay(attempt) {
        return Math.min(Math.pow(2, attempt) * this.retryDelay, 30000);
    }
    
    /**
     * 延迟函数
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
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
     * 关闭资源
     */
    async close() {
        // HTTP 客户端无需关闭
        this.removeAllListeners();
    }
}

/**
 * 页面结果类
 */
class PageResult {
    constructor(options) {
        this.url = options.url;
        this.html = options.html;
        this.$ = options.$;
        this.page = options.page;           // 仅动态模式
        this.mode = options.mode;           // 'static' | 'dynamic'
        this.statusCode = options.statusCode;
        this.headers = options.headers;
        this.duration = options.duration;
        this.cookies = options.cookies || [];
        this.response = options.response;
    }
    
    /**
     * 获取元素文本
     */
    text(selector) {
        return this.$(selector).text().trim();
    }
    
    /**
     * 获取元素属性
     */
    attr(selector, name) {
        return this.$(selector).attr(name);
    }
    
    /**
     * 获取元素 HTML
     */
    html(selector) {
        return this.$(selector).html();
    }
    
    /**
     * 获取单个元素
     */
    querySelector(selector) {
        return this.$(selector).get(0);
    }
    
    /**
     * 获取多个元素
     */
    querySelectorAll(selector) {
        return this.$(selector).toArray();
    }
    
    /**
     * 等待选择器（仅动态模式）
     */
    async waitForSelector(selector, options) {
        if (this.mode === 'dynamic' && this.page) {
            return await this.page.waitForSelector(selector, options);
        }
        return true;
    }
    
    /**
     * 等待导航（仅动态模式）
     */
    async waitForNavigation(options) {
        if (this.mode === 'dynamic' && this.page) {
            return await this.page.waitForNavigation(options);
        }
        return true;
    }
    
    /**
     * 等待超时（仅动态模式）
     */
    async waitForTimeout(ms) {
        if (this.mode === 'dynamic' && this.page) {
            return await this.page.waitForTimeout(ms);
        }
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * 执行 JavaScript（仅动态模式）
     */
    async evaluate(fn, ...args) {
        if (this.mode === 'dynamic' && this.page) {
            return await this.page.evaluate(fn, ...args);
        }
        return fn(...args);
    }
    
    /**
     * 截图（仅动态模式）
     */
    async screenshot(options) {
        if (this.mode === 'dynamic' && this.page) {
            return await this.page.screenshot(options);
        }
        throw new Error('Screenshot only available in dynamic mode');
    }
    
    /**
     * 获取 Cookie（仅动态模式）
     */
    async getCookies() {
        if (this.mode === 'dynamic' && this.page) {
            return await this.page.cookies();
        }
        return this.cookies;
    }
    
    /**
     * 是否动态模式
     */
    isDynamic() {
        return this.mode === 'dynamic';
    }
    
    /**
     * 是否静态模式
     */
    isStatic() {
        return this.mode === 'static';
    }
}