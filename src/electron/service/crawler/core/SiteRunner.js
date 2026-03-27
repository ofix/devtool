// src/crawler/core/SiteRunner.js
import EventEmitter from 'events';
import fs from 'fs-extra';
import SiteConfigManager from './SiteConfigManager.js';
import GlobalScheduler from '../scheduler/GlobalScheduler.js';
import WorkflowExecutor from './WorkflowExecutor.js';  // 改名
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

/**
 * 站点运行器
 * 
 * 职责：运行和管理多个站点的爬取任务
 * 
 * 核心功能：
 * - 加载和管理站点配置
 * - 创建和缓存 WorkflowExecutor 实例
 * - 通过 GlobalScheduler 调度任务执行
 * - 控制站点启动/停止/暂停/恢复
 * - 提供统一的状态监控和统计
 */
export default class SiteRunner extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = options;
        this.configPath = options.configPath || './configs/sites';
        this.dataPath = options.dataPath || './data';
        this.downloadPath = options.downloadPath || './data/downloads';
        this.dbPath = options.dbPath || './data/crawler.db';
        this.globalConcurrency = options.globalConcurrency || 5;
        this.headless = options.headless !== false;

        // 策略配置路径（新增）
        this.policyPath = options.policyPath || './configs/policies';

        // 初始化核心组件
        // 统一配置管理器
        this.configManager = new SiteConfigManager({
            sitesDir: this.configPath,
            policiesDir: this.policyPath,
            defaultPolicy: options.defaultPolicy || 'default',
            logger: new Logger('SiteConfigManager')
        });
        // 任务队列（支持全局并发控制）
        this.scheduler = new GlobalScheduler({ globalConcurrency: this.globalConcurrency });
        // 响应解析器注册中心
        this.processorRegistry = new ProcessorRegistry();
        // 浏览器管理（支持动态页面）
        this.browserManager = new BrowserManager({ headless: this.headless });
        // 下载管理器
        this.downloadManager = new DownloadManager({ basePath: this.downloadPath });
        // 存储管理器
        this.storageManager = new StorageManager({ basePath: this.dataPath });
        // 增量下载管理器
        this.incrementalManager = new IncrementalManager({ dbPath: this.dbPath });
        // 日志类
        this.logger = new Logger('SiteRunner');

        // ResourceFetcher 延迟初始化（需要策略配置）
        this.resourceFetcher = null;

        // 站点映射
        this.executors = new Map();           // siteName -> WorkflowExecutor

        // 运行状态
        this.isRunning = false;
        this.startTime = null;

        // 运行指标
        this.metrics = {
            totalSites: 0,
            activeSites: 0,
            totalTasks: 0,
            completedTasks: 0,
            failedTasks: 0
        };

        // 注册内置处理器
        this._registerBuiltInProcessors();

        // 设置调度器的任务处理器
        this.scheduler.setTaskProcessor(async (task, context) => {
            const executor = this.runners.get(task.siteName);
            if (!executor) {
                throw new Error(`Site executor not found: ${task.siteName}`);
            }
            return await executor.executeTask(task, context);
        });
    }

    /**
     * 初始化运行器
     */
    async initialize() {
        this.logger.info('Initializing SiteRunner...');

        // 确保目录存在
        await fs.ensureDir(this.configPath);
        await fs.ensureDir(this.dataPath);
        await fs.ensureDir(this.downloadPath);
        await fs.ensureDir(this.policyPath);

        // 初始化策略管理器
        await this.configManager.initialize();

        // 初始化 ResourceFetcher（全局实例，策略由各站点独立）
        this.resourceFetcher = new ResourceFetcher({
            browserManager: this.browserManager,
            policyManager: this.policyManager,
            timeout: this.options.timeout || 30000,
            logger: this.logger
        });

        // 加载所有站点配置
        const configs = await this.configManager.loadAllSites();

        // 注册每个站点
        for (const config of configs) {
            await this._registerSite(config);
        }
        this.metrics.totalSites = configs.length;

        this.emit('initialized', {
            count: configs.length,
            sites: Array.from(this.runners.keys()),
            stats: this.configManager.getStats()
        });

        this.logger.info(`SiteRunner initialized with ${configs.length} sites`);
        return configs;
    }

    /**
     * 注册单个站点
     */
    async _registerSite(config) {

        // 创建工作流执行器（改名）
        const executor = new WorkflowExecutor(config, {
            processorRegistry: this.processorRegistry,
            resourceFetcher: this.resourceFetcher,
            scheduler: this.scheduler,
            downloadManager: this.downloadManager,
            storageManager: this.storageManager,
            incrementalManager: this.incrementalManager,
            configManager: this.configManager,
            logger: new Logger(config.name)
        });

        // 注册到调度器（传入策略配置）
        this.scheduler.registerSite(config.name, {
            concurrency: policyConfig.concurrency || config.concurrency || 1,
            priority: config.priority || 5,
            timeout: policyConfig.timeout || config.timeout || 30000,
            retry: policyConfig.retry || config.retry,
            circuit_breaker: policyConfig.circuit_breaker,
            rate_limit: policyConfig.rate_limit,
            proxy: policyConfig.proxy
        });

        this.executors.set(config.name, executor);

        this.emit('siteRegistered', { name: config.name, config });
        this.logger.info(`Site registered: ${config.name}`);
    }

    /**
     * 运行所有站点
     */
    async runAll() {
        if (this.isRunning) {
            this.logger.warn('SiteRunner is already running');
            return;
        }

        this.isRunning = true;
        this.startTime = Date.now();

        this.logger.info('Running all enabled sites...');
        this.emit('runStart', { timestamp: Date.now() });

        const results = [];
        const sites = this.configManager.getAllSiteConfigs();
        for (const config of sites) {
            if (config.enabled !== false) {
                try {
                    const result = await this._runSite(config.name);
                    results.push(result);
                } catch (error) {
                    this.logger.error(`Failed to run site ${config.name}: ${error.message}`);
                    results.push({ site: config.name, success: false, error: error.message });
                }
            }
        }

        this.emit('runComplete', { results, metrics: this.getMetrics() });
        this.logger.info(`All sites run completed: ${results.filter(r => r.success).length}/${results.length} succeeded`);

        return results;
    }

    /**
     * 运行单个站点
     */
    async runSite(siteName) {
        const config = this.configManager.getSiteConfig(siteName);
        if (!config) throw new Error(`Site ${siteName} not found`);
        if (config.enabled === false) throw new Error(`Site ${siteName} is disabled`);

        return await this._runSite(siteName);
    }

    /**
     * 内部运行站点方法
     */
    async _runSite(siteName) {
        const executor = this.executors.get(siteName);
        if (!executor) throw new Error(`Site executor not found: ${siteName}`);
        // 获取起始任务
        const startTasks = executor.getStartTasks();

        if (startTasks.length === 0) {
            this.logger.warn(`No start tasks for site: ${siteName}`);
            return { site: siteName, success: false, reason: 'no_tasks' };
        }
        // 更新度量指标
        this.metrics.totalTasks += startTasks.length;
        this.metrics.activeSites++;

        this.logger.info(`Running site: ${siteName} with ${startTasks.length} tasks`);
        this.emit('siteRunStart', { site: siteName, taskCount: startTasks.length });

        // 加入任务队列
        for (const task of startTasks) {
            await this.scheduler.addTask(siteName, task);
        }

        return {
            site: siteName,
            success: true,
            tasks: startTasks.length
        };
    }

    /**
     * 停止站点
     */
    async stopSite(siteName) {
        this.scheduler.pauseSite(siteName);
        this.scheduler.clearQueue(siteName);

        this.metrics.activeSites--;

        this.emit('siteStopped', { name: siteName });
        this.logger.info(`Site stopped: ${siteName}`);

        return { site: siteName, stopped: true };
    }



    /**
     * 停止所有站点
     */
    async stopAll() {
        this.logger.info('Stopping all sites...');

        for (const [siteName] of this.runners) {
            await this.stopSite(siteName);
        }

        this.isRunning = false;
        this.emit('stopAll', { timestamp: Date.now() });
        this.logger.info('All sites stopped');
    }

    /**
     * 暂停站点
     */
    async pauseSite(siteName) {
        this.scheduler.pauseSite(siteName);
        this.emit('sitePaused', { name: siteName });
        this.logger.info(`Site paused: ${siteName}`);
    }

    /**
     * 恢复站点
     */
    async resumeSite(siteName) {
        this.scheduler.resumeSite(siteName);
        this.emit('siteResumed', { name: siteName });
        this.logger.info(`Site resumed: ${siteName}`);
    }

    /**
     * 手动添加任务
     */
    async addTask(siteName, url, options = {}) {
        const executor = this.executors.get(siteName);
        if (!executor) throw new Error(`Site ${siteName} not found`);

        // 获取第一个步骤作为默认步骤
        const workflow = executor.siteConfig.workflow;
        const firstStep = workflow?.[0] || { type: 'page', model: 'standard' };

        let stepRef = firstStep.alias;
        if (!stepRef) {
            if (firstStep.type && firstStep.model) {
                stepRef = `${firstStep.type}.${firstStep.model}`;
            } else {
                const keys = Object.keys(firstStep);
                stepRef = keys[0];
            }
        }

        const task = new Task({
            siteName: siteName,
            type: firstStep.type || stepRef.split('.')[0],
            model: firstStep.model || stepRef.split('.')[1],
            url: url,
            stepRef: stepRef,
            contextId: null,
            maxRetries: options.maxRetries || 3,
            priority: options.priority || 5,
            data: options.data || {}
        });

        this.metrics.totalTasks++;
        return await this.scheduler.addTask(siteName, task);
    }

    /**
     * 重新加载策略配置
     */
    async reloadPolicy(policyName) {
        this.logger.info(`Reloading policy: ${policyName}`);

        // 通过配置管理器重新加载策略
        const newPolicy = await this.configManager.reloadPolicy(policyName);

        // 重新加载所有使用该策略的站点
        const sites = this.configManager.getAllSiteConfigs();
        for (const site of sites) {
            if (site._policy === policyName) {
                await this.reloadSite(site.name);
            }
        }

        this.emit('policyReloaded', { policyName, policy: newPolicy });
        this.logger.info(`Policy reloaded: ${policyName}`);

        return newPolicy;
    }

    /**
     * 重新加载站点配置
     */
    async reloadSite(siteName) {
        this.logger.info(`Reloading site: ${siteName}`);

        // 停止站点
        await this.stopSite(siteName);

        // 通过配置管理器重新加载
        const newConfig = await this.configManager.reloadSite(siteName);

        // 创建新执行器
        const newExecutor = new WorkflowExecutor(newConfig, {
            processorRegistry: this.processorRegistry,
            resourceFetcher: this.resourceFetcher,
            scheduler: this.scheduler,
            downloadManager: this.downloadManager,
            storageManager: this.storageManager,
            incrementalManager: this.incrementalManager,
            configManager: this.configManager,
            logger: new Logger(newConfig.name)
        });

        // 更新调度器
        this.scheduler.updateSiteConfig(siteName, {
            concurrency: newConfig.concurrency || 1,
            priority: newConfig.priority || 5,
            timeout: newConfig.timeout || 30000
        });

        // 更新缓存
        this.executors.set(siteName, newExecutor);

        // 如果启用，重新启动
        if (newConfig.enabled !== false) {
            await this._runSite(siteName);
        }

        this.emit('siteReloaded', { name: siteName, config: newConfig });
        this.logger.info(`Site reloaded: ${siteName}`);

        return newConfig;
    }

    /**
     * 获取站点状态
     */
    getSiteStatus(siteName) {
        const schedulerStatus = this.scheduler.getSiteStatus(siteName);
        const executor = this.executors.get(siteName);
        const config = this.configManager.getSiteConfig(siteName);

        if (!config) return null;

        return {
            name: siteName,
            enabled: config.enabled !== false,
            policy: config._policy,
            config: {
                concurrency: config.concurrency,
                priority: config.priority,
                url: config.url
            },
            ...schedulerStatus,
            progress: executor?.getProgress?.() || null
        };
    }

    /**
     * 获取所有站点状态
     */
    getAllStatus() {
        const status = {};
        for (const name of this.executors.keys()) {
            status[name] = this.getSiteStatus(name);
        }
        return status;
    }

    /**
     * 获取运行指标
     */
    getMetrics() {
        const schedulerStats = this.scheduler.getStats();
        const duration = this.startTime ? (Date.now() - this.startTime) / 1000 : 0;

        return {
            ...this.metrics,
            duration: Math.round(duration * 100) / 100,
            activeSites: schedulerStats.runningSites || 0,
            queueLength: schedulerStats.totalQueueLength || 0,
            successRate: this.metrics.completedTasks > 0
                ? ((this.metrics.completedTasks / this.metrics.totalTasks) * 100).toFixed(2)
                : '0.00',
            isRunning: this.isRunning
        };
    }

    /**
     * 获取统计信息（兼容旧接口）
     */
    getStats() {
        return {
            runner: this.getMetrics(),
            configManager: this.configManager.getStats(),
            scheduler: this.scheduler.getStats()
        };
    }

    /**
     * 获取运行报告
     */
    getReport() {
        return {
            metrics: this.getMetrics(),
            sites: this.getAllStatus(),
            config: this.configManager.getStats(),
            scheduler: this.scheduler.getStats(),
            timestamp: Date.now()
        };
    }

    /**
     * 等待所有任务完成
     */
    async waitForCompletion(timeout = 3600000) {
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            const checkInterval = setInterval(() => {
                const stats = this.scheduler.getStats();
                const elapsed = Date.now() - startTime;

                if (stats.totalQueueLength === 0 && stats.runningSites === 0) {
                    clearInterval(checkInterval);
                    resolve(this.getMetrics());
                }

                if (elapsed > timeout) {
                    clearInterval(checkInterval);
                    reject(new Error(`Wait timeout after ${timeout}ms`));
                }
            }, 1000);
        });
    }

    /**
     * 关闭运行器
     */
    async shutdown() {
        this.logger.info('Shutting down SiteRunner...');

        await this.stopAll();
        await this.scheduler.shutdown();
        await this.browserManager.close();
        await this.incrementalManager.close();
        await this.resourceFetcher?.close();
        await this.configManager?.close();

        this.emit('shutdown');
        this.logger.info('SiteRunner shutdown complete');
    }

    /**
     * 注册所有内置处理器
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