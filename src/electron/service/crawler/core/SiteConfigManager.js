import fs from 'fs-extra';
import yaml from 'js-yaml';
import path from 'path';
import { mergeDeep } from '../utils/merge.js';

/**
 * 站点配置管理器
 * 
 * 职责：
 * - 加载和管理站点配置（原 ConfigLoader 职责）
 * - 加载和管理策略配置（原 PolicyManager 职责）
 * - 合并站点配置和策略配置
 * - 提供统一的配置访问接口
 */
export default class SiteConfigManager {
    constructor(options = {}) {
        this.sitesDir = options.sitesDir || './configs/sites';
        this.policiesDir = options.policiesDir || './configs/policies';
        this.defaultPolicy = options.defaultPolicy || 'default';
        
        // 缓存
        this.siteConfigs = new Map();      // siteName -> merged config
        this.rawSiteConfigs = new Map();   // siteName -> raw config
        this.siteSourcePaths = new Map();  // siteName -> source file path
        
        // 策略相关（继承自 PolicyManager）
        this.globalPolicy = null;
        this.policyCache = new Map();
        
        this.logger = options.logger || console;
        this.initialized = false;
    }

    /**
     * ==================== 策略管理方法（原 PolicyManager） ====================
     */
    
    /**
     * 加载全局策略
     */
    async loadGlobalPolicy() {
        const policyPath = path.join(this.policiesDir, 'global.yaml');
        
        if (await fs.pathExists(policyPath)) {
            this.globalPolicy = yaml.load(await fs.readFile(policyPath, 'utf8'));
            this.logger.debug('Loaded global policy from:', policyPath);
        } else {
            this.globalPolicy = this._getDefaultGlobalPolicy();
            this.logger.debug('Using default global policy');
        }
        
        return this.globalPolicy;
    }

    /**
     * 加载站点策略（按名称）
     */
    async loadSitePolicy(policyName) {
        // 如果是内联策略对象，直接合并
        if (typeof policyName === 'object') {
            return this._mergePolicy(this.globalPolicy.default, policyName);
        }

        // 检查缓存
        if (this.policyCache.has(policyName)) {
            return this.policyCache.get(policyName);
        }

        // 加载策略文件
        const policyPath = path.join(this.policiesDir, `${policyName}.yaml`);
        let sitePolicy = {};

        if (await fs.pathExists(policyPath)) {
            sitePolicy = yaml.load(await fs.readFile(policyPath, 'utf8'));
            this.logger.debug(`Loaded policy: ${policyName}`);
        } else {
            this.logger.warn(`Policy not found: ${policyName}, using default`);
        }

        // 合并策略（支持继承）
        const mergedPolicy = await this._mergePolicy(
            this.globalPolicy.default,
            sitePolicy,
            this.globalPolicy.templates
        );

        // 缓存
        this.policyCache.set(policyName, mergedPolicy);
        
        return mergedPolicy;
    }

    /**
     * 合并策略（支持继承）
     */
    async _mergePolicy(defaultPolicy, sitePolicy, templates = {}) {
        let result = { ...defaultPolicy };

        // 处理继承
        if (sitePolicy.extends && templates[sitePolicy.extends]) {
            result = mergeDeep(result, templates[sitePolicy.extends]);
        }

        // 合并站点策略
        result = mergeDeep(result, sitePolicy);

        // 解析代理池引用
        if (result.proxy?.pool && typeof result.proxy.pool === 'string') {
            const poolName = result.proxy.pool;
            if (this.globalPolicy.proxy_pools?.[poolName]) {
                result.proxy.pool = this.globalPolicy.proxy_pools[poolName];
            }
        }

        return result;
    }

