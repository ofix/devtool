import yaml from 'js-yaml';
import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import chokidar from 'chokidar';
import { EventEmitter } from 'events';

/**
 * 支持的字段类型
 */
const SUPPORTED_TYPES = {
    // 基础类型
    string: { default: '', validator: (v) => typeof v === 'string' },
    int: { default: 0, validator: (v) => Number.isInteger(v) || /^\d+$/.test(v) },
    integer: { default: 0, validator: (v) => Number.isInteger(v) || /^\d+$/.test(v) },
    float: { default: 0.0, validator: (v) => !isNaN(parseFloat(v)) },
    double: { default: 0.0, validator: (v) => !isNaN(parseFloat(v)) },
    bool: { default: false, validator: (v) => typeof v === 'boolean' || v === 'true' || v === 'false' },
    boolean: { default: false, validator: (v) => typeof v === 'boolean' || v === 'true' || v === 'false' },

    // 扩展类型
    url: { default: '', validator: (v) => typeof v === 'string' && (v.startsWith('http') || v.startsWith('/')) },
    datetime: { default: null, validator: (v) => !isNaN(Date.parse(v)) },
    date: { default: null, validator: (v) => !isNaN(Date.parse(v)) },
    time: { default: null, validator: (v) => /^\d{2}:\d{2}(:\d{2})?$/.test(v) },

    // 复杂类型
    array: { default: [], validator: (v) => Array.isArray(v) },
    object: { default: {}, validator: (v) => typeof v === 'object' && !Array.isArray(v) },
    html: { default: '', validator: (v) => typeof v === 'string' },
    text: { default: '', validator: (v) => typeof v === 'string' }
};

/**
 * 选择器语法校验规则
 */
