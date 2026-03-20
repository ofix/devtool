import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import EventEmitter from 'events';
import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import PaginationAdapter from './adapters/PaginationAdapter.js';
import DownloadAdapter from './adapters/DownloadAdapter.js';
import AntiSpiderHandler from './handlers/AntiSpiderHandler.js';

// 使用隐身插件绕过反爬检测
puppeteer.use(StealthPlugin());

/**
 * 基础爬虫类 - 所有爬虫的基类
 * 采用模板方法模式，定义爬取流程骨架
 * 支持登录、反爬、熔断、增量爬取等特性
 */
export default class BaseCrawler extends EventEmitter {
    /**
     * 构造函数
     * @param {Object} config - 爬虫配置
     * @param {Object} options - 依赖注入选项
     */
    constructor(config, options = {}) {
        super();

        // 配置信息
        this.config = config;
        this.options = options;

        // 依赖注入的服务
        this.authManager = options.authManager;           // 认证管理器
        this.queueManager = options.queueManager;         // 队列管理器
        this.circuitBreaker = options.circuitBreaker;     // 熔断器
        this.incrementalManager = options.incrementalManager; // 增量管理器
        this.downloadManager = options.downloadManager;   // 下载管理器

        // 反爬处理器
        this.antiSpiderHandler = new AntiSpiderHandler(config.antiSpider);

        // 浏览器实例
        this.browser = null;
        this.page = null;

        // 运行状态
        this.isRunning = false;      // 是否运行中
        this.isPaused = false;       // 是否暂停
        this.currentTask = null;     // 当前任务

        // 统计信息
        this.stats = {
            processed: 0,              // 已处理数量
            success: 0,               // 成功数量
            failed: 0,                // 失败数量
            downloaded: 0,            // 下载数量
            totalSize: 0,             // 总大小(字节)
            startTime: null,          // 开始时间
            endTime: null,            // 结束时间
            currentItem: null,        // 当前处理项
            currentUrl: null          // 当前URL
        };
    }

    /**
     * 初始化浏览器和页面
     */
    async initialize() {
        // 配置浏览器启动参数
        const launchOptions = {
            headless: this.config.headless !== false,
            args: [
                '--no-sandbox',                                    // 禁用沙箱
                '--disable-setuid-sandbox',                        // 禁用setuid沙箱
                '--disable-blink-features=AutomationControlled',   // 禁用自动化控制特征
                '--disable-web-security',                          // 禁用web安全（解决跨域）
                '--disable-features=IsolateOrigins,site-per-process', // 禁用站点隔离
                '--disable-dev-shm-usage',                         // 避免/dev/shm不足
                '--disable-accelerated-2d-canvas',                 // 禁用2D加速
                '--disable-gpu'                                    // 禁用GPU加速
            ]
        };

        // 配置代理
        if (this.config.proxy) {
            launchOptions.args.push(`--proxy-server=${this.config.proxy}`);
        }

        // 启动浏览器
        this.browser = await puppeteer.launch(launchOptions);
        this.page = await this.browser.newPage();

        // 设置页面拦截器
        await this.setupPageInterceptors();

        // 应用反爬措施
        await this.applyAntiSpiderMeasures();

        // 处理登录（如果需要）
        if (this.config.login && this.config.login.enabled) {
            await this.handleLogin();
        }
    }

    /**
     * 设置页面拦截器（请求拦截、响应处理等）
     */
    async setupPageInterceptors() {
        // 随机User-Agent
        const userAgent = this.antiSpiderHandler.getRandomUserAgent();
        await this.page.setUserAgent(userAgent);

        // 设置视口大小
        await this.page.setViewport({
            width: this.config.viewport?.width || 1920,
            height: this.config.viewport?.height || 1080
        });

        // 设置超时时间
        this.page.setDefaultTimeout(this.config.timeout || 30000);

        // 设置额外的HTTP头
        await this.page.setExtraHTTPHeaders({
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        });

        // 请求拦截（用于过滤资源）
        if (this.config.interceptRequests) {
            await this.page.setRequestInterception(true);
            this.page.on('request', (request) => {
                const resourceType = request.resourceType();
                // 拦截不需要的资源类型
                if (this.config.blockResources?.includes(resourceType)) {
                    request.abort();
                } else {
                    request.continue();
                }
            });
        }

        // 响应拦截（用于分析响应）
        this.page.on('response', async (response) => {
            const url = response.url();
            const status = response.status();

            // 记录响应状态
            if (status >= 400) {
                this.emit('responseError', { url, status });
            }
        });
    }

