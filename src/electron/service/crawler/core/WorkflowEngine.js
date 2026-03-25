// src/crawler/core/WorkflowEngine.js
import { EventEmitter } from 'events';
import Task from './Task.js';

export default class WorkflowEngine extends EventEmitter {
    constructor(siteConfig, dependencies) {
        super();
        
        this.siteConfig = siteConfig;
        this.name = siteConfig.name;
        this.workflow = siteConfig.workflow;
        
        // 建立步骤索引
        this.stepIndex = new Map();
        this._buildStepIndex();
        
        // 依赖注入
        this.processorRegistry = dependencies.processorRegistry;
        this.resourceFetcher = dependencies.resourceFetcher;
        this.scheduler = dependencies.scheduler;
        this.downloadManager = dependencies.downloadManager;
        this.storageManager = dependencies.storageManager;
        this.incrementalManager = dependencies.incrementalManager;
        this.logger = dependencies.logger;
        
        // 运行时状态
        this.isLoggedIn = false;
        this.authContext = null;
        this.stats = {
            processed: 0,
            success: 0,
            failed: 0,
            startTime: null
        };
    }
    
    _buildStepIndex() {
        for (let i = 0; i < this.workflow.length; i++) {
            const step = this.workflow[i];
            const stepKey = `${step.type}.${step.model}`;
            this.stepIndex.set(stepKey, { ...step, index: i });
            if (step.alias) {
                this.stepIndex.set(step.alias, { ...step, index: i });
            }
        }
    }
    
    getStepByAlias(alias) {
        return this.stepIndex.get(alias) || null;
    }
    
    getStartTasks() {
        const startUrls = this.siteConfig.startUrls || [this.siteConfig.url];
        const firstStep = this.workflow[0];
        if (!firstStep) return [];
        
        return startUrls.map(url => new Task({
            siteName: this.name,
            type: firstStep.type,
            model: firstStep.model,
            url: url,
            stepRef: firstStep.alias || `${firstStep.type}.${firstStep.model}`,
            contextId: null,
            maxRetries: this.siteConfig.retry || 3,
            priority: 10  // 起始任务高优先级
        }));
    }
    
    async processTask(task, options = {}) {
        this.stats.startTime = this.stats.startTime || Date.now();
        this.stats.processed++;
        
        this.logger.debug(`[${this.name}] Processing: ${task.type}.${task.model} - ${task.url}`);
        this.emit('taskStart', { task, site: this.name });
        
        try {
            // 1. 登录
            if (this.siteConfig.login && !this.isLoggedIn) {
                await this._handleLogin();
            }
            
            // 2. 获取步骤配置
            const step = this.getStepByAlias(task.stepRef);
            if (!step) {
                throw new Error(`Step not found: ${task.stepRef}`);
            }
            
            // 3. 获取处理器
            const processor = this.processorRegistry.get(task.type, task.model);
            if (!processor) {
                throw new Error(`Processor not found: ${task.type}.${task.model}`);
            }
            
            // 4. 执行处理器
            const result = await processor.execute({
                url: task.url,
                config: step.config,
                authContext: this.authContext,
                resourceFetcher: this.resourceFetcher,
                downloadManager: this.downloadManager,
                storageManager: this.storageManager,
                logger: this.logger,
                proxy: options.proxy
            });
            
            // 5. 保存数据
            if (step.config.save && result.data) {
                await this.storageManager.save(result.data, step.config.save, {
                    siteName: this.name,
                    type: task.type,
                    model: task.model,
                    url: task.url
                });
            }
            
            // 6. 处理下载（字段中的下载配置）
            if (result.data && step.config.fields) {
                await this._handleDownloads(result.data, step.config.fields);
            }
            
            // 7. 创建子任务并加入队列
            const subTasks = await this._createAndEnqueueSubTasks(result, step.config, task);
            
            this.stats.success++;
            this.emit('taskComplete', { 
                task, 
                result, 
                site: this.name, 
                subTasksCount: subTasks.length,
                duration: Date.now() - (task.startedAt || task.createdAt)
            });
            
            return {
                data: result.data,
                subTasks: subTasks
            };
            
        } catch (error) {
            this.stats.failed++;
            this.emit('taskError', { task, error: error.message, site: this.name });
            
            // ✅ 重试逻辑：加入队列而不是直接重试
            if (task.retryCount < task.maxRetries) {
                task.retryCount++;
                
                // 指数退避延迟：2^n 秒，最大 60 秒
                const retryDelay = Math.min(Math.pow(2, task.retryCount) * 1000, 60000);
                
                this.logger.warn(`[${this.name}] Task ${task.id} failed, retry ${task.retryCount}/${task.maxRetries} after ${retryDelay}ms`);
                this.emit('taskRetry', { 
                    task, 
                    retryCount: task.retryCount, 
                    maxRetries: task.maxRetries,
                    delay: retryDelay,
                    error: error.message
                });
                
                // ✅ 延迟后重新加入队列
                setTimeout(async () => {
                    await this.scheduler.addTask(this.name, task);
                }, retryDelay);
                
                // 返回重试状态，不抛出错误
                return {
                    error: error.message,
                    retry: true,
                    task: task,
                    delay: retryDelay
                };
            }
            
            // 超过重试次数，标记为死信
            this.logger.error(`[${this.name}] Task ${task.id} failed after ${task.maxRetries} retries: ${error.message}`);
            this.emit('taskDead', { 
                task, 
                error: error.message, 
                retries: task.retryCount,
                maxRetries: task.maxRetries
            });
            
            throw error;
        }
    }
    
