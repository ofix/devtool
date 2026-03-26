import { EventEmitter } from 'events';
import SiteRunner from './SiteRunner.js';
import Logger from '../utils/Logger.js';

class CrawlerEngine extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            configPath: options.configPath || './configs/sites',
            policyPath: options.policyPath || './configs/policies',
            dataPath: options.dataPath || './data',
            downloadPath: options.downloadPath || './data/downloads',
            dbPath: options.dbPath || './data/crawler.db',
            globalConcurrency: options.globalConcurrency || 5,
            headless: options.headless !== false,
            ...options
        };

        this.siteRunner = null;
        this.logger = new Logger('CrawlerEngine');
        this.isRunning = false;
    }

    async initialize() {
        this.logger.info('Initializing crawler engine...');

        this.siteRunner = new SiteRunner({
            configPath: this.options.configPath,
            policyPath: this.options.policyPath,
            dataPath: this.options.dataPath,
            downloadPath: this.options.downloadPath,
            dbPath: this.options.dbPath,
            globalConcurrency: this.options.globalConcurrency,
            headless: this.options.headless
        });

        // 转发事件
        this.siteRunner.on('*', (event, data) => {
            this.emit(event, data);
        });

        await this.siteRunner.initialize();

        this.logger.info('Crawler engine initialized');
        return this;
    }

    async start() {
        if (this.isRunning) {
            this.logger.warn('Crawler engine already running');
            return;
        }

        this.isRunning = true;
        await this.siteRunner.runAll();
        this.emit('started');
    }

    async stop() {
        if (!this.isRunning) return;

        this.isRunning = false;
        await this.siteRunner.shutdown();
        this.emit('stopped');
    }

    async pauseSite(siteName) {
        return this.siteRunner.pauseSite(siteName);
    }

    async resumeSite(siteName) {
        return this.siteRunner.resumeSite(siteName);
    }

    async runSite(siteName) {
        return this.siteRunner.runSite(siteName);
    }

    async stopSite(siteName) {
        return this.siteRunner.stopSite(siteName);
    }

    getStatus(siteName) {
        return this.siteRunner.getStatus(siteName);
    }

    getAllStatus() {
        return this.siteRunner.getAllStatus();
    }

    getStats() {
        return this.siteRunner.getStats();
    }

    async addTask(siteName, url, options = {}) {
        return this.siteRunner.addTask(siteName, url, options);
    }

    async reloadConfig(siteName) {
        return this.siteRunner.reloadConfig(siteName);
    }
}

export default CrawlerEngine;
