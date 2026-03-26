import { EventEmitter } from 'events';
import Task from './Task.js';
import ResourceFetcher from '../infrastructure/ResourceFetcher.js';

/**
 * 工作流执行器
 * 职责：执行站点的工作流定义，协调 Processor 完成任务
 * 
 * 1.  步骤索引：支持 type.model 和 alias 两种查找方式
 * 2.  登录处理：支持多种登录类型
 * 3.  任务执行：完整的任务生命周期管理
 * 4.  子任务创建：支持 &detail 语法创建子任务
 * 5.  数据保存：集成存储管理器
 * 6.  下载处理：支持字段中的下载配置
 * 7.  重试机制：指数退避重试
 * 8.  事件系统：丰富的事件通知
 * 9.  统计信息：进度和统计信息
 * 10. 资源管理：正确初始化和关闭资源
 * 
 * 工作流示例：
 * workflow:
 *   - list.pagination:
 *       urlTemplate: "https://example.com/page/{page}"
 *       items: "article.item"
 *       fields:
 *         title: "h2.title"
 *         link&detail: "a@href"
 *         date: ".publish-date"
 *   - page.standard: &detail
 *       title.string: ".post-title"
 *       content.string: ".post-body"
 */
export default class WorkflowExecutor extends EventEmitter {
    /**
     * 构造函数
     * @param {Object} siteConfig - 站点配置
     * @param {Object} dependencies - 依赖注入
     */
    constructor(siteConfig, dependencies) {
        super();

        // 站点配置
        this.siteConfig = siteConfig;
        this.siteName = siteConfig.name;
        this.workflow = siteConfig.workflow || [];
        this.startUrls = siteConfig.startUrls || (siteConfig.url ? [siteConfig.url] : []);

        // 建立步骤索引
        this.stepIndex = new Map();
        this._buildStepIndex();

        // 依赖注入
        this.processorRegistry = dependencies.processorRegistry;
        this.scheduler = dependencies.scheduler;
        this.downloadManager = dependencies.downloadManager;
        this.storageManager = dependencies.storageManager;
        this.incrementalManager = dependencies.incrementalManager;
        this.logger = dependencies.logger;
        this.policyManager = dependencies.policyManager;
        this.browserManager = dependencies.browserManager;

        // 运行时状态
        this.isLoggedIn = false;
        this.authContext = null;
        this.resourceFetcher = null;
        this.stats = {
            processed: 0,      // 已处理任务数
            success: 0,        // 成功任务数
            failed: 0,         // 失败任务数
            startTime: null,   // 开始时间
            endTime: null      // 结束时间
        };

        // 事件转发标记
        this._eventForwarders = new Map();

        this.logger.debug(`[${this.siteName}] WorkflowExecutor created with ${this.workflow.length} steps`);
    }

    /**
     * 建立步骤索引（支持 type.model 和 alias 两种查找方式）
     * @private
     */
    _buildStepIndex() {
        for (let i = 0; i < this.workflow.length; i++) {
            const step = this.workflow[i];

            // 获取步骤的 type 和 model
            let type = null;
            let model = null;
            let config = null;

            // 解析步骤格式：支持 { "type.model": config } 和 { type, model, config } 两种
            if (step.type && step.model) {
                type = step.type;
                model = step.model;
                config = step.config || {};
            } else {
                const keys = Object.keys(step);
                if (keys.length === 1 && keys[0].includes('.')) {
                    const [stepType, stepModel] = keys[0].split('.');
                    type = stepType;
                    model = stepModel;
                    config = step[keys[0]];
                }
            }

            if (type && model) {
                const stepKey = `${type}.${model}`;
                this.stepIndex.set(stepKey, {
                    type,
                    model,
                    config,
                    index: i,
                    alias: step.alias || null,
                    raw: step
                });

                // 如果有别名，也建立别名索引
                if (step.alias) {
                    this.stepIndex.set(step.alias, {
                        type,
                        model,
                        config,
                        index: i,
                        alias: step.alias,
                        raw: step
                    });
                }
            }
        }

        this.logger.debug(`[${this.siteName}] Built step index with ${this.stepIndex.size} entries`);
    }

    /**
     * 通过别名获取步骤配置
     * @param {string} alias - 步骤别名
     * @returns {Object|null} 步骤配置
     */
    getStepByAlias(alias) {
        return this.stepIndex.get(alias) || null;
    }