const SELECTOR_RULES = {
    notEmpty: (selector) => selector && selector.trim().length > 0,
    css: (selector) => /^[a-zA-Z0-9_#.\[\]="':\s>*+~-]+$/.test(selector),
    xpath: (selector) => /^\.?\/\/[a-zA-Z].*/.test(selector),
    attribute: (selector) => !selector.includes('@') || /^[^@]+@[a-zA-Z]+$/.test(selector)
};

/**
 * 配置加载器
 * 负责：加载 YAML、解析配置、校验字段、热加载、缓存
 */
export default class ConfigLoader extends EventEmitter {
    constructor(options = {}) {
        super();

        this.configPath = options.configPath || './configs';
        this.cache = new Map();           // 配置缓存
        this.watcher = null;
        this.autoWatch = options.autoWatch !== false;
    }

    // ==================== 加载功能 ====================

    /**
     * 加载所有配置文件
     */
    async loadAll() {
        const pattern = path.join(this.configPath, '**/*.{yaml,yml}');
        const files = await glob(pattern);
        const configs = [];

        for (const file of files) {
            try {
                const config = await this.loadFile(file);
                if (config) {
                    configs.push(config);
                    this.cache.set(config.name, config);
                }
            } catch (error) {
                this.emit('error', { file, error: error.message });
            }
        }

        if (this.autoWatch) {
            this._startWatching();
        }

        return configs;
    }

    /**
     * 加载单个配置文件
     */
    async loadFile(filePath) {
        const fullPath = path.resolve(this.configPath, filePath);
        const content = await fs.readFile(fullPath, 'utf-8');
        const rawConfig = yaml.load(content);

        const config = this._parse(rawConfig, fullPath);

        // 校验配置
        this._validateConfig(config);

        return config;
    }

    // ==================== 解析功能 ====================

    _parse(rawConfig, sourcePath) {
        // 解析占位符（支持任意配置引用）
        const resolved = this._resolvePlaceholders(rawConfig, rawConfig);

        // 解析常量定义（可选，作为快捷方式）
        const constants = this._parseConstants(resolved.constants || {});
        const configWithConstants = this._resolvePlaceholders(resolved, constants);

        // 解析熔断器配置
        const circuitBreaker = this._parseCircuitBreaker(configWithConstants.circuit_breaker);
        // 解析限流配置
        const rateLimit = this._parseRateLimit(configWithConstants.rate_limit);

        // 解析代理配置
        const proxy = this._parseProxy(configWithConstants.proxy);

        // 解析登录配置（支持 login.form、login.cookie 等）
        let loginConfig = null;
        const loginKey = Object.keys(configWithConstants).find(key => key.startsWith('login.'));
        if (loginKey) {
            const type = loginKey.split('.')[1];
            loginConfig = {
                type: type,
                config: configWithConstants[loginKey]
            };
        }

        // 解析重试策略
        const retryStrategy = this._parseRetryStrategy(configWithConstants.retry);

        // 解析缓存配置
        const cache = this._parseCache(configWithConstants.cache);

        // 构建最终配置
        const config = {
            // 基础配置
            version: configWithConstants.version || '1.0',
            name: configWithConstants.name,
            url: configWithConstants.url,
            enabled: configWithConstants.enabled !== false,

            // 并发与延迟
            concurrency: configWithConstants.concurrency || 1,
            delay: this._parseDelay(configWithConstants.delay),

            // 超时与重试
            timeout: configWithConstants.timeout || 30,
            retry: retryStrategy,

            // 限流配置
            rate_limit: rateLimit,

            // 熔断器配置
            circuit_breaker: circuitBreaker,

            // 代理配置
            proxy: proxy,

            // 缓存配置
            cache: cache,

            // 请求配置
            userAgent: configWithConstants.user_agent || this._getDefaultUserAgent(),
            headers: configWithConstants.headers || {},
            cookies: configWithConstants.cookies || {},

            // 起始URL
            startUrls: configWithConstants.startUrls || [],

            // 登录配置
            login: loginConfig,

            // 工作流
            workflow: this._parseWorkflow(configWithConstants.workflow || [], constants),

            // 元数据
            _source: sourcePath,
            _loadedAt: new Date()
        };

        return config;
    }

    _parseCircuitBreaker(circuitBreaker) {
        if (!circuitBreaker) return null;
        
        return {
            name: circuitBreaker.name || 'default',
            enabled: circuitBreaker.enabled !== false,
            
            // 熔断阈值
            failure_threshold: circuitBreaker.failure_threshold || 5,
            failure_rate_threshold: circuitBreaker.failure_rate_threshold || 0.5,
            sliding_window_size: circuitBreaker.sliding_window_size || 60,
            
            // 熔断超时（毫秒）
            timeout: circuitBreaker.timeout || 60000,
            
            // 半开状态配置
            half_open_max_attempts: circuitBreaker.half_open_max_attempts || 3,
            
            // 恢复策略
            recovery_strategy: circuitBreaker.recovery_strategy || 'timeout', // timeout / half_open
            
            // 监控间隔（毫秒）
            monitor_interval: circuitBreaker.monitor_interval || 10000,
            
            // 降级配置
            fallback: circuitBreaker.fallback ? {
                type: circuitBreaker.fallback.type || 'cache', // cache / static / custom
                value: circuitBreaker.fallback.value,
                ttl: circuitBreaker.fallback.ttl || 3600
            } : null,
            
            // 熔断时静默失败
            silent_fail: circuitBreaker.silent_fail !== false,
            
            // 异常白名单（不触发熔断的异常）
            ignore_exceptions: circuitBreaker.ignore_exceptions || []
        };
    }

    /**
     * 解析限流配置
     */
    _parseRateLimit(rateLimit) {
        if (!rateLimit) return null;

        return {
            // QPS限制（每秒请求数）
            qps: rateLimit.qps || null,

            // 每分钟请求数限制
            rpm: rateLimit.rpm || null,

            // 每小时请求数限制
            rph: rateLimit.rph || null,

            // 每日请求数限制
            rpd: rateLimit.rpd || null,

            // 突发流量限制（允许的瞬时峰值）
            burst: rateLimit.burst || 1,

            // 限流算法（token_bucket / leaky_bucket / sliding_window）
            algorithm: rateLimit.algorithm || 'token_bucket',

            // 超出限制时的行为（wait / drop / queue）
            action: rateLimit.action || 'wait',

            // 队列大小（action为queue时生效）
            queueSize: rateLimit.queue_size || 100,

            // 限流策略分组（可按域名、IP等分组）
            groupBy: rateLimit.group_by || 'domain', // domain / url / ip

            // 自定义限流键
            key: rateLimit.key || null
        };
    }

    /**
     * 解析代理配置
     */
    _parseProxy(proxy) {
        if (!proxy) return null;

        // 简单代理配置（字符串）
        if (typeof proxy === 'string') {
            return {
                type: 'static',
                url: proxy,
                enabled: true
            };
        }

        // 复杂代理配置（对象）
        return {
            type: proxy.type || 'static', // static / pool / api / random

            // 静态代理
            url: proxy.url || null,

            // 代理池配置
            pool: proxy.pool ? {
                urls: proxy.pool.urls || [],
                auth: proxy.pool.auth ? {
                    username: proxy.pool.auth.username,
                    password: proxy.pool.auth.password
                } : null,
                // 代理池更新策略
                refresh: proxy.pool.refresh || 'never', // never / periodic / on_fail
                refreshInterval: proxy.pool.refresh_interval || 3600, // 秒
                // 代理健康检查
                healthCheck: proxy.pool.health_check !== false,
                healthCheckInterval: proxy.pool.health_check_interval || 300 // 秒
            } : null,

            // API代理（从接口获取代理）
            api: proxy.api ? {
                url: proxy.api.url,
                method: proxy.api.method || 'GET',
                headers: proxy.api.headers || {},
                responsePath: proxy.api.response_path || 'data', // JSONPath
                refreshInterval: proxy.api.refresh_interval || 300 // 秒
            } : null,

            // 代理轮换策略
            rotation: proxy.rotation || 'round_robin', // round_robin / random / least_used / sticky

            // 失败重试
            retryOnFail: proxy.retry_on_fail !== false,
            maxRetries: proxy.max_retries || 3,

            // 代理启用条件
            enabled: proxy.enabled !== false,

            // 代理适用的URL模式（正则表达式）
            matchUrls: proxy.match_urls || null,

            // 排除的URL模式
            excludeUrls: proxy.exclude_urls || null
        };
    }

    /**
     * 解析重试策略
     */
    _parseRetryStrategy(retry) {
        if (typeof retry === 'number') {
            return {
                maxAttempts: retry,
                backoff: 'fixed',
                delay: 1000,
                retryOnStatus: [500, 502, 503, 504],
                retryOnErrors: ['ECONNRESET', 'ETIMEDOUT']
            };
        }

        if (!retry) {
            return {
                maxAttempts: 3,
                backoff: 'fixed',
                delay: 1000,
                retryOnStatus: [500, 502, 503, 504],
                retryOnErrors: ['ECONNRESET', 'ETIMEDOUT']
            };
        }

        return {
            maxAttempts: retry.max_attempts || 3,
            backoff: retry.backoff || 'exponential', // fixed / linear / exponential
            delay: retry.delay || 1000, // 初始延迟（毫秒）
            maxDelay: retry.max_delay || 30000, // 最大延迟
            factor: retry.factor || 2, // 退避因子
            retryOnStatus: retry.retry_on_status || [500, 502, 503, 504],
            retryOnErrors: retry.retry_on_errors || ['ECONNRESET', 'ETIMEDOUT'],
            retryOnTimeout: retry.retry_on_timeout !== false
        };
    }

    /**
     * 解析缓存配置
     */
    _parseCache(cache) {
        if (!cache) return null;

        return {
            enabled: cache.enabled !== false,
            type: cache.type || 'memory', // memory / redis / file

            // 内存缓存配置
            memory: cache.memory ? {
                maxSize: cache.memory.max_size || 1000, // 最大条目数
                ttl: cache.memory.ttl || 3600 // 过期时间（秒）
            } : null,

            // Redis缓存配置
            redis: cache.redis ? {
                host: cache.redis.host || 'localhost',
                port: cache.redis.port || 6379,
                password: cache.redis.password,
                db: cache.redis.db || 0,
                ttl: cache.redis.ttl || 3600
            } : null,

            // 文件缓存配置
            file: cache.file ? {
                path: cache.file.path || './cache',
                ttl: cache.file.ttl || 86400
            } : null,

            // 缓存策略
            strategy: cache.strategy || 'ttl', // ttl / lru / lfu

            // 缓存键生成规则
            keyGenerator: cache.key_generator || 'url', // url / url+method / custom

            // 缓存的请求方法
            methods: cache.methods || ['GET'],

            // 缓存的条件（支持表达式）
            condition: cache.condition || null
        };
    }

    /**
     * 解析延迟配置（支持动态延迟）
     */
    _parseDelay(delay) {
        if (!delay) return null;

        // 固定延迟
        if (typeof delay === 'number') {
            return {
                type: 'fixed',
                value: delay
            };
        }

        // 动态延迟
        return {
            type: delay.type || 'fixed',
            value: delay.value || 1000,
            min: delay.min, // 随机延迟最小值
            max: delay.max, // 随机延迟最大值
            // 动态调整
            adaptive: delay.adaptive ? {
                enabled: true,
                targetRate: delay.adaptive.target_rate, // 目标请求速率
                adjustmentFactor: delay.adaptive.adjustment_factor || 0.1
            } : null
        };
    }

    _getDefaultUserAgent() {
        return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }

    _parseConstants(constants) {
        if (!constants) return {};

        const result = {};
        for (const [key, value] of Object.entries(constants)) {
            if (typeof value === 'object' && value !== null) {
                result[key] = this._parseConstants(value);
            } else {
                result[key] = value;
            }
        }
        return result;
    }

    _resolvePlaceholders(value, context) {
        if (typeof value === 'string') {
            return value.replace(/\${([^}:]+)(?::([^}]*))?}/g, (match, path, defaultValue) => {
                const resolved = this._getValueByPath(context, path);
                return resolved !== undefined ? resolved : (defaultValue || match);
            });
        } else if (Array.isArray(value)) {
            return value.map(item => this._resolvePlaceholders(item, context));
        } else if (typeof value === 'object' && value !== null) {
            const resolved = {};
            for (const [key, val] of Object.entries(value)) {
                resolved[key] = this._resolvePlaceholders(val, context);
            }
            return resolved;
        }
        return value;
    }

    _getValueByPath(obj, path) {
        return path.split('.').reduce((current, key) => {
            if (current && typeof current === 'object' && key in current) {
                return current[key];
            }
            return undefined;
        }, obj);
    }

    /**
     * 解析工作流
     */
    _parseWorkflow(workflow) {
        if (!Array.isArray(workflow)) {
            return [];
        }

        // 第一遍：解析所有步骤，建立步骤索引（按别名）
        const steps = [];
        const stepIndex = new Map();  // alias -> step

        for (let i = 0; i < workflow.length; i++) {
            const step = workflow[i];
            const parsed = this._parseStep(step, i);
            steps.push(parsed);

            // 如果有别名，建立索引
            if (parsed.alias) {
                stepIndex.set(parsed.alias, { index: i, step: parsed });
            }
            // 也支持 type.model 作为默认别名
            stepIndex.set(`${parsed.type}.${parsed.model}`, { index: i, step: parsed });
        }

        // 第二遍：解析字段中的引用（需要步骤索引）
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            if (step.config.fields) {
                step.config.fields = this._parseFields(step.config.fields, stepIndex);
            }
        }

        return steps;
    }

    /**
     * 解析单个步骤
     * 
     * 格式: - type.model&alias
     * 例如: - list.pagination&detail
     */
    _parseStep(step, index) {
        // step 是一个对象，只有一个键
        const stepKey = Object.keys(step)[0];

        // 解析 stepKey: "list.pagination&detail"
        let type, model, alias;

        if (stepKey.includes('&')) {
            const [typeModel, aliasName] = stepKey.split('&');
            [type, model] = typeModel.split('.');
            alias = aliasName;
        } else {
            [type, model] = stepKey.split('.');
            alias = null;
        }

        const stepConfig = step[stepKey] || {};

        return {
            type: type,
            model: model || 'default',
            alias: alias,
            index: index,
            config: stepConfig
        };
    }

    /**
     * 解析字段定义（带校验）
     */
    _parseFields(fields, stepIndex) {
        if (!fields || typeof fields !== 'object') {
            return {};
        }

        const parsed = {};

        for (const [key, value] of Object.entries(fields)) {
            try {
                // 解析字段名: fieldName&stepAlias
                let fieldName = key;
                let stepRef = null;

                if (key.includes('&')) {
                    const parts = key.split('&');
                    fieldName = parts[0];
                    stepRef = parts[1];
                }

                // 解析选择器
                const { selector, attribute, isXPath, multiple } = this._parseSelector(value);

                // 校验选择器
                if (selector) {
                    this._validateSelector(selector, isXPath);
                }

                // 解析字段类型 (fieldName.type)
                let type = 'string';
                let multipleFlag = multiple;

                if (fieldName.includes('.')) {
                    const parts = fieldName.split('.');
                    fieldName = parts[0];
                    const typeHint = parts[1];

                    // 处理 .true 特殊语法（自动下载）
                    if (typeHint === 'true') {
                        type = 'url';
                    } else if (SUPPORTED_TYPES[typeHint]) {
                        type = typeHint;
                    } else {
                        throw new Error(`Unsupported type: ${typeHint}`);
                    }
                }

                // 解析 [] 数组标记
                if (fieldName.endsWith('[]')) {
                    fieldName = fieldName.slice(0, -2);
                    multipleFlag = true;
                }

                // 校验字段名
                if (!fieldName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(fieldName)) {
                    throw new Error(`Invalid field name: ${fieldName}`);
                }

                // 构建字段配置
                const fieldConfig = {
                    selector: selector,
                    attribute: attribute,
                    type: type,
                    multiple: multipleFlag,
                    isXPath: isXPath,
                    required: false,
                    default: this._getDefaultValue(type),
                    _raw: value
                };

                // 如果有步骤引用，查找对应的步骤
                if (stepRef) {
                    const referencedStep = stepIndex.get(stepRef);
                    if (referencedStep) {
                        fieldConfig.subTask = {
                            stepRef: stepRef,
                            type: referencedStep.step.type,
                            model: referencedStep.step.model,
                            alias: referencedStep.step.alias,
                            index: referencedStep.index
                        };
                    } else {
                        // 引用未找到，可能是后续步骤，保存引用名
                        fieldConfig.subTaskRef = stepRef;
                    }
                }

                parsed[fieldName] = fieldConfig;

            } catch (error) {
                throw new Error(`Field "${key}" parse error: ${error.message}`);
            }
        }

        return parsed;
    }

    /**
     * 解析选择器
     */
    _parseSelector(value) {
        if (typeof value !== 'string') {
            return {
                selector: value?.selector || null,
                attribute: value?.attribute || null,
                isXPath: value?.isXPath || false,
                multiple: value?.multiple || false
            };
        }

        let selector = value;
        let attribute = null;
        let isXPath = false;
        let multiple = false;

        // 解析 @attribute
        if (value.includes('@')) {
            const parts = value.split('@');
            selector = parts[0];
            attribute = parts[1];

            if (!attribute || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(attribute)) {
                throw new Error(`Invalid attribute name: ${attribute}`);
            }
        }

        // 解析 * 多个元素
        if (selector.endsWith('*')) {
            selector = selector.slice(0, -1);
            multiple = true;
        }

        // 检测 XPath
        const trimmed = selector.trim();
        if (trimmed.startsWith('.//') || trimmed.startsWith('//')) {
            isXPath = true;
        }

        return { selector: trimmed, attribute, isXPath, multiple };
    }

    /**
     * 校验选择器
     */
    _validateSelector(selector, isXPath) {
        if (!selector) {
            throw new Error('Selector cannot be empty');
        }

        if (!SELECTOR_RULES.notEmpty(selector)) {
            throw new Error('Selector cannot be empty');
        }

        if (isXPath) {
            if (!SELECTOR_RULES.xpath(selector)) {
                throw new Error(`Invalid XPath: ${selector}`);
            }
            return;
        }

        // CSS 选择器宽松校验
        if (!SELECTOR_RULES.css(selector)) {
            const dangerous = /[<>{}]/;
            if (dangerous.test(selector)) {
                throw new Error(`CSS selector contains invalid characters: ${selector}`);
            }
        }

        if (!SELECTOR_RULES.attribute(selector)) {
            throw new Error(`Invalid attribute selector format: ${selector}`);
        }
    }

    /**
     * 获取类型默认值
     */
    _getDefaultValue(type) {
        const typeDef = SUPPORTED_TYPES[type];
        return typeDef ? typeDef.default : null;
    }

    /**
     * 解析延迟配置
     */
    _parseDelay(delay) {
        if (!delay) return { min: 1000, max: 3000, isRange: true };
        if (typeof delay === 'number') return { min: delay, max: delay, isRange: false };
        if (typeof delay === 'string' && delay.includes('-')) {
            const [min, max] = delay.split('-').map(Number);
            return { min, max, isRange: true };
        }
        return { min: 1000, max: 3000, isRange: true };
    }

    // ==================== 校验功能 ====================

    /**
     * 校验整个配置
     */
    _validateConfig(config) {
        const errors = [];

        // 必填字段
        if (!config.name) {
            errors.push('Missing required field: name');
        }
        if (!config.url) {
            errors.push('Missing required field: url');
        }
        if (!config.workflow || config.workflow.length === 0) {
            errors.push('Missing required field: workflow');
        }

        // 校验每个步骤
        for (let i = 0; i < config.workflow.length; i++) {
            const step = config.workflow[i];
            const stepErrors = this._validateStep(step, i);
            errors.push(...stepErrors);
        }

        if (errors.length > 0) {
            throw new Error(`Config validation failed:\n${errors.join('\n')}`);
        }
    }

    /**
     * 校验单个步骤
     */
    _validateStep(step, index) {
        const errors = [];

        if (!step.type) {
            errors.push(`Step ${index}: missing type`);
        }

        if (step.type === 'list') {
            if (!step.config.items) {
                errors.push(`Step ${index} (${step.alias || step.type}.${step.model}): missing 'items' selector`);
            }
        }

        if (step.type === 'page') {
            // page 可以没有特殊配置
        }

        if (step.type === 'download') {
            // download 配置可选
        }

        return errors;
    }

    // ==================== 类型转换（运行时） ====================

    /**
     * 转换值类型
     */
    convertValue(value, type, multiple = false) {
        if (value === null || value === undefined) {
            return this._getDefaultValue(type);
        }

        if (multiple && Array.isArray(value)) {
            return value.map(v => this._convertSingle(v, type));
        }

        if (multiple && !Array.isArray(value)) {
            return [this._convertSingle(value, type)];
        }

        return this._convertSingle(value, type);
    }

    _convertSingle(value, type) {
        switch (type) {
            case 'int':
            case 'integer':
                return parseInt(value, 10);
            case 'float':
            case 'double':
                return parseFloat(value);
            case 'bool':
            case 'boolean':
                if (typeof value === 'boolean') return value;
                return value === 'true' || value === '1' || value === 'yes';
            case 'datetime':
                return new Date(value).toISOString();
            case 'date':
                return new Date(value).toISOString().split('T')[0];
            default:
                return String(value);
        }
    }

    // ==================== 缓存功能 ====================

    getConfig(name) {
        return this.cache.get(name) || null;
    }

    getAllConfigs() {
        return Array.from(this.cache.values());
    }

    // ==================== 保存功能 ====================

    async saveConfig(config, filePath) {
        const cleanConfig = { ...config };
        delete cleanConfig._source;
        delete cleanConfig._loadedAt;

        const yamlStr = yaml.dump(cleanConfig, {
            indent: 2,
            lineWidth: -1,
            noRefs: true,
            sortKeys: true
        });

        const fullPath = path.resolve(this.configPath, filePath);
        await fs.ensureDir(path.dirname(fullPath));
        await fs.writeFile(fullPath, yamlStr, 'utf-8');

        config._source = fullPath;
        config._loadedAt = new Date();
        this.cache.set(config.name, config);

        this.emit('configSaved', { name: config.name, path: fullPath });
        return fullPath;
    }

    async deleteConfig(filePath) {
        const fullPath = path.resolve(this.configPath, filePath);
        if (await fs.pathExists(fullPath)) {
            await fs.remove(fullPath);

            for (const [name, config] of this.cache) {
                if (config._source === fullPath) {
                    this.cache.delete(name);
                    this.emit('configDeleted', { name, path: fullPath });
                    break;
                }
            }
        }
    }

    // ==================== 热加载功能 ====================

    _startWatching() {
        if (this.watcher) return;

        this.watcher = chokidar.watch(this.configPath, {
            ignored: /(^|[\/\\])\../,
            persistent: true,
            ignoreInitial: true
        });

        this.watcher
            .on('add', async (filePath) => {
                if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
                    try {
                        const config = await this.loadFile(filePath);
                        const oldConfig = this.cache.get(config.name);
                        this.cache.set(config.name, config);
                        this.emit('configAdded', { name: config.name, path: filePath, config });
                        if (oldConfig) {
                            this.emit('configChanged', { name: config.name, path: filePath, config, oldConfig });
                        }
                    } catch (error) {
                        this.emit('error', { event: 'add', path: filePath, error: error.message });
                    }
                }
            })
            .on('change', async (filePath) => {
                if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
                    try {
                        const oldConfig = this.cache.get(path.basename(filePath, path.extname(filePath)));
                        const config = await this.loadFile(filePath);
                        this.cache.set(config.name, config);
                        this.emit('configChanged', { name: config.name, path: filePath, config, oldConfig });
                    } catch (error) {
                        this.emit('error', { event: 'change', path: filePath, error: error.message });
                    }
                }
            })
            .on('unlink', (filePath) => {
                if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
                    for (const [name, config] of this.cache) {
                        if (config._source === filePath) {
                            this.cache.delete(name);
                            this.emit('configRemoved', { name, path: filePath });
                            break;
                        }
                    }
                }
            });

        this.emit('watching', { path: this.configPath });
    }

    stopWatching() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
    }

    // ==================== 清理 ====================

    close() {
        this.stopWatching();
        this.removeAllListeners();
        this.cache.clear();
    }
}