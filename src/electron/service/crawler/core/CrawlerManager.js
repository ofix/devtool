// src/crawler/core/CrawlerManager.js
import EventEmitter from 'events';
import fs from 'fs-extra';
import ConfigLoader from '../config/ConfigLoader.js';
import GlobalScheduler from '../scheduler/GlobalScheduler.js';
import WorkflowEngine from './WorkflowEngine.js';
import Task from './Task.js';
import ProcessorRegistry from '../processors/ProcessorRegistry.js';
import BrowserManager from '../infrastructure/BrowserManager.js';
import DownloadManager from '../infrastructure/DownloadManager.js';
import StorageManager from '../infrastructure/StorageManager.js';
import IncrementalManager from '../infrastructure/IncrementalManager.js';
import ResourceFetcher from '../infrastructure/ResourceFetcher.js';
import Logger from '../utils/Logger.js';

// 列表处理器
import PaginationProcessor from '../processors/list/PaginationProcessor.js';
import ScrollProcessor from '../processors/list/ScrollProcessor.js';
import LoadMoreProcessor from '../processors/list/LoadMoreProcessor.js';
import InfiniteProcessor from '../processors/list/InfiniteProcessor.js';
import AjaxProcessor from '../processors/list/AjaxProcessor.js';
import ApiProcessor from '../processors/list/ApiProcessor.js';
import GraphQLProcessor from '../processors/list/GraphQLProcessor.js';
import RssProcessor from '../processors/list/RssProcessor.js';

// 页面处理器
import StandardProcessor from '../processors/page/StandardProcessor.js';
import VideoProcessor from '../processors/page/VideoProcessor.js';
import ImageProcessor from '../processors/page/ImageProcessor.js';
import JsonLdProcessor from '../processors/page/JsonLdProcessor.js';
import PdfProcessor from '../processors/page/PdfProcessor.js';

// 下载处理器
import ImageDownloadProcessor from '../processors/download/ImageProcessor.js';
import VideoDownloadProcessor from '../processors/download/VideoProcessor.js';
import M3u8DownloadProcessor from '../processors/download/M3u8Processor.js';
import FileDownloadProcessor from '../processors/download/FileProcessor.js';

// 登录处理器
import FormLoginProcessor from '../processors/login/FormProcessor.js';
import ApiLoginProcessor from '../processors/login/ApiProcessor.js';
import OAuth2LoginProcessor from '../processors/login/OAuth2Processor.js';
import CookieLoginProcessor from '../processors/login/CookieProcessor.js';
import ManualLoginProcessor from '../processors/login/ManualProcessor.js';
import QrLoginProcessor from '../processors/login/QrProcessor.js';

