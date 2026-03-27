// src/crawler/config/SitePolicyParser.js
import fs from 'fs-extra';
import yaml from 'js-yaml';
import path from 'path';
import { mergeDeep } from '../utils/merge.js';

/**
 * 站点策略解析器
 * 负责：加载策略配置、合并策略（支持继承）、解析代理池引用
 */
export default class SitePolicyParser {
    constructor(options = {}) {
        this.policiesDir = options.policiesDir || './configs/policies';
        this.logger = options.logger || console;
        this.globalPolicy = null;
        this.policyCache = new Map();
    }

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
     * 解析策略配置（支持字符串名称或内联对象）
     * @param {string|Object} policyInput - 策略名称或内联策略对象
     * @returns {Promise<Object>} 解析后的策略配置
     */
    async resolvePolicy(policyInput) {
        // 没有配置策略，返回默认策略
        if (!policyInput) {
            return this.globalPolicy.default;
        }

        // 内联策略对象
        if (typeof policyInput === 'object') {
            this.logger.debug('Using inline policy');
            return this._mergePolicy(this.globalPolicy.default, policyInput);
        }

        // 字符串：策略名称
        if (typeof policyInput === 'string') {
            return await this.loadSitePolicy(policyInput);
        }

        return this.globalPolicy.default;
    }

    /**
     * 加载站点策略（按名称）
     * @param {string} policyName - 策略名称
     * @returns {Promise<Object>} 策略配置
     */
    async loadSitePolicy(policyName) {
        // 检查缓存
        if (this.policyCache.has(policyName)) {
            return this.policyCache.get(policyName);
        }

        // 加载策略文件
        const policyPath = path.join(this.policiesDir, `${policyName}.yaml`);
        let sitePolicy = {};

        if (await fs.pathExists(policyPath)) {
            sitePolicy = yaml.load(await fs.readFile(policyPath, 'utf8'));
            this.logger.debug(`Loaded policy from file: ${policyName}`);
        } else {
            this.logger.warn(`Policy file not found: ${policyName}.yaml, using default`);
            return this.globalPolicy.default;
        }

        // 合并策略（支持继承）
        const mergedPolicy = this._mergePolicy(
            this.globalPolicy.default,
            sitePolicy,
            this.globalPolicy.templates || {}
        );

        // 缓存
        this.policyCache.set(policyName, mergedPolicy);

        return mergedPolicy;
    }

    /**
     * 合并策略（支持继承）
     */
    _mergePolicy(defaultPolicy, sitePolicy, templates = {}) {
        let result = { ...defaultPolicy };

        // 处理继承（策略可以继承另一个策略）
        if (sitePolicy.extends) {
            const parentPolicy = this.policyCache.get(sitePolicy.extends);
            if (parentPolicy) {
                result = mergeDeep(result, parentPolicy);
            } else if (templates[sitePolicy.extends]) {
                result = mergeDeep(result, templates[sitePolicy.extends]);
            }
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

        // 解析缓存服务器引用
        if (result.cache?.server && typeof result.cache.server === 'string') {
            const serverName = result.cache.server;
            if (this.globalPolicy.cache_servers?.[serverName]) {
                result.cache = mergeDeep(result.cache, this.globalPolicy.cache_servers[serverName]);
            }
        }

        return result;
    }

    /**
     * 获取站点的完整策略配置
     * @param {Object} siteConfig - 站点配置（已解析）
     * @returns {Promise<Object>} 合并后的策略配置
     */
    async getPolicyForSite(siteConfig) {
        if (!this.globalPolicy) {
            await this.loadGlobalPolicy();
        }

        // 解析 policy 字段
        let policyConfig;

        if (siteConfig.policy) {
            if (siteConfig.policy.inline) {
                // 内联策略
                policyConfig = siteConfig.policy.config;
                this.logger.debug(`Using inline policy for site: ${siteConfig.name}`);
            } else if (siteConfig.policy.name) {
                // 文件策略
                policyConfig = await this.loadSitePolicy(siteConfig.policy.name);
                this.logger.debug(`Using policy file for site ${siteConfig.name}: ${siteConfig.policy.name}`);
            } else {
                // 兼容旧格式：直接是字符串
                policyConfig = await this.loadSitePolicy(siteConfig.policy);
            }
        } else {
            // 没有指定策略，使用默认策略
            policyConfig = this.globalPolicy.default;
            this.logger.debug(`Using default policy for site: ${siteConfig.name}`);
        }

        // 站点配置覆盖策略（站点配置优先级最高）
        return mergeDeep(policyConfig, siteConfig);
    }

    /**
     * 重新加载策略
     */
    async reloadPolicy(policyName) {
        this.policyCache.delete(policyName);
        return await this.loadSitePolicy(policyName);
    }

    /**
     * 获取策略
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
     * 清空策略缓存
     */
    clearCache() {
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
                    burst: 15,
                    algorithm: 'token_bucket',
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
                    retry_on_status: [429, 500, 502, 503, 504],
                    retry_on_errors: ['ECONNRESET', 'ETIMEDOUT']
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
                user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            templates: {},
            proxy_pools: {},
            cache_servers: {}
        };
    }
}