    /**
     * 应用反爬措施（注入脚本、修改浏览器特征）
     */
    async applyAntiSpiderMeasures() {
        // 注入反检测脚本，修改浏览器特征
        await this.page.evaluateOnNewDocument(() => {
            // 覆盖navigator.webdriver（防止检测自动化工具）
            Object.defineProperty(navigator, 'webdriver', { get: () => false });

            // 覆盖chrome属性（模拟真实浏览器）
            window.chrome = { runtime: {} };

            // 覆盖plugins（模拟真实浏览器插件）
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });

            // 覆盖languages（模拟浏览器语言）
            Object.defineProperty(navigator, 'languages', {
                get: () => ['zh-CN', 'zh', 'en']
            });

            // 覆盖permissions（避免权限检测）
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
        });
    }

    /**
     * 处理登录逻辑
     */
    async handleLogin() {
        const loginConfig = this.config.login;
        this.emit('loginStart', { crawler: this.config.name });

        try {
            // 尝试从缓存获取cookies
            let cookies = await this.authManager?.getCookies(this.config.name);

            // 如果有cookies且不需要强制登录，尝试使用cookies恢复会话
            if (cookies && !loginConfig.forceLogin) {
                await this.page.setCookie(...cookies);
                await this.page.goto(loginConfig.checkUrl || this.config.listPage.url);

                // 验证cookies是否有效
                const isValid = await this.checkLoginStatus(loginConfig.checkSelector);
                if (isValid) {
                    this.emit('loginSuccess', { crawler: this.config.name, method: 'cookie' });
                    return;
                }
            }

            // 执行登录
            await this.performLogin(loginConfig);

            // 保存新的cookies
            const newCookies = await this.page.cookies();
            await this.authManager?.saveCookies(this.config.name, newCookies);

            this.emit('loginSuccess', { crawler: this.config.name, method: 'form' });

        } catch (error) {
            this.emit('loginError', { crawler: this.config.name, error: error.message });
            throw new Error(`Login failed: ${error.message}`);
        }
    }

    /**
     * 执行登录操作
     * @param {Object} loginConfig - 登录配置
     */
    async performLogin(loginConfig) {
        // 跳转到登录页
        await this.page.goto(loginConfig.loginUrl, { waitUntil: 'networkidle2' });

        // 等待登录表单加载
        await this.page.waitForSelector(loginConfig.formSelector, { timeout: 10000 });

        // 根据登录类型执行不同策略
        switch (loginConfig.type) {
            case 'form':
                await this.formLogin(loginConfig);
                break;
            case 'auto':
                await this.autoLogin(loginConfig);
                break;
            case 'manual':
                await this.manualLogin(loginConfig);
                break;
            default:
                throw new Error(`Unsupported login type: ${loginConfig.type}`);
        }

        // 等待登录成功标识
        if (loginConfig.successSelector) {
            await this.page.waitForSelector(loginConfig.successSelector, { timeout: 10000 });
        }
    }

    /**
     * 表单登录
     */
    async formLogin(loginConfig) {
        // 输入用户名
        await this.page.type(loginConfig.usernameSelector, loginConfig.username);

        // 随机延迟模拟人类输入
        await this.antiSpiderHandler.randomDelay(200, 500);

        // 输入密码
        await this.page.type(loginConfig.passwordSelector, loginConfig.password);

        // 处理验证码（如果有）
        if (loginConfig.captchaSelector) {
            const captcha = await this.handleCaptcha(loginConfig);
            await this.page.type(loginConfig.captchaSelector, captcha);
        }

        // 点击登录按钮
        await this.page.click(loginConfig.submitSelector);
        await this.antiSpiderHandler.sleep(2000);
    }

    /**
     * 自动登录（使用JavaScript自动填充并提交）
     */
    async autoLogin(loginConfig) {
        await this.page.evaluate((config) => {
            const form = document.querySelector(config.formSelector);
            if (form) {
                const usernameInput = form.querySelector(config.usernameSelector);
                const passwordInput = form.querySelector(config.passwordSelector);

                if (usernameInput) usernameInput.value = config.username;
                if (passwordInput) passwordInput.value = config.password;

                form.submit();
            }
        }, loginConfig);
    }

    /**
     * 手动登录（等待用户手动操作）
     */
    async manualLogin(loginConfig) {
        this.emit('manualLoginRequired', { crawler: this.config.name });

        // 等待用户手动登录完成
        await new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve();
            }, loginConfig.timeout || 60000);

            this.once('manualLoginComplete', () => {
                clearTimeout(timeout);
                resolve();
            });
        });
    }

    /**
     * 处理验证码
     */
    async handleCaptcha(loginConfig) {
        // 如果有自动识别服务
        if (loginConfig.captchaService) {
            const captchaImage = await this.page.$eval(
                loginConfig.captchaSelector,
                img => img.src
            );
            return await this.recognizeCaptcha(captchaImage, loginConfig.captchaService);
        }

        // 否则触发手动输入事件
        this.emit('captchaRequired', { crawler: this.config.name });

        return new Promise((resolve) => {
            this.once('captchaInput', (code) => {
                resolve(code);
            });
        });
    }

    /**
     * 检查登录状态
     */
    async checkLoginStatus(checkSelector) {
        try {
            await this.page.waitForSelector(checkSelector, { timeout: 5000 });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 启动爬虫（主入口）
     */
    async start() {
        // 检查熔断器状态
        if (this.circuitBreaker && this.circuitBreaker.isOpen()) {
            this.emit('error', new Error(`Circuit breaker is open for ${this.config.name}`));
            return;
        }

        this.isRunning = true;
        this.stats.startTime = new Date();
        this.emit('start', { crawler: this.config.name, time: this.stats.startTime });

        try {
            await this.initialize();
            await this.execute();
        } catch (error) {
            this.emit('error', error);
            if (this.circuitBreaker) {
                this.circuitBreaker.recordFailure();
            }
        } finally {
            await this.cleanup();
            this.isRunning = false;
            this.stats.endTime = new Date();
            this.emit('complete', this.stats);
        }
    }

    /**
     * 执行爬取流程（模板方法）
     */
    async execute() {
        // 1. 获取列表项
        const listItems = await this.getListItems();

        // 2. 逐个处理列表项
        for (const item of listItems) {
            // 检查是否需要停止
            if (!this.isRunning) break;

            // 检查暂停状态
            while (this.isPaused) {
                await this.antiSpiderHandler.sleep(1000);
            }

            // 等待队列槽位
            if (this.queueManager) {
                await this.queueManager.waitForSlot(this.config.name);
            }

            // 处理单个项目
            await this.processItem(item);

            // 随机延迟（反爬）
            await this.antiSpiderHandler.randomDelay(
                this.config.requestDelay || 1000,
                (this.config.requestDelay || 1000) * 1.5
            );
        }
    }

    /**
     * 获取列表项（支持多种分页方式）
     */
    async getListItems() {
        const listConfig = this.config.listPage;

        // 创建分页适配器
        const paginationAdapter = new PaginationAdapter(listConfig, this.page, {
            antiSpiderHandler: this.antiSpiderHandler
        });

        // 提取所有列表项
        const items = await paginationAdapter.extract();

        this.emit('listExtracted', { count: items.length });
        return items;
    }

    /**
     * 处理单个项目
     */
    async processItem(item) {
        // 生成内容哈希（用于增量检测）
        const contentHash = this.generateContentHash(item);

        // 检查是否已处理
        if (this.incrementalManager &&
            await this.incrementalManager.isProcessed(this.config.name, contentHash)) {
            this.emit('skip', { item, reason: 'already_processed' });
            return;
        }

        this.currentTask = item;
        this.stats.currentItem = item.title;
        this.stats.currentUrl = item.link;
        this.emit('itemStart', item);

        try {
            // 获取详情页内容
            const detail = await this.getDetail(item.link);

            // 下载文件
            if (detail.downloadUrls && detail.downloadUrls.length > 0) {
                for (const downloadUrl of detail.downloadUrls) {
                    const fileInfo = await this.downloadFile(downloadUrl, {
                        crawler: this.config.name,
                        title: this.sanitizeFilename(item.title),
                        referer: item.link
                    });

                    if (fileInfo) {
                        this.stats.downloaded++;
                        this.stats.totalSize += fileInfo.size;
                        this.emit('downloadComplete', { item, fileInfo });
                    }
                }
            }

            // 保存详情数据到文件
            await this.saveDetail(item, detail);

            // 标记为已处理
            if (this.incrementalManager) {
                await this.incrementalManager.markProcessed(
                    this.config.name,
                    contentHash,
                    {
                        title: item.title,
                        link: item.link,
                        detail: detail,
                        timestamp: new Date()
                    }
                );
            }

            this.stats.success++;
            this.emit('itemComplete', { item, detail });

            // 记录成功（重置熔断器计数）
            if (this.circuitBreaker) {
                this.circuitBreaker.recordSuccess();
            }

        } catch (error) {
            this.stats.failed++;
            this.emit('itemError', { item, error: error.message });

            // 记录失败（可能触发熔断器）
            if (this.circuitBreaker) {
                this.circuitBreaker.recordFailure();

                // 如果熔断器打开，抛出异常停止爬取
                if (this.circuitBreaker.isOpen()) {
                    throw new Error('Circuit breaker opened');
                }
            }
        } finally {
            this.stats.processed++;
            this.stats.currentItem = null;
            this.stats.currentUrl = null;
        }
    }

    /**
     * 获取详情页内容
     * @param {string} url - 详情页URL
     */
    async getDetail(url) {
        const detailConfig = this.config.detailPage;
        const page = await this.browser.newPage();

        try {
            // 设置页面超时
            page.setDefaultTimeout(this.config.timeout || 30000);

            // 应用反爬措施
            await this.applyAntiSpiderMeasuresToPage(page);

            // 访问详情页
            await page.goto(url, { waitUntil: 'networkidle2' });

            // 等待关键内容加载
            if (detailConfig.waitForSelector) {
                await page.waitForSelector(detailConfig.waitForSelector, { timeout: 10000 });
            }

            // 自动滚动加载内容（如果需要）
            if (detailConfig.autoScroll) {
                await this.antiSpiderHandler.autoScroll(page);
            }

            // 提取详情信息
            const detail = await page.evaluate((config) => {
                /**
                 * 获取元素文本
                 */
                const getText = (selector) => {
                    if (!selector) return '';
                    const el = document.querySelector(selector);
                    return el ? el.innerText.trim() : '';
                };

                /**
                 * 获取元素HTML
                 */
                const getHtml = (selector) => {
                    if (!selector) return '';
                    const el = document.querySelector(selector);
                    return el ? el.innerHTML : '';
                };

                /**
                 * 获取元素属性
                 */
                const getAttribute = (selector, attr) => {
                    if (!selector) return null;
                    const el = document.querySelector(selector);
                    return el ? el.getAttribute(attr) : null;
                };

                /**
                 * 提取下载链接
                 */
                let downloadUrls = [];

                // 从选择器提取
                if (config.downloadSelectors) {
                    for (const selector of config.downloadSelectors) {
                        const elements = document.querySelectorAll(selector);
                        elements.forEach(el => {
                            const url = el.href || el.src;
                            if (url && url.startsWith('http')) {
                                downloadUrls.push(url);
                            }
                        });
                    }
                }

                // 提取m3u8流媒体链接
                if (config.m3u8Selector) {
                    const m3u8El = document.querySelector(config.m3u8Selector);
                    if (m3u8El) {
                        let m3u8Url = m3u8El.src || m3u8El.href;
                        if (m3u8Url) {
                            downloadUrls.push(m3u8Url);
                        }
                    }
                }

                // 提取视频链接
                if (config.videoSelector) {
                    const videos = document.querySelectorAll(config.videoSelector);
                    videos.forEach(video => {
                        const src = video.src;
                        if (src) downloadUrls.push(src);

                        // 检查source标签
                        const sources = video.querySelectorAll('source');
                        sources.forEach(source => {
                            if (source.src) downloadUrls.push(source.src);
                        });
                    });
                }

                // 提取图片链接
                if (config.imageSelector) {
                    const images = document.querySelectorAll(config.imageSelector);
                    images.forEach(img => {
                        const src = img.src || img.getAttribute('data-src');
                        if (src) downloadUrls.push(src);
                    });
                }

                // 去重
                downloadUrls = [...new Set(downloadUrls)];

                return {
                    title: getText(config.titleSelector),
                    content: getHtml(config.contentSelector),
                    summary: getText(config.summarySelector),
                    publishTime: getText(config.timeSelector),
                    author: getText(config.authorSelector),
                    tags: getText(config.tagsSelector),
                    downloadUrls: downloadUrls
                };
            }, detailConfig);

            return detail;

        } finally {
            await page.close();
        }
    }

    /**
     * 下载文件
     * @param {string} url - 文件URL
     * @param {Object} options - 下载选项
     */
    async downloadFile(url, options) {
        // 创建下载适配器
        const downloadAdapter = new DownloadAdapter(url, {
            downloadManager: this.downloadManager,
            antiSpiderHandler: this.antiSpiderHandler,
            config: this.config.download
        });

        // 执行下载
        return await downloadAdapter.download(options);
    }

    /**
     * 保存详情数据
     */
    async saveDetail(item, detail) {
        const savePath = path.join(
            this.options.downloadPath || process.cwd(),
            this.config.name,
            'data',
            `${this.sanitizeFilename(item.title)}.json`
        );

        await fs.ensureDir(path.dirname(savePath));
        await fs.writeJson(savePath, {
            item,
            detail,
            crawledAt: new Date(),
            crawler: this.config.name
        });
    }

    /**
     * 生成内容哈希
     */
    generateContentHash(item) {
        const content = `${item.link}_${item.title}`;
        return crypto.createHash('md5').update(content).digest('hex');
    }

    /**
     * 清理文件名
     */
    sanitizeFilename(filename) {
        return filename.replace(/[<>:"/\\|?*]/g, '_').substring(0, 200);
    }

    /**
     * 清理资源
     */
    async cleanup() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    /**
     * 暂停爬虫
     */
    pause() {
        this.isPaused = true;
        this.emit('paused');
    }

    /**
     * 恢复爬虫
     */
    resume() {
        this.isPaused = false;
        this.emit('resumed');
    }

    /**
     * 停止爬虫
     */
    stop() {
        this.isRunning = false;
        this.emit('stopped');
    }

    /**
     * 获取进度信息
     */
    getProgress() {
        const duration = this.stats.startTime
            ? (new Date() - this.stats.startTime) / 1000
            : 0;

        return {
            ...this.stats,
            duration: duration,
            progress: this.stats.processed > 0
                ? ((this.stats.success / this.stats.processed) * 100).toFixed(2)
                : 0,
            currentItem: this.stats.currentItem,
            currentUrl: this.stats.currentUrl
        };
    }
}