    /**
     * 获取起始任务列表
     * @returns {Array<Task>} 起始任务列表
     */
    getStartTasks() {
        if (this.startUrls.length === 0) {
            this.logger.warn(`[${this.siteName}] No start URLs configured`);
            return [];
        }

        const firstStep = this.workflow[0];
        if (!firstStep) {
            this.logger.warn(`[${this.siteName}] No workflow steps configured`);
            return [];
        }

        // 解析第一个步骤的类型
        let type = null;
        let model = null;
        let stepRef = null;

        if (firstStep.type && firstStep.model) {
            type = firstStep.type;
            model = firstStep.model;
            stepRef = firstStep.alias || `${type}.${model}`;
        } else {
            const keys = Object.keys(firstStep);
            if (keys.length === 1 && keys[0].includes('.')) {
                [type, model] = keys[0].split('.');
                stepRef = firstStep.alias || keys[0];
            }
        }

        if (!type || !model) {
            this.logger.error(`[${this.siteName}] Invalid first step format`);
            return [];
        }

        const maxRetries = this.siteConfig.retry?.max_attempts || 3;

        return this.startUrls.map(url => new Task({
            siteName: this.siteName,
            type: type,
            model: model,
            url: url,
            stepRef: stepRef,
            contextId: null,
            maxRetries: maxRetries,
            priority: 10,  // 起始任务高优先级
            retryCount: 0,
            createdAt: Date.now()
        }));
    }

    /**
     * 获取或初始化站点的 ResourceFetcher
     * @returns {Promise<ResourceFetcher>}
     * @private
     */
    async _getResourceFetcher() {
        if (this.resourceFetcher) {
            return this.resourceFetcher;
        }

        // 获取该站点的策略配置
        const policyConfig = await this.policyManager.getPolicyForSite(this.siteConfig);

        // 创建该站点专用的 ResourceFetcher
        this.resourceFetcher = new ResourceFetcher(policyConfig, {
            browserManager: this.browserManager,
            authContext: this.authContext,
            siteName: this.siteName,
            timeout: this.siteConfig.timeout,
            userAgent: this.siteConfig.user_agent,
            maxRetries: this.siteConfig.retry?.max_attempts || 3,
            retryDelay: this.siteConfig.retry?.delay || 1000
        });

        // 转发事件
        this._forwardFetcherEvents();

        this.logger.debug(`[${this.siteName}] ResourceFetcher initialized with policy: ${policyConfig.name || 'default'}`);

        return this.resourceFetcher;
    }

    /**
     * 转发 ResourceFetcher 的事件
     * @private
     */
    _forwardFetcherEvents() {
        const events = ['circuitBreakerOpen', 'circuitBreakerClose', 'circuitBreakerHalfOpen',
            'requestComplete', 'request', 'response', 'cacheHit', 'authUpdated'];

        for (const event of events) {
            const handler = (data) => {
                this.emit(event, { ...data, site: this.siteName });
            };
            this.resourceFetcher.on(event, handler);
            this._eventForwarders.set(event, handler);
        }
    }

    /**
     * 移除事件转发器
     * @private
     */
    _removeEventForwarders() {
        if (!this.resourceFetcher) return;

        for (const [event, handler] of this._eventForwarders) {
            this.resourceFetcher.off(event, handler);
        }
        this._eventForwarders.clear();
    }

