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
 * 站点配置解析器
 * 负责：解析 YAML 配置、校验字段、转换类型
 */
export default class SiteConfigParser {
    constructor(options = {}) {
        this.logger = options.logger || console;
    }

    /**
     * 解析配置（添加 policy 字段处理）
     */
    parse(rawConfig, sourcePath) {
        // 解析占位符
        const resolved = this._resolvePlaceholders(rawConfig, rawConfig);

        // 解析常量
        const constants = this._parseConstants(resolved.constants || {});
        const configWithConstants = this._resolvePlaceholders(resolved, constants);

        // 解析各类配置
        const circuitBreaker = this._parseCircuitBreaker(configWithConstants.circuit_breaker);
        const rateLimit = this._parseRateLimit(configWithConstants.rate_limit);
        const proxy = this._parseProxy(configWithConstants.proxy);
        const retryStrategy = this._parseRetryStrategy(configWithConstants.retry);
        const cache = this._parseCache(configWithConstants.cache);

        // 解析登录配置
        let loginConfig = null;
        const loginKey = Object.keys(configWithConstants).find(key => key.startsWith('login.'));
        if (loginKey) {
            const type = loginKey.split('.')[1];
            loginConfig = { type, config: configWithConstants[loginKey] };
        }

        // 解析工作流
        const workflow = this._parseWorkflow(configWithConstants.workflow || [], constants);

        // ✅ 解析 policy 字段（支持字符串或对象）
        let policyConfig = null;
        if (configWithConstants.policy) {
            if (typeof configWithConstants.policy === 'string') {
                // 字符串：策略名称
                policyConfig = {
                    name: configWithConstants.policy,
                    inline: false
                };
            } else if (typeof configWithConstants.policy === 'object') {
                // 对象：内联策略
                policyConfig = {
                    name: null,
                    inline: true,
                    config: configWithConstants.policy
                };
            }
        }

        // 构建最终配置
        const config = {
            version: configWithConstants.version || '1.0',
            name: configWithConstants.name,
            url: configWithConstants.url,
            enabled: configWithConstants.enabled !== false,
            concurrency: configWithConstants.concurrency || 1,
            delay: this._parseDelay(configWithConstants.delay),
            timeout: configWithConstants.timeout || 30,
            retry: retryStrategy,
            rate_limit: rateLimit,
            circuit_breaker: circuitBreaker,
            proxy: proxy,
            cache: cache,
            userAgent: configWithConstants.user_agent || this._getDefaultUserAgent(),
            headers: configWithConstants.headers || {},
            cookies: configWithConstants.cookies || {},
            startUrls: configWithConstants.startUrls || [],
            login: loginConfig,
            workflow: workflow,
            // ✅ 保留 policy 配置
            policy: policyConfig,
            _source: sourcePath,
            _loadedAt: new Date()
        };

        return config;
    }

