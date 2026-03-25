import { EventEmitter } from 'events';
import CircuitBreaker from './CircuitBreaker.js';

export default class GlobalScheduler extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.globalConcurrency = options.globalConcurrency || 5;
        this.activeCount = 0;
        this.sites = new Map();           // siteName -> siteConfig
        this.taskProcessor = null;
        this.isRunning = true;
        
        // 调度策略
        this.schedulingPolicy = options.schedulingPolicy || 'fair';
        this.lastSelectedSite = null;
    }
    
    /**
     * 注册站点
     */
    registerSite(siteName, config = {}) {
        this.sites.set(siteName, {
            // 队列（用数组）
            queue: [],
            
            // 配置
            config: {
                concurrency: config.concurrency || 1,
                priority: config.priority || 5,
                retryCount: config.retryCount || 3,
                retryDelay: config.retryDelay || 2000,
                requestDelay: this._parseDelay(config.requestDelay || "1000-3000"),
                enabled: config.enabled !== false,
                paused: false
            },
            
            // 统计
            stats: {
                enqueued: 0,
                completed: 0,
                failed: 0,
                running: 0
            },
            
            // 熔断器
            circuitBreaker: config.circuit_breaker?.enabled !== false 
                ? new CircuitBreaker(config.circuit_breaker) 
                : null
        });
        
        this.emit('siteRegistered', { siteName });
    }
    
    /**
     * 添加任务
     */
    async addTask(siteName, task) {
        const site = this.sites.get(siteName);
        if (!site) {
            throw new Error(`Site ${siteName} not registered`);
        }
        
        if (!site.config.enabled) {
            throw new Error(`Site ${siteName} is disabled`);
        }
        if (site.config.paused) {
            throw new Error(`Site ${siteName} is paused`);
        }
        if (site.circuitBreaker?.isOpen()) {
            throw new Error(`Circuit breaker is open for ${siteName}`);
        }
        
        // 包装任务
        const wrappedTask = {
            ...task,
            id: task.id || `${siteName}:${Date.now()}:${Math.random().toString(36).substr(2, 8)}`,
            siteName,
            priority: task.priority || site.config.priority,
            retryCount: 0,
            createdAt: Date.now()
        };
        
        // 直接操作数组
        site.queue.push(wrappedTask);
        site.stats.enqueued++;
        
        this.emit('taskAdded', { siteName, task: wrappedTask });
        
        this._schedule();
    }
    
    /**
     * 调度器
     */
    _schedule() {
        while (this.activeCount < this.globalConcurrency && this.isRunning) {
            const task = this._selectTask();
            if (!task) break;
            
            this.activeCount++;
            this._executeTask(task).finally(() => {
                this.activeCount--;
                this._schedule();
            });
        }
    }
    
    /**
     * 选择下一个任务
     */
    _selectTask() {
        switch (this.schedulingPolicy) {
            case 'priority':
                return this._selectByPriority();
            case 'round_robin':
                return this._selectRoundRobin();
            default:
                return this._selectFair();
        }
    }
    
    /**
     * 按优先级选择
     */
    _selectByPriority() {
        let bestTask = null;
        let bestPriority = -1;
        let bestSiteName = null;
        
        for (const [siteName, site] of this.sites) {
            if (!site.config.enabled || site.config.paused) continue;
            if (site.queue.length === 0) continue;
            if (site.stats.running >= site.config.concurrency) continue;
            if (site.circuitBreaker?.isOpen()) continue;
            
            const task = site.queue[0];
            const priority = task.priority || site.config.priority;
            
            if (priority > bestPriority) {
                bestPriority = priority;
                bestTask = task;
                bestSiteName = siteName;
            }
        }
        
        if (bestTask) {
            const site = this.sites.get(bestSiteName);
            const task = site.queue.shift();
            site.stats.running++;
            return task;
        }
        
        return null;
    }
    
    /**
     * 轮询选择
     */
    _selectRoundRobin() {
        const siteNames = Array.from(this.sites.keys());
        if (siteNames.length === 0) return null;
        
        let startIndex = this.lastSelectedSite 
            ? siteNames.indexOf(this.lastSelectedSite) 
            : 0;
        if (startIndex === -1) startIndex = 0;
        
        for (let i = 0; i < siteNames.length; i++) {
            const index = (startIndex + i) % siteNames.length;
            const siteName = siteNames[index];
            const site = this.sites.get(siteName);
            
            if (site.config.enabled && 
                !site.config.paused && 
                site.queue.length > 0 && 
                site.stats.running < site.config.concurrency &&
                (!site.circuitBreaker || !site.circuitBreaker.isOpen())) {
                
                this.lastSelectedSite = siteName;
                const task = site.queue.shift();
                site.stats.running++;
                return task;
            }
        }
        
        return null;
    }
    
    /**
     * 公平选择（负载均衡）
     */
    _selectFair() {
        const candidates = [];
        
        for (const [siteName, site] of this.sites) {
            if (!site.config.enabled || site.config.paused) continue;
            if (site.queue.length === 0) continue;
            if (site.stats.running >= site.config.concurrency) continue;
            if (site.circuitBreaker?.isOpen()) continue;
            
            const loadFactor = site.stats.running / site.config.concurrency;
            candidates.push({
                siteName,
                site,
                loadFactor,
                queueLength: site.queue.length,
                priority: site.config.priority
            });
        }
        
        if (candidates.length === 0) return null;
        
        candidates.sort((a, b) => {
            if (a.loadFactor !== b.loadFactor) return a.loadFactor - b.loadFactor;
            if (a.priority !== b.priority) return b.priority - a.priority;
            return b.queueLength - a.queueLength;
        });
        
        const selected = candidates[0];
        const task = selected.site.queue.shift();
        selected.site.stats.running++;
        return task;
    }
    
    /**
     * 执行任务
     */
    async _executeTask(task) {
        const site = this.sites.get(task.siteName);
        const startTime = Date.now();
        
        this.emit('taskStart', { siteName: task.siteName, task });
        
        try {
            // 请求延迟
            const delay = this._getRandomDelay(site.config.requestDelay);
            if (delay > 0) {
                await this._delay(delay);
            }
            
            // 执行任务
            const result = await this.taskProcessor(task, { siteName: task.siteName });
            
            const duration = Date.now() - startTime;
            
            site.stats.completed++;
            site.stats.running--;
            site.circuitBreaker?.recordSuccess();
            
            this.emit('taskComplete', { 
                siteName: task.siteName, 
                task, 
                result, 
                duration 
            });
            
            // 处理子任务
            if (result.subTasks?.length) {
                for (const subTask of result.subTasks) {
                    await this.addTask(task.siteName, subTask);
                }
            }
            
        } catch (error) {
            const duration = Date.now() - startTime;
            
            site.stats.failed++;
            site.stats.running--;
            site.circuitBreaker?.recordFailure();
            
            this.emit('taskFailed', { 
                siteName: task.siteName, 
                task, 
                error: error.message, 
                duration 
            });
            
            // 重试
            if (task.retryCount < site.config.retryCount) {
                task.retryCount++;
                await this._delay(site.config.retryDelay);
                await this.addTask(task.siteName, task);
                this.emit('taskRetry', { 
                    siteName: task.siteName, 
                    task, 
                    retryCount: task.retryCount 
                });
            } else {
                this.emit('taskDead', { 
                    siteName: task.siteName, 
                    task, 
                    error: error.message 
                });
            }
        }
    }
    
    /**
     * 辅助方法
     */
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
    
    _getRandomDelay(delay) {
        if (!delay.isRange) return delay.min;
        return Math.floor(Math.random() * (delay.max - delay.min + 1) + delay.min);
    }
    
    async _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * 控制接口
     */
    pauseSite(siteName) {
        const site = this.sites.get(siteName);
        if (site) {
            site.config.paused = true;
            this.emit('sitePaused', { siteName });
        }
    }
    
    resumeSite(siteName) {
        const site = this.sites.get(siteName);
        if (site) {
            site.config.paused = false;
            this.emit('siteResumed', { siteName });
            this._schedule();
        }
    }
    
    getSiteStatus(siteName) {
        const site = this.sites.get(siteName);
        if (!site) return null;
        
        return {
            name: siteName,
            enabled: site.config.enabled,
            paused: site.config.paused,
            priority: site.config.priority,
            running: site.stats.running,
            queueLength: site.queue.length,
            stats: { ...site.stats },
            config: {
                concurrency: site.config.concurrency,
                retryCount: site.config.retryCount,
                requestDelay: site.config.requestDelay
            },
            circuitBreaker: site.circuitBreaker?.getStatus()
        };
    }
    
    getStats() {
        let totalQueue = 0;
        let totalRunning = 0;
        let totalCompleted = 0;
        let totalFailed = 0;
        let openCircuits = 0;
        
        for (const site of this.sites.values()) {
            totalQueue += site.queue.length;
            totalRunning += site.stats.running;
            totalCompleted += site.stats.completed;
            totalFailed += site.stats.failed;
            if (site.circuitBreaker?.isOpen()) openCircuits++;
        }
        
        return {
            activeTasks: this.activeCount,
            globalConcurrency: this.globalConcurrency,
            tasks: { queue: totalQueue, running: totalRunning, completed: totalCompleted, failed: totalFailed },
            circuitBreakers: { open: openCircuits, total: this.sites.size },
            sites: this.sites.size
        };
    }
    
    async shutdown() {
        this.isRunning = false;
        while (this.activeCount > 0) {
            await this._delay(100);
        }
        this.emit('shutdown');
    }
}