    async _createAndEnqueueSubTasks(result, stepConfig, parentTask) {
        const subTasks = [];
        const fields = stepConfig.fields;
        
        if (!fields || !result.data) return subTasks;
        
        for (const [fieldName, fieldDef] of Object.entries(fields)) {
            // 检查是否有子任务引用
            if (!fieldDef.subTask && !fieldDef.subTaskRef) continue;
            
            // 获取字段值中的 URL
            const urls = this._getUrlsFromField(result.data, fieldName);
            if (!urls) continue;
            
            const urlList = Array.isArray(urls) ? urls : [urls];
            
            // 获取目标步骤
            const stepRef = fieldDef.subTask?.stepRef || fieldDef.subTaskRef;
            const targetStep = this.getStepByAlias(stepRef);
            if (!targetStep) {
                this.logger.warn(`[${this.name}] SubTask target not found: ${stepRef}`);
                continue;
            }
            
            // 为每个 URL 创建子任务并加入队列
            for (const url of urlList) {
                if (!url || typeof url !== 'string') continue;
                if (!url.startsWith('http')) continue;
                
                // 创建子任务
                const subTask = new Task({
                    siteName: this.name,
                    type: targetStep.type,
                    model: targetStep.model,
                    url: url,
                    stepRef: stepRef,
                    contextId: parentTask.contextId,
                    maxRetries: parentTask.maxRetries,
                    priority: Math.max(0, (parentTask.priority || 5) - 1),  // 优先级略低
                    retryCount: 0
                });
                
                // ✅ 加入调度器队列
                await this.scheduler.addTask(this.name, subTask);
                subTasks.push(subTask);
                
                this.logger.debug(`[${this.name}] Created subTask: ${subTask.type}.${subTask.model} -> ${url}`);
            }
        }
        
        return subTasks;
    }
    
    _getUrlsFromField(data, fieldName) {
        const parts = fieldName.split('.');
        let value = data;
        for (const part of parts) {
            if (!value) return null;
            value = value[part];
        }
        return value;
    }
    
    async _handleDownloads(data, fieldsConfig) {
        for (const [fieldName, fieldDef] of Object.entries(fieldsConfig)) {
            if (!fieldDef.download) continue;
            
            const urls = this._getUrlsFromField(data, fieldName);
            if (!urls) continue;
            
            const urlList = Array.isArray(urls) ? urls : [urls];
            for (const url of urlList) {
                if (!url) continue;
                await this.downloadManager.download(url, {
                    type: fieldDef.download.type,
                    path: fieldDef.download.path,
                    siteName: this.name,
                    title: data.title
                });
            }
        }
    }
    
    async _handleLogin() {
        const loginConfig = this.siteConfig.login;
        if (!loginConfig) return;
        
        const processor = this.processorRegistry.get('login', loginConfig.type);
        if (!processor) {
            throw new Error(`Login processor not found: ${loginConfig.type}`);
        }
        
        const result = await processor.execute({
            config: loginConfig.config,
            siteUrl: this.siteConfig.url,
            resourceFetcher: this.resourceFetcher,
            logger: this.logger
        });
        
        if (result.success) {
            this.isLoggedIn = true;
            this.authContext = result.authContext;
            this.logger.info(`[${this.name}] Login successful`);
        } else {
            throw new Error(`Login failed: ${result.error}`);
        }
    }
    
    getProgress() {
        const duration = this.stats.startTime
            ? (Date.now() - this.stats.startTime) / 1000
            : 0;
        
        return {
            ...this.stats,
            duration,
            successRate: this.stats.processed > 0
                ? ((this.stats.success / this.stats.processed) * 100).toFixed(2)
                : 0
        };
    }
}