    /**
     * 获取站点的完整策略配置（合并全局策略、模板、站点策略）
     */
    async getPolicyForSite(siteConfig) {
        if (!this.globalPolicy) {
            await this.loadGlobalPolicy();
        }

        let policy = this.globalPolicy.default;

        // 如果站点配置中指定了策略名称
        if (siteConfig.policy) {
            policy = await this.loadSitePolicy(siteConfig.policy);
        }

        // 站点配置覆盖策略（站点配置优先级最高）
        const finalConfig = mergeDeep(policy, siteConfig);

        return finalConfig;
    }

    /**
     * ==================== 站点配置管理方法（原 ConfigLoader） ====================
     */

    /**
     * 初始化配置管理器
     */
    async initialize() {
        if (this.initialized) return;
        
        this.logger.info('Initializing SiteConfigManager...');
        
        // 确保目录存在
        await fs.ensureDir(this.sitesDir);
        await fs.ensureDir(this.policiesDir);
        
        // 加载全局策略
        await this.loadGlobalPolicy();
        
        this.initialized = true;
        this.logger.info('SiteConfigManager initialized');
        
        return this;
    }

    /**
     * 加载单个站点配置
     */
    async loadSite(siteName) {
        // 检查缓存
        if (this.siteConfigs.has(siteName)) {
            return this.siteConfigs.get(siteName);
        }
        
        // 构建文件路径
        const sitePath = path.join(this.sitesDir, `${siteName}.yaml`);
        
        if (!await fs.pathExists(sitePath)) {
            throw new Error(`Site config not found: ${siteName} at ${sitePath}`);
        }
        
        // 加载原始配置
        const rawConfig = yaml.load(await fs.readFile(sitePath, 'utf8'));
        
        // 保存原始配置和源路径
        this.rawSiteConfigs.set(siteName, rawConfig);
        this.siteSourcePaths.set(siteName, sitePath);
        
        // 获取策略配置
        const policyConfig = await this.getPolicyForSite(rawConfig);
        
        // 合并配置（策略 + 站点配置）
        const mergedConfig = mergeDeep({}, policyConfig, rawConfig);
        
        // 添加元数据
        mergedConfig._source = sitePath;
        mergedConfig._loadedAt = new Date();
        mergedConfig._policy = rawConfig.policy || 'default';
        
        // 验证配置
        this._validateConfig(mergedConfig);
        
        // 缓存
        this.siteConfigs.set(siteName, mergedConfig);
        
        this.logger.debug(`Loaded site: ${siteName} (policy: ${mergedConfig._policy})`);
        this.logger.debug(`  - URL: ${mergedConfig.url || mergedConfig.startUrls?.[0]}`);
        
        return mergedConfig;
    }

    /**
     * 加载所有站点配置
     */
    async loadAllSites() {
        if (!await fs.pathExists(this.sitesDir)) {
            this.logger.warn(`Sites directory not found: ${this.sitesDir}`);
            return [];
        }
        
        const files = await fs.readdir(this.sitesDir);
        const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
        
        const configs = [];
        
        for (const file of yamlFiles) {
            const siteName = path.basename(file, path.extname(file));
            try {
                const config = await this.loadSite(siteName);
                configs.push(config);
            } catch (error) {
                this.logger.error(`Failed to load site ${siteName}: ${error.message}`);
            }
        }
        
        this.logger.info(`Loaded ${configs.length} sites`);
        return configs;
    }

    /**
     * 重新加载站点配置
     */
    async reloadSite(siteName) {
        // 清除缓存
        this.siteConfigs.delete(siteName);
        this.rawSiteConfigs.delete(siteName);
        
        // 重新加载
        return await this.loadSite(siteName);
    }

    /**
     * 重新加载策略配置
     */
    async reloadPolicy(policyName) {
        // 清除策略缓存
        this.policyCache.delete(policyName);
        
        // 重新加载策略
        const policy = await this.loadSitePolicy(policyName);
        
        // 重新加载所有使用该策略的站点
        for (const [siteName, rawConfig] of this.rawSiteConfigs) {
            if (rawConfig.policy === policyName) {
                await this.reloadSite(siteName);
            }
        }
        
        return policy;
    }