    /**
     * 执行单个任务
     * @param {Task} task - 任务对象
     * @param {Object} options - 执行选项
     * @returns {Promise<Object>} 执行结果
     */
    async executeTask(task, options = {}) {
        this.stats.startTime = this.stats.startTime || Date.now();
        this.stats.processed++;

        this.logger.debug(`[${this.siteName}] Executing: ${task.type}.${task.model} - ${task.url}`);
        this.emit('taskStart', { task, site: this.siteName, timestamp: Date.now() });

        try {
            // 1. 处理登录
            if (this.siteConfig.login && !this.isLoggedIn) {
                await this._handleLogin();
            }

            // 2. 获取资源获取器
            const fetcher = await this._getResourceFetcher();

            // 3. 获取步骤配置
            const step = this.getStepByAlias(task.stepRef);
            if (!step) {
                throw new Error(`Step not found: ${task.stepRef}`);
            }

            // 4. 获取处理器
            const processor = this.processorRegistry.get(task.type, task.model);
            if (!processor) {
                throw new Error(`Processor not found: ${task.type}.${task.model}`);
            }

            // 5. 执行处理器
            const result = await processor.execute({
                url: task.url,
                config: step.config,
                authContext: this.authContext,
                resourceFetcher: fetcher,
                downloadManager: this.downloadManager,
                storageManager: this.storageManager,
                incrementalManager: this.incrementalManager,
                logger: this.logger,
                proxy: options.proxy,
                context: {
                    siteName: this.siteName,
                    taskId: task.id,
                    stepRef: task.stepRef
                }
            });

            // 6. 保存数据
            if (step.config.save && result.data) {
                await this._saveData(result.data, step.config.save, task);
            }

            // 7. 处理下载（字段中的下载配置）
            if (result.data && step.config.fields) {
                await this._handleDownloads(result.data, step.config.fields);
            }

            // 8. 创建并加入子任务
            const subTasks = await this._createAndEnqueueSubTasks(result, step.config, task);

            // 9. 更新统计
            this.stats.success++;

            const duration = Date.now() - (task.startedAt || task.createdAt);
            this.emit('taskComplete', {
                task,
                result,
                site: this.siteName,
                subTasksCount: subTasks.length,
                duration,
                timestamp: Date.now()
            });

            this.logger.debug(`[${this.siteName}] Task completed: ${task.url} (${duration}ms, ${subTasks.length} subTasks)`);

            return {
                data: result.data,
                subTasks: subTasks,
                duration
            };

        } catch (error) {
            this.stats.failed++;

            this.emit('taskError', {
                task,
                error: error.message,
                stack: error.stack,
                site: this.siteName,
                timestamp: Date.now()
            });

            // 检查是否是熔断器错误
            if (error.message.includes('Circuit breaker')) {
                this.emit('circuitBreakerBlocked', {
                    task,
                    error: error.message,
                    site: this.siteName
                });
            }

            // 重试逻辑
            if (task.retryCount < task.maxRetries) {
                task.retryCount++;
                const retryDelay = this._calculateRetryDelay(task.retryCount);

                this.logger.warn(`[${this.siteName}] Task ${task.id} failed, retry ${task.retryCount}/${task.maxRetries} after ${retryDelay}ms: ${error.message}`);
                this.emit('taskRetry', {
                    task,
                    retryCount: task.retryCount,
                    maxRetries: task.maxRetries,
                    delay: retryDelay,
                    error: error.message,
                    timestamp: Date.now()
                });

                // 延迟后重新加入队列
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                await this.scheduler.addTask(this.siteName, task);

                return {
                    error: error.message,
                    retry: true,
                    task: task,
                    delay: retryDelay
                };
            }

            // 超过重试次数，标记为死信
            this.logger.error(`[${this.siteName}] Task ${task.id} failed after ${task.maxRetries} retries: ${error.message}`);
            this.emit('taskDead', {
                task,
                error: error.message,
                retries: task.retryCount,
                maxRetries: task.maxRetries,
                timestamp: Date.now()
            });

            throw error;
        }
    }

    /**
     * 执行工作流（批量执行起始任务）
     * @param {Array<Task>} tasks - 任务列表（可选，默认使用起始任务）
     * @returns {Promise<Array>} 执行结果列表
     */
    async executeWorkflow(tasks = null) {
        const taskList = tasks || this.getStartTasks();

        if (taskList.length === 0) {
            this.logger.warn(`[${this.siteName}] No tasks to execute`);
            return [];
        }

        this.logger.info(`[${this.siteName}] Starting workflow execution with ${taskList.length} tasks`);
        this.emit('workflowStart', {
            site: this.siteName,
            taskCount: taskList.length,
            timestamp: Date.now()
        });

        const results = [];

        for (const task of taskList) {
            try {
                const result = await this.executeTask(task);
                results.push(result);
            } catch (error) {
                this.logger.error(`[${this.siteName}] Workflow execution failed: ${error.message}`);
                this.emit('workflowError', {
                    site: this.siteName,
                    error: error.message,
                    task: task,
                    timestamp: Date.now()
                });
                throw error;
            }
        }

        this.stats.endTime = Date.now();

        this.emit('workflowComplete', {
            site: this.siteName,
            results,
            stats: this.getProgress(),
            timestamp: Date.now()
        });

        this.logger.info(`[${this.siteName}] Workflow completed: ${this.stats.success}/${this.stats.processed} success`);

        return results;
    }

