import fs from 'fs-extra';
import yaml from 'js-yaml';
import path from 'path';
import { mergeDeep } from '../utils/merge.js';

export default class PolicyManager {
    constructor(configDir) {
        this.configDir = configDir;
        this.globalPolicy = null;
        this.policyCache = new Map();
    }

    async loadGlobalPolicy() {
        const policyPath = path.join(this.configDir, 'policy.yaml');
        if (await fs.pathExists(policyPath)) {
            this.globalPolicy = yaml.load(await fs.readFile(policyPath, 'utf8'));
        } else {
            this.globalPolicy = this._getDefaultGlobalPolicy();
        }
        return this.globalPolicy;
    }

    async loadSitePolicy(policyName) {
        if (typeof policyName === 'object') {
            return this._mergePolicy(this.globalPolicy.default, policyName);
        }

        if (this.policyCache.has(policyName)) {
            return this.policyCache.get(policyName);
        }

        const policyPath = path.join(this.configDir, 'policies', `${policyName}.yaml`);
        let sitePolicy = {};

        if (await fs.pathExists(policyPath)) {
            sitePolicy = yaml.load(await fs.readFile(policyPath, 'utf8'));
        }

        const mergedPolicy = await this._mergePolicy(
            this.globalPolicy.default,
            sitePolicy,
            this.globalPolicy.templates
        );

        this.policyCache.set(policyName, mergedPolicy);
        return mergedPolicy;
    }

    async _mergePolicy(defaultPolicy, sitePolicy, templates = {}) {
        let result = { ...defaultPolicy };

        if (sitePolicy.extends && templates[sitePolicy.extends]) {
            result = mergeDeep(result, templates[sitePolicy.extends]);
        }

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

    async getPolicyForSite(spiderConfig) {
        if (!this.globalPolicy) {
            await this.loadGlobalPolicy();
        }

        let policy = this.globalPolicy.default;

        if (spiderConfig.policy) {
            policy = await this.loadSitePolicy(spiderConfig.policy);
        }

        // 爬虫特定配置覆盖策略
        const finalConfig = mergeDeep(policy, spiderConfig);

        return finalConfig;
    }

    _getDefaultGlobalPolicy() {
        return {
            version: "1.0",
            default: {
                rate_limit: { enabled: true, qps: 10, algorithm: 'token_bucket' },
                proxy: { enabled: false },
                circuit_breaker: { enabled: true, failure_threshold: 10 },
                cache: { enabled: true, type: 'memory', ttl: 3600 },
                retry: { max_attempts: 3, backoff: 'exponential', delay: 1000 },
                delay: { type: 'adaptive', adaptive: { target_rate: 10 } },
                timeout: 30000,
                user_agent: 'Mozilla/5.0...'
            },
            templates: {},
            proxy_pools: {},
            cache_servers: {}
        };
    }
}