    /**
     * 验证配置
     */
    _validateConfig(config) {
        const errors = [];
        
        if (!config.name) {
            errors.push('Site name is required');
        }
        
        if (!config.url && !config.startUrls) {
            errors.push('URL or startUrls is required');
        }
        
        if (config.workflow && !Array.isArray(config.workflow)) {
            errors.push('Workflow must be an array');
        }
        
        if (errors.length > 0) {
            throw new Error(`Invalid config for ${config.name}: ${errors.join(', ')}`);
        }
        
        return true;
    }

    /**
     * ==================== 查询方法 ====================
     */

    /**
     * 获取站点配置
     */
    getSiteConfig(siteName) {
        return this.siteConfigs.get(siteName);
    }

    /**
     * 获取所有站点配置
     */
    getAllSiteConfigs() {
        return Array.from(this.siteConfigs.values());
    }

    /**
     * 获取所有站点名称
     */
    getAllSiteNames() {
        return Array.from(this.siteConfigs.keys());
    }

    /**
     * 获取策略配置
     */
    getPolicy(policyName) {
        return this.policyCache.get(policyName);
    }

    /**
     * 获取全局策略
     */
    getGlobalPolicy() {
        return this.globalPolicy;
    }

    /**
     * 检查站点是否存在
     */
    hasSite(siteName) {
        return this.siteConfigs.has(siteName);
    }

    /**
     * 获取站点源文件路径
     */
    getSiteSourcePath(siteName) {
        return this.siteSourcePaths.get(siteName);
    }

    /**
     * ==================== 统计信息 ====================
     */

    /**
     * 获取统计信息
     */
    getStats() {
        const enabledSites = Array.from(this.siteConfigs.values()).filter(c => c.enabled !== false).length;
        
        return {
            sites: {
                total: this.siteConfigs.size,
                enabled: enabledSites,
                disabled: this.siteConfigs.size - enabledSites,
                names: Array.from(this.siteConfigs.keys())
            },
            policies: {
                total: this.policyCache.size,
                names: Array.from(this.policyCache.keys())
            },
            initialized: this.initialized
        };
    }

    /**
     * ==================== 工具方法 ====================
     */

    /**
     * 清空缓存
     */
    clearCache() {
        this.siteConfigs.clear();
        this.rawSiteConfigs.clear();
        this.siteSourcePaths.clear();
        this.policyCache.clear();
    }

    /**
     * 获取默认全局策略
     */
    _getDefaultGlobalPolicy() {
        return {
            version: "1.0",
            default: {
                rate_limit: { 
                    enabled: true, 
                    qps: 10, 
                    algorithm: 'token_bucket',
                    burst: 15,
                    group_by: 'domain',
                    action: 'wait'
                },
                proxy: { 
                    enabled: false,
                    type: 'pool',
                    rotation: 'round_robin',
                    retry_on_fail: true
                },
                circuit_breaker: { 
                    enabled: true, 
                    failure_threshold: 10,
                    failure_rate_threshold: 0.3,
                    sliding_window_size: 60,
                    timeout: 60000
                },
                cache: { 
                    enabled: true, 
                    type: 'memory', 
                    ttl: 3600,
                    strategy: 'lru'
                },
                retry: { 
                    max_attempts: 3, 
                    backoff: 'exponential', 
                    delay: 1000,
                    max_delay: 30000,
                    retry_on_status: [429, 500, 502, 503, 504]
                },
                delay: { 
                    type: 'adaptive', 
                    adaptive: { 
                        enabled: true, 
                        target_rate: 10,
                        adjustment_factor: 0.1
                    }
                },
                timeout: 30000,
                concurrency: 1,
                user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            templates: {},
            proxy_pools: {},
            cache_servers: {}
        };
    }

    /**
     * 关闭配置管理器
     */
    async close() {
        this.clearCache();
        this.initialized = false;
        this.globalPolicy = null;
        this.logger.info('SiteConfigManager closed');
    }
}