export default class CrawlerManager extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = options;
        this.configPath = options.configPath || './configs/sites';
        this.dataPath = options.dataPath || './data';
        this.downloadPath = options.downloadPath || './data/downloads';
        this.dbPath = options.dbPath || './data/crawler.db';
        this.globalConcurrency = options.globalConcurrency || 5;
        this.headless = options.headless !== false;

        // 初始化组件
        this.configLoader = new ConfigLoader({ configPath: this.configPath });
        this.scheduler = new GlobalScheduler({ globalConcurrency: this.globalConcurrency });
        this.processorRegistry = new ProcessorRegistry();
        this.browserManager = new BrowserManager({ headless: this.headless });
        this.downloadManager = new DownloadManager({ basePath: this.downloadPath });
        this.storageManager = new StorageManager({ basePath: this.dataPath });
        this.resourceFetcher = new ResourceFetcher({ 
            browserManager: this.browserManager,
            timeout: options.timeout || 30000
        });
        this.incrementalManager = new IncrementalManager({ dbPath: this.dbPath });
        this.logger = new Logger('CrawlerManager');

        // 站点映射
        this.sites = new Map();           // siteName -> WorkflowEngine
        this.siteConfigs = new Map();     // siteName -> config

        // 注册内置处理器（支持更多类型）
        this._registerBuiltInProcessors();

        // 设置调度器的任务处理器
        this.scheduler.setTaskProcessor(async (task, context) => {
            const engine = this.sites.get(task.siteName);
            if (!engine) {
                throw new Error(`Site engine not found: ${task.siteName}`);
            }
            return await engine.processTask(task, context);
        });
    }

    async initialize() {
        this.logger.info('Initializing CrawlerManager...');

        await fs.ensureDir(this.configPath);
        await fs.ensureDir(this.dataPath);
        await fs.ensureDir(this.downloadPath);

        // 加载所有配置
        const configs = await this.configLoader.loadAll();

        for (const config of configs) {
            await this._registerSite(config);
        }

        this.emit('initialized', {
            count: configs.length,
            sites: Array.from(this.sites.keys())
        });

        this.logger.info(`Initialized ${configs.length} sites`);
        return configs;
    }

    async _registerSite(config) {
        // ✅ 新版：创建工作流引擎
        const engine = new WorkflowEngine(config, {
            processorRegistry: this.processorRegistry,
            resourceFetcher: this.resourceFetcher,
            scheduler: this.scheduler,  // ✅ 注入调度器
            downloadManager: this.downloadManager,
            storageManager: this.storageManager,
            incrementalManager: this.incrementalManager,
            logger: new Logger(config.name)
        });

        // 注册到调度器
        this.scheduler.registerSite(config.name, {
            concurrency: config.concurrency || 1,
            priority: config.priority || 5,
            request: config.request,
            circuit_breaker: config.circuit_breaker,
            rate_limit: config.rate_limit,
            proxy: config.proxy
        });

        this.sites.set(config.name, engine);
        this.siteConfigs.set(config.name, config);

        this.emit('siteRegistered', { name: config.name, config });
        this.logger.info(`Site registered: ${config.name}`);
    }

    async startAll() {
        this.logger.info('Starting all enabled sites...');

        for (const [name, config] of this.siteConfigs) {
            if (config.enabled !== false) {
                await this._startSite(name);
            }
        }

        this.emit('started');
    }

    async startSite(siteName) {
        const config = this.siteConfigs.get(siteName);
        if (!config) throw new Error(`Site ${siteName} not found`);
        if (config.enabled === false) throw new Error(`Site ${siteName} is disabled`);
        await this._startSite(siteName);
    }

    async _startSite(siteName) {
        const engine = this.sites.get(siteName);
        if (!engine) throw new Error(`Site engine not found: ${siteName}`);

        // ✅ 新版：获取起始任务（返回 Task 实例数组）
        const startTasks = engine.getStartTasks();

        for (const task of startTasks) {
            await this.scheduler.addTask(siteName, task);
        }

        this.emit('siteStarted', { name: siteName, taskCount: startTasks.length });
        this.logger.info(`Site started: ${siteName}, tasks: ${startTasks.length}`);
    }

    async stopSite(siteName) {
        this.scheduler.pauseSite(siteName);
        this.scheduler.clearQueue(siteName);
        this.emit('siteStopped', { name: siteName });
        this.logger.info(`Site stopped: ${siteName}`);
    }

    async pauseSite(siteName) {
        this.scheduler.pauseSite(siteName);
        this.emit('sitePaused', { name: siteName });
        this.logger.info(`Site paused: ${siteName}`);
    }

    async resumeSite(siteName) {
        this.scheduler.resumeSite(siteName);
        this.emit('siteResumed', { name: siteName });
        this.logger.info(`Site resumed: ${siteName}`);
    }

    /**
     * 手动添加任务
     * @param {string} siteName - 站点名称
     * @param {string} url - 目标 URL
     * @param {Object} options - 选项
     */
    async addTask(siteName, url, options = {}) {
        const engine = this.sites.get(siteName);
        if (!engine) throw new Error(`Site ${siteName} not found`);

        // ✅ 新版：创建 Task 实例
        const firstStep = engine.siteConfig.workflow?.[0] || { type: 'page', model: 'standard' };
        
        const task = new Task({
            siteName: siteName,
            type: firstStep.type,
            model: firstStep.model,
            url: url,
            stepRef: firstStep.alias || `${firstStep.type}.${firstStep.model}`,
            contextId: null,  // 手动添加的任务没有上下文
            maxRetries: options.maxRetries || 3,
            priority: options.priority || 5
        });

        return await this.scheduler.addTask(siteName, task);
    }

    /**
     * 获取站点状态
     */
    getStatus(siteName) {
        const schedulerStatus = this.scheduler.getSiteStatus(siteName);
        const engine = this.sites.get(siteName);
        const config = this.siteConfigs.get(siteName);

        if (!config) return null;

        return {
            name: siteName,
            enabled: config.enabled !== false,
            config: {
                concurrency: config.concurrency,
                priority: config.priority,
                url: config.url
            },
            ...schedulerStatus,
            progress: engine?.getProgress?.() || null
        };
    }

    getAllStatus() {
        const status = {};
        for (const name of this.sites.keys()) {
            status[name] = this.getStatus(name);
        }
        return status;
    }

    getStats() {
        const schedulerStats = this.scheduler.getStats();
        const sites = Array.from(this.sites.keys());

        return {
            totalSites: sites.length,
            enabledSites: Array.from(this.siteConfigs.values()).filter(c => c.enabled !== false).length,
            runningSites: schedulerStats.runningSites,
            queueLength: schedulerStats.totalQueueLength,
            ...schedulerStats
        };
    }

    async reloadConfig(siteName) {
        const config = this.siteConfigs.get(siteName);
        if (!config || !config._source) {
            throw new Error(`Config for ${siteName} not found`);
        }

        // 停止旧爬虫
        await this.stopSite(siteName);
        
        // 重新加载配置
        const newConfig = await this.configLoader.loadFile(config._source);
        
        // 创建新引擎
        const newEngine = new WorkflowEngine(newConfig, {
            processorRegistry: this.processorRegistry,
            resourceFetcher: this.resourceFetcher,
            downloadManager: this.downloadManager,
            storageManager: this.storageManager,
            incrementalManager: this.incrementalManager,
            logger: new Logger(newConfig.name)
        });

        // 更新映射
        this.sites.set(siteName, newEngine);
        this.siteConfigs.set(siteName, newConfig);

        // 如果启用，重新启动
        if (newConfig.enabled !== false) {
            await this._startSite(siteName);
        }

        this.emit('siteReloaded', { name: siteName, config: newConfig });
        this.logger.info(`Site reloaded: ${siteName}`);

        return newConfig;
    }

    async shutdown() {
        this.logger.info('Shutting down CrawlerManager...');
        await this.scheduler.shutdown();
        await this.browserManager.close();
        await this.incrementalManager.close();
        await this.resourceFetcher.close();
        this.emit('shutdown');
        this.logger.info('CrawlerManager shutdown complete');
    }

    /**
     * 注册所有内置处理器（支持更多类型）
     */
    _registerBuiltInProcessors() {
        // ========== 列表处理器 ==========
        this.processorRegistry.register('list', 'pagination', new PaginationProcessor());
        this.processorRegistry.register('list', 'scroll', new ScrollProcessor());
        this.processorRegistry.register('list', 'load_more', new LoadMoreProcessor());
        this.processorRegistry.register('list', 'infinite', new InfiniteProcessor());
        this.processorRegistry.register('list', 'ajax', new AjaxProcessor());
        this.processorRegistry.register('list', 'api', new ApiProcessor());
        this.processorRegistry.register('list', 'graphql', new GraphQLProcessor());
        this.processorRegistry.register('list', 'rss', new RssProcessor());

        // ========== 页面处理器 ==========
        this.processorRegistry.register('page', 'standard', new StandardProcessor());
        this.processorRegistry.register('page', 'video', new VideoProcessor());
        this.processorRegistry.register('page', 'image', new ImageProcessor());
        this.processorRegistry.register('page', 'json_ld', new JsonLdProcessor());
        this.processorRegistry.register('page', 'pdf', new PdfProcessor());

        // ========== 下载处理器 ==========
        this.processorRegistry.register('download', 'image', new ImageDownloadProcessor());
        this.processorRegistry.register('download', 'video', new VideoDownloadProcessor());
        this.processorRegistry.register('download', 'm3u8', new M3u8DownloadProcessor());
        this.processorRegistry.register('download', 'file', new FileDownloadProcessor());

        // ========== 登录处理器 ==========
        this.processorRegistry.register('login', 'form', new FormLoginProcessor());
        this.processorRegistry.register('login', 'api', new ApiLoginProcessor());
        this.processorRegistry.register('login', 'oauth2', new OAuth2LoginProcessor());
        this.processorRegistry.register('login', 'cookie', new CookieLoginProcessor());
        this.processorRegistry.register('login', 'manual', new ManualLoginProcessor());
        this.processorRegistry.register('login', 'qr', new QrLoginProcessor());
    }
}