    /**
     * 解析工作流
     */
    _parseWorkflow(workflow, constants) {
        if (!Array.isArray(workflow)) return [];

        const steps = [];
        const stepIndex = new Map();

        // 第一遍：解析步骤
        for (let i = 0; i < workflow.length; i++) {
            const step = workflow[i];
            const parsed = this._parseStep(step, i);
            steps.push(parsed);

            if (parsed.alias) {
                stepIndex.set(parsed.alias, { index: i, step: parsed });
            }
            stepIndex.set(`${parsed.type}.${parsed.model}`, { index: i, step: parsed });
        }

        // 第二遍：解析字段
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
     */
    _parseStep(step, index) {
        const stepKey = Object.keys(step)[0];
        let type, model, alias;

        if (stepKey.includes('&')) {
            const [typeModel, aliasName] = stepKey.split('&');
            [type, model] = typeModel.split('.');
            alias = aliasName;
        } else {
            [type, model] = stepKey.split('.');
            alias = null;
        }

        return {
            type: type,
            model: model || 'default',
            alias: alias,
            index: index,
            config: step[stepKey] || {}
        };
    }

    /**
     * 解析字段定义
     */
    _parseFields(fields, stepIndex) {
        if (!fields || typeof fields !== 'object') return {};

        const parsed = {};

        for (const [key, value] of Object.entries(fields)) {
            try {
                let fieldName = key;
                let stepRef = null;

                if (key.includes('&')) {
                    const parts = key.split('&');
                    fieldName = parts[0];
                    stepRef = parts[1];
                }

                const { selector, attribute, isXPath, multiple } = this._parseSelector(value);

                if (selector) {
                    this._validateSelector(selector, isXPath);
                }

                let type = 'string';
                let multipleFlag = multiple;

                if (fieldName.includes('.')) {
                    const parts = fieldName.split('.');
                    fieldName = parts[0];
                    const typeHint = parts[1];

                    if (typeHint === 'true') {
                        type = 'url';
                    } else if (SUPPORTED_TYPES[typeHint]) {
                        type = typeHint;
                    } else {
                        throw new Error(`Unsupported type: ${typeHint}`);
                    }
                }

                if (fieldName.endsWith('[]')) {
                    fieldName = fieldName.slice(0, -2);
                    multipleFlag = true;
                }

                if (!fieldName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(fieldName)) {
                    throw new Error(`Invalid field name: ${fieldName}`);
                }

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

        if (value.includes('@')) {
            const parts = value.split('@');
            selector = parts[0];
            attribute = parts[1];
            if (!attribute || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(attribute)) {
                throw new Error(`Invalid attribute name: ${attribute}`);
            }
        }

        if (selector.endsWith('*')) {
            selector = selector.slice(0, -1);
            multiple = true;
        }

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
        if (!selector) throw new Error('Selector cannot be empty');
        if (!SELECTOR_RULES.notEmpty(selector)) throw new Error('Selector cannot be empty');

        if (isXPath) {
            if (!SELECTOR_RULES.xpath(selector)) {
                throw new Error(`Invalid XPath: ${selector}`);
            }
            return;
        }

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
     * 解析熔断器配置
     */
    _parseCircuitBreaker(circuitBreaker) {
        if (!circuitBreaker) return null;
        return {
            name: circuitBreaker.name || 'default',
            enabled: circuitBreaker.enabled !== false,
            failure_threshold: circuitBreaker.failure_threshold || 5,
            failure_rate_threshold: circuitBreaker.failure_rate_threshold || 0.5,
            sliding_window_size: circuitBreaker.sliding_window_size || 60,
            timeout: circuitBreaker.timeout || 60000,
            half_open_max_attempts: circuitBreaker.half_open_max_attempts || 3,
            recovery_strategy: circuitBreaker.recovery_strategy || 'timeout',
            monitor_interval: circuitBreaker.monitor_interval || 10000,
            fallback: circuitBreaker.fallback ? {
                type: circuitBreaker.fallback.type || 'cache',
                value: circuitBreaker.fallback.value,
                ttl: circuitBreaker.fallback.ttl || 3600
            } : null,
            silent_fail: circuitBreaker.silent_fail !== false,
            ignore_exceptions: circuitBreaker.ignore_exceptions || []
        };
    }

    /**
     * 解析限流配置
     */
    _parseRateLimit(rateLimit) {
        if (!rateLimit) return null;
        return {
            qps: rateLimit.qps || null,
            rpm: rateLimit.rpm || null,
            rph: rateLimit.rph || null,
            rpd: rateLimit.rpd || null,
            burst: rateLimit.burst || 1,
            algorithm: rateLimit.algorithm || 'token_bucket',
            action: rateLimit.action || 'wait',
            queueSize: rateLimit.queue_size || 100,
            groupBy: rateLimit.group_by || 'domain',
            key: rateLimit.key || null
        };
    }

    /**
     * 解析代理配置
     */
    _parseProxy(proxy) {
        if (!proxy) return null;
        if (typeof proxy === 'string') {
            return { type: 'static', url: proxy, enabled: true };
        }
        return {
            type: proxy.type || 'static',
            url: proxy.url || null,
            pool: proxy.pool ? {
                urls: proxy.pool.urls || [],
                auth: proxy.pool.auth ? {
                    username: proxy.pool.auth.username,
                    password: proxy.pool.auth.password
                } : null,
                refresh: proxy.pool.refresh || 'never',
                refreshInterval: proxy.pool.refresh_interval || 3600,
                healthCheck: proxy.pool.health_check !== false,
                healthCheckInterval: proxy.pool.health_check_interval || 300
            } : null,
            api: proxy.api ? {
                url: proxy.api.url,
                method: proxy.api.method || 'GET',
                headers: proxy.api.headers || {},
                responsePath: proxy.api.response_path || 'data',
                refreshInterval: proxy.api.refresh_interval || 300
            } : null,
            rotation: proxy.rotation || 'round_robin',
            retryOnFail: proxy.retry_on_fail !== false,
            maxRetries: proxy.max_retries || 3,
            enabled: proxy.enabled !== false,
            matchUrls: proxy.match_urls || null,
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
            backoff: retry.backoff || 'exponential',
            delay: retry.delay || 1000,
            maxDelay: retry.max_delay || 30000,
            factor: retry.factor || 2,
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
            type: cache.type || 'memory',
            memory: cache.memory ? {
                maxSize: cache.memory.max_size || 1000,
                ttl: cache.memory.ttl || 3600
            } : null,
            redis: cache.redis ? {
                host: cache.redis.host || 'localhost',
                port: cache.redis.port || 6379,
                password: cache.redis.password,
                db: cache.redis.db || 0,
                ttl: cache.redis.ttl || 3600
            } : null,
            file: cache.file ? {
                path: cache.file.path || './cache',
                ttl: cache.file.ttl || 86400
            } : null,
            strategy: cache.strategy || 'ttl',
            keyGenerator: cache.key_generator || 'url',
            methods: cache.methods || ['GET'],
            condition: cache.condition || null
        };
    }

    /**
     * 解析延迟配置
     */
    _parseDelay(delay) {
        if (!delay) return null;
        if (typeof delay === 'number') {
            return { type: 'fixed', value: delay };
        }
        return {
            type: delay.type || 'fixed',
            value: delay.value || 1000,
            min: delay.min,
            max: delay.max,
            adaptive: delay.adaptive ? {
                enabled: true,
                targetRate: delay.adaptive.target_rate,
                adjustmentFactor: delay.adaptive.adjustment_factor || 0.1
            } : null
        };
    }

    /**
     * 解析占位符
     */
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

    /**
     * 解析常量
     */
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

    /**
     * 通过路径获取值
     */
    _getValueByPath(obj, path) {
        return path.split('.').reduce((current, key) => {
            if (current && typeof current === 'object' && key in current) {
                return current[key];
            }
            return undefined;
        }, obj);
    }

    /**
     * 获取类型默认值
     */
    _getDefaultValue(type) {
        const typeDef = SUPPORTED_TYPES[type];
        return typeDef ? typeDef.default : null;
    }

    /**
     * 获取默认 User-Agent
     */
    _getDefaultUserAgent() {
        return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }

    /**
     * 转换值类型（运行时）
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

    /**
     * 校验配置
     */
    validate(config) {
        const errors = [];

        if (!config.name) errors.push('Missing required field: name');
        if (!config.url && (!config.startUrls || config.startUrls.length === 0)) {
            errors.push('Missing required field: url or startUrls');
        }
        if (!config.workflow || config.workflow.length === 0) {
            errors.push('Missing required field: workflow');
        }

        for (let i = 0; i < config.workflow.length; i++) {
            const step = config.workflow[i];
            if (step.type === 'list' && !step.config.items) {
                errors.push(`Step ${i} (${step.alias || step.type}.${step.model}): missing 'items' selector`);
            }
        }

        if (errors.length > 0) {
            throw new Error(`Config validation failed:\n${errors.join('\n')}`);
        }
    }
}