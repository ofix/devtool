// src/electron/service/crawler/scheduler/GlobalScheduler.js
import { EventEmitter } from 'events';
import SiteQueue from './SiteQueue.js';
import CircuitBreaker from './CircuitBreaker.js';

export default class GlobalScheduler extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.globalConcurrency = options.globalConcurrency || 5;
        this.runningTasks = 0;
        this.siteQueues = new Map();
        this.siteStatus = new Map();
        this.taskProcessor = null;
        this.isShuttingDown = false;
    }
    
    setTaskProcessor(processor) {
        this.taskProcessor = processor;
    }
    
    registerSite(siteName, config = {}) {
        const siteQueue = new SiteQueue(siteName, {
            concurrency: config.concurrency || 1,
            requestDelay: this._parseDelay(config.request?.delay || "1000-3000"),
            retryCount: config.request?.retry || 3,
            retryDelay: config.request?.retry_delay || 2000,
            circuitBreaker: config.circuit_breaker?.enabled !== false 
                ? new CircuitBreaker(config.circuit_breaker) 
                : null
        });
        
        this.siteQueues.set(siteName, siteQueue);
        this.siteStatus.set(siteName, {
            enabled: true,
            paused: false,
            priority: config.priority || 5,
            running: 0,
            config
        });
        
        this.emit('siteRegistered', { siteName });
    }
    
    async addTask(siteName, task) {
        const siteQueue = this.siteQueues.get(siteName);
        if (!siteQueue) {
            throw new Error(`Site ${siteName} not registered`);
        }
        
        const status = this.siteStatus.get(siteName);
        if (!status.enabled) {
            throw new Error(`Site ${siteName} is disabled`);
        }
        if (status.paused) {
            throw new Error(`Site ${siteName} is paused`);
        }
        if (siteQueue.circuitBreaker?.isOpen()) {
            throw new Error(`Circuit breaker is open for ${siteName}`);
        }
        
        await siteQueue.push(task);
        this._schedule();
        
        return task.id;
    }
    
    async _schedule() {
        if (this.isShuttingDown) return;
        
        const availableSites = Array.from(this.siteQueues.keys())
            .filter(siteName => {
                const status = this.siteStatus.get(siteName);
                const siteQueue = this.siteQueues.get(siteName);
                return status?.enabled && 
                       !status.paused &&
                       (!siteQueue.circuitBreaker || !siteQueue.circuitBreaker.isOpen()) &&
                       status.running < siteQueue.concurrency &&
                       siteQueue.length > 0;
            })
            .sort((a, b) => {
                return this.siteStatus.get(b).priority - this.siteStatus.get(a).priority;
            });
        
        while (this.runningTasks < this.globalConcurrency && availableSites.length > 0) {
            const siteName = availableSites.shift();
            const status = this.siteStatus.get(siteName);
            status.running++;
            this.runningTasks++;
            this._processSite(siteName).catch(error => {
                this.emit('error', { siteName, error: error.message });
            });
        }
    }
    
    async _processSite(siteName) {
        const siteQueue = this.siteQueues.get(siteName);
        const status = this.siteStatus.get(siteName);
        
        while (siteQueue.length > 0 && !status.paused && !this.isShuttingDown) {
            if (siteQueue.circuitBreaker?.isOpen()) {
                break;
            }
            
            const task = await siteQueue.pop();
            if (!task) continue;
            
            const delay = siteQueue.getRandomDelay();
            if (delay > 0) {
                await this._sleep(delay);
            }
            
            try {
                const result = await this.taskProcessor(task, { siteName });
                
                siteQueue.circuitBreaker?.recordSuccess();
                
                if (result.subTasks?.length) {
                    for (const subTask of result.subTasks) {
                        await this.addTask(siteName, subTask);
                    }
                }
                
                siteQueue.stats.completed++;
                this.emit('taskComplete', { siteName, task, result });
                
            } catch (error) {
                siteQueue.circuitBreaker?.recordFailure();
                siteQueue.stats.failed++;
                this.emit('taskFailed', { siteName, task, error: error.message });
                
                if (task.retryCount < siteQueue.retryCount) {
                    task.retryCount++;
                    await siteQueue.pushFront(task);
                    await this._sleep(siteQueue.retryDelay);
                }
            }
        }
        
        status.running--;
        this.runningTasks--;
        this._schedule();
    }
    
    pauseSite(siteName) {
        const status = this.siteStatus.get(siteName);
        if (status) {
            status.paused = true;
            this.emit('sitePaused', { siteName });
        }
    }
    
    resumeSite(siteName) {
        const status = this.siteStatus.get(siteName);
        if (status) {
            status.paused = false;
            this.emit('siteResumed', { siteName });
            this._schedule();
        }
    }
    
    clearQueue(siteName) {
        const siteQueue = this.siteQueues.get(siteName);
        if (siteQueue) {
            siteQueue.clear();
        }
    }
    
    getSiteStatus(siteName) {
        const status = this.siteStatus.get(siteName);
        const siteQueue = this.siteQueues.get(siteName);
        if (!status) return null;
        
        return {
            name: siteName,
            enabled: status.enabled,
            paused: status.paused,
            running: status.running,
            queueLength: siteQueue?.length || 0,
            circuitBreaker: siteQueue?.circuitBreaker?.getStatus(),
            stats: siteQueue?.stats || { enqueued: 0, completed: 0, failed: 0 }
        };
    }
    
    getStats() {
        let totalQueueLength = 0;
        let runningSites = 0;
        
        for (const [name, status] of this.siteStatus) {
            const queue = this.siteQueues.get(name);
            totalQueueLength += queue?.length || 0;
            if (status.running > 0) runningSites++;
        }
        
        return {
            runningSites,
            totalQueueLength,
            globalConcurrency: this.globalConcurrency,
            runningTasks: this.runningTasks
        };
    }
    
    async shutdown() {
        this.isShuttingDown = true;
        while (this.runningTasks > 0) {
            await this._sleep(100);
        }
        this.emit('shutdown');
    }
    
    _parseDelay(delay) {
        if (typeof delay === 'number') {
            return { min: delay, max: delay, isRange: false };
        }
        if (typeof delay === 'string' && delay.includes('-')) {
            const [min, max] = delay.split('-').map(Number);
            return { min, max, isRange: true };
        }
        return { min: 1000, max: 3000, isRange: true };
    }
    
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