    /**
     * 保存数据
     * @private
     */
    async _saveData(data, saveConfig, task) {
        try {
            await this.storageManager.save(data, saveConfig, {
                siteName: this.siteName,
                type: task.type,
                model: task.model,
                url: task.url,
                taskId: task.id,
                timestamp: Date.now()
            });

            this.emit('dataSaved', {
                site: this.siteName,
                task,
                dataCount: Array.isArray(data) ? data.length : 1,
                timestamp: Date.now()
            });
        } catch (error) {
            this.logger.error(`[${this.siteName}] Failed to save data: ${error.message}`);
            this.emit('saveError', { site: this.siteName, task, error: error.message });
            throw error;
        }
    }

    /**
     * 处理下载任务
     * @private
     */
    async _handleDownloads(data, fieldsConfig) {
        const fetcher = await this._getResourceFetcher();

        for (const [fieldName, fieldDef] of Object.entries(fieldsConfig)) {
            if (!fieldDef.download) continue;

            const urls = this._getValueByPath(data, fieldName);
            if (!urls) continue;

            const urlList = Array.isArray(urls) ? urls : [urls];

            for (const url of urlList) {
                if (!url || typeof url !== 'string') continue;
                if (!url.startsWith('http')) continue;

                try {
                    const result = await fetcher.fetch(url, {
                        dynamic: false,
                        responseType: 'stream'
                    });

                    await this.downloadManager.save(result, {
                        type: fieldDef.download.type || 'file',
                        path: fieldDef.download.path,
                        siteName: this.siteName,
                        filename: fieldDef.download.filename
                    });

                    this.emit('downloadComplete', {
                        site: this.siteName,
                        url,
                        type: fieldDef.download.type,
                        timestamp: Date.now()
                    });
                } catch (error) {
                    this.logger.error(`[${this.siteName}] Download failed: ${url} - ${error.message}`);
                    this.emit('downloadError', { site: this.siteName, url, error: error.message });
                }
            }
        }
    }

    /**
     * 创建并加入子任务
     * @private
     */
    async _createAndEnqueueSubTasks(result, stepConfig, parentTask) {
        const subTasks = [];
        const fields = stepConfig.fields;

        if (!fields || !result.data) return subTasks;

        for (const [fieldName, fieldDef] of Object.entries(fields)) {
            // 检查是否有子任务引用（&detail 语法）
            const hasSubTask = fieldDef.subTask || fieldDef.subTaskRef || fieldName.includes('&');

            if (!hasSubTask) continue;

            // 获取 URL
            const urls = this._getValueByPath(result.data, fieldName);
            if (!urls) continue;

            const urlList = Array.isArray(urls) ? urls : [urls];

            // 获取目标步骤引用
            let stepRef = fieldDef.subTask?.stepRef || fieldDef.subTaskRef;

            // 解析 &detail 语法
            if (!stepRef && fieldName.includes('&')) {
                stepRef = fieldName.split('&')[1];
            }

            if (!stepRef) {
                this.logger.warn(`[${this.siteName}] SubTask target not specified for field: ${fieldName}`);
                continue;
            }

            const targetStep = this.getStepByAlias(stepRef);
            if (!targetStep) {
                this.logger.warn(`[${this.siteName}] SubTask target not found: ${stepRef}`);
                continue;
            }

            // 为每个 URL 创建子任务
            for (const url of urlList) {
                if (!url || typeof url !== 'string') continue;
                if (!url.startsWith('http')) continue;

                const subTask = new Task({
                    siteName: this.siteName,
                    type: targetStep.type,
                    model: targetStep.model,
                    url: url,
                    stepRef: stepRef,
                    contextId: parentTask.contextId,
                    maxRetries: parentTask.maxRetries,
                    priority: Math.max(0, (parentTask.priority || 5) - 1),
                    retryCount: 0,
                    createdAt: Date.now(),
                    parentTaskId: parentTask.id
                });

                await this.scheduler.addTask(this.siteName, subTask);
                subTasks.push(subTask);

                this.logger.debug(`[${this.siteName}] Created subTask: ${subTask.type}.${subTask.model} -> ${url}`);
            }
        }

        return subTasks;
    }

