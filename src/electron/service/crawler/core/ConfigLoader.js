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

    /**
     * 解析原始配置
     */
    _parse(rawConfig, sourcePath) {
        const config = {
            version: rawConfig.version || '1.0',
            name: rawConfig.name,
            url: rawConfig.url,
            enabled: rawConfig.enabled !== false,
            concurrency: rawConfig.concurrency || 1,
            delay: this._parseDelay(rawConfig.delay),
            timeout: rawConfig.timeout || 30,
            retry: rawConfig.retry || 3,
            startUrls: rawConfig.startUrls,
            userAgent: rawConfig.user_agent,
            headers: rawConfig.headers,
            proxy: rawConfig.proxy,
            login: rawConfig.login ? this._parseLogin(rawConfig.login) : null,
            workflow: this._parseWorkflow(rawConfig.workflow || []),
            _source: sourcePath,
            _loadedAt: new Date()
        };
        
        return config;
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
     * 解析登录配置
     */
    _parseLogin(login) {
        const type = Object.keys(login)[0];
        return { type, config: login[type] };
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