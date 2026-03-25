import { EventEmitter } from 'events';
import CrawlerManager from './core/CrawlerManager.js';
import Logger from './utils/Logger.js';

class CrawlerEngine extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            configPath: options.configPath || './configs/sites',
            dataPath: options.dataPath || './data',
            downloadPath: options.downloadPath || './data/downloads',
            dbPath: options.dbPath || './data/crawler.db',
            globalConcurrency: options.globalConcurrency || 5,
            headless: options.headless !== false,
            ...options
        };

        this.manager = null;
        this.logger = new Logger('CrawlerEngine');
        this.isRunning = false;
    }

    async initialize() {
        this.logger.info('Initializing crawler engine...');

        this.manager = new CrawlerManager({
            configPath: this.options.configPath,
            dataPath: this.options.dataPath,
            downloadPath: this.options.downloadPath,
            dbPath: this.options.dbPath,
            globalConcurrency: this.options.globalConcurrency,
            headless: this.options.headless
        });

        // 转发事件
        this.manager.on('*', (event, data) => {
            this.emit(event, data);
        });

        await this.manager.initialize();

        this.logger.info('Crawler engine initialized');
        return this;
    }

    async start() {
        if (this.isRunning) {
            this.logger.warn('Crawler engine already running');
            return;
        }

        this.isRunning = true;
        await this.manager.startAll();
        this.emit('started');
    }

    async stop() {
        if (!this.isRunning) return;

        this.isRunning = false;
        await this.manager.shutdown();
        this.emit('stopped');
    }

    async pauseSite(siteName) {
        return this.manager.pauseSite(siteName);
    }

    async resumeSite(siteName) {
        return this.manager.resumeSite(siteName);
    }

    async startSite(siteName) {
        return this.manager.startSite(siteName);
    }

    async stopSite(siteName) {
        return this.manager.stopSite(siteName);
    }

    getStatus(siteName) {
        return this.manager.getStatus(siteName);
    }

    getAllStatus() {
        return this.manager.getAllStatus();
    }

    getStats() {
        return this.manager.getStats();
    }

    async addTask(siteName, url, options = {}) {
        return this.manager.addTask(siteName, url, options);
    }

    async reloadConfig(siteName) {
        return this.manager.reloadConfig(siteName);
    }
}

export default CrawlerEngine;