    /**
     * 通过路径获取对象值
     * @private
     */
    _getValueByPath(obj, path) {
        const parts = path.split('.');
        let value = obj;

        for (const part of parts) {
            if (value === null || value === undefined) return null;
            value = value[part];
        }

        return value;
    }

    /**
     * 处理登录
     * @private
     */
    async _handleLogin() {
        const loginConfig = this.siteConfig.login;
        if (!loginConfig) return;

        this.logger.info(`[${this.siteName}] Attempting login with type: ${loginConfig.type}`);

        const fetcher = await this._getResourceFetcher();

        const processor = this.processorRegistry.get('login', loginConfig.type);
        if (!processor) {
            throw new Error(`Login processor not found: ${loginConfig.type}`);
        }

        const result = await processor.execute({
            config: loginConfig.config,
            siteUrl: this.siteConfig.url,
            resourceFetcher: fetcher,
            logger: this.logger
        });

        if (result.success) {
            this.isLoggedIn = true;
            this.authContext = result.authContext;

            // 更新 fetcher 的认证上下文
            const fetcher = await this._getResourceFetcher();
            fetcher.setAuthContext(this.authContext);

            this.logger.info(`[${this.siteName}] Login successful`);
            this.emit('loginSuccess', { site: this.siteName, type: loginConfig.type });
        } else {
            const errorMsg = `Login failed: ${result.error}`;
            this.logger.error(`[${this.siteName}] ${errorMsg}`);
            this.emit('loginFailed', { site: this.siteName, error: result.error });
            throw new Error(errorMsg);
        }
    }

    /**
     * 计算重试延迟（指数退避）
     * @private
     */
    _calculateRetryDelay(attempt) {
        const policy = this.siteConfig.retry || {};
        const backoff = policy.backoff || 'exponential';
        const baseDelay = policy.delay || 1000;
        const maxDelay = policy.max_delay || 30000;
        const factor = policy.factor || 2;

        let delay;
        if (backoff === 'exponential') {
            delay = baseDelay * Math.pow(factor, attempt - 1);
        } else if (backoff === 'linear') {
            delay = baseDelay * attempt;
        } else {
            delay = baseDelay;
        }

        // 添加随机抖动（±50%），避免雷群效应
        delay = delay * (0.5 + Math.random());

        return Math.min(delay, maxDelay);
    }

    /**
     * 获取执行进度
     * @returns {Object} 进度统计
     */
    getProgress() {
        const now = Date.now();
        const duration = this.stats.startTime
            ? ((this.stats.endTime || now) - this.stats.startTime) / 1000
            : 0;

        return {
            siteName: this.siteName,
            processed: this.stats.processed,
            success: this.stats.success,
            failed: this.stats.failed,
            startTime: this.stats.startTime,
            endTime: this.stats.endTime,
            duration: Math.round(duration * 100) / 100,
            successRate: this.stats.processed > 0
                ? ((this.stats.success / this.stats.processed) * 100).toFixed(2)
                : '0.00',
            isLoggedIn: this.isLoggedIn
        };
    }

    /**
     * 获取统计信息
     * @returns {Object} 详细统计
     */
    getStats() {
        const fetcherStats = this.resourceFetcher?.getStats() || null;

        return {
            executor: this.getProgress(),
            fetcher: fetcherStats,
            workflowSteps: this.workflow.length,
            startUrls: this.startUrls.length
        };
    }

    /**
     * 重置执行器状态
     */
    reset() {
        this.isLoggedIn = false;
        this.authContext = null;
        this.stats = {
            processed: 0,
            success: 0,
            failed: 0,
            startTime: null,
            endTime: null
        };

        if (this.resourceFetcher) {
            this.resourceFetcher.resetCircuitBreaker?.();
        }

        this.logger.debug(`[${this.siteName}] WorkflowExecutor reset`);
    }

    /**
     * 关闭执行器，释放资源
     */
    async close() {
        this.logger.debug(`[${this.siteName}] Closing WorkflowExecutor`);

        this._removeEventForwarders();

        if (this.resourceFetcher) {
            await this.resourceFetcher.close();
            this.resourceFetcher = null;
        }

        this.removeAllListeners();

        this.logger.debug(`[${this.siteName}] WorkflowExecutor closed`);
    }
}