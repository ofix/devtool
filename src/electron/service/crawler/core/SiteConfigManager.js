import fs from 'fs-extra';
import yaml from 'js-yaml';
import path from 'path';
import { glob } from 'glob';
import chokidar from 'chokidar';
import { EventEmitter } from 'events';
import SiteConfigParser from './SiteConfigParser.js';
import SitePolicyParser from './SitePolicyParser.js';

/**
 * 站点配置管理器
 * 职责：管理 SiteConfigParser 和 SitePolicyParser，提供统一的配置访问接口
 * - 加载和管理站点配置（文件 I/O）
 * - 协调配置解析和策略合并
 * - 支持热加载和配置变更监听
 */
export default class SiteConfigManager extends EventEmitter {
    constructor(options = {}) {
        super();

        // 目录配置
        this.sitesDir = options.sitesDir || './configs/sites';
        this.policiesDir = options.policiesDir || './configs/policies';

        // 创建子解析器
        this.configParser = new SiteConfigParser({ logger: options.logger });
        this.policyParser = new SitePolicyParser({
            policiesDir: this.policiesDir,
            logger: options.logger
        });

        // 缓存
        this.siteConfigs = new Map();      // siteName -> merged config
        this.rawSiteConfigs = new Map();   // siteName -> raw config
        this.siteSourcePaths = new Map();  // siteName -> source file path

        // 热加载
        this.watcher = null;
        this.autoWatch = options.autoWatch !== false;

        // 日志
        this.logger = options.logger || console;

        // 初始化状态
        this.initialized = false;
    }

    // ==================== 初始化 ====================

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
        await this.policyParser.loadGlobalPolicy();

        // 加载所有站点配置
        await this._loadAllSites();

        // 启动热加载
        if (this.autoWatch) {
            this._startWatching();
        }

        this.initialized = true;
        this.logger.info(`SiteConfigManager initialized with ${this.siteConfigs.size} sites`);

        return this;
    }

    /**
     * 加载所有站点配置
     */
    async _loadAllSites() {
        const pattern = path.join(this.sitesDir, '**/*.{yaml,yml}');
        const files = await glob(pattern);

        for (const file of files) {
            try {
                await this.loadSiteFromFile(file);
            } catch (error) {
                this.emit('error', { file, error: error.message });
                this.logger.error(`Failed to load site from ${file}: ${error.message}`);
            }
        }
    }

    // ==================== 加载站点 ====================

    /**
     * 从文件加载站点配置
     */
    async loadSiteFromFile(filePath) {
        const fullPath = path.resolve(filePath);
        const content = await fs.readFile(fullPath, 'utf-8');
        const rawConfig = yaml.load(content);
        const siteName = path.basename(filePath, path.extname(filePath));

        return await this.loadSite(siteName, rawConfig, fullPath);
    }

    /**
     * 加载站点配置
     */
    async loadSite(siteName, rawConfig = null, sourcePath = null) {
        // 检查缓存
        if (this.siteConfigs.has(siteName) && !rawConfig) {
            return this.siteConfigs.get(siteName);
        }

        // 如果没有提供 rawConfig，从文件加载
        if (!rawConfig) {
            const filePath = sourcePath || path.join(this.sitesDir, `${siteName}.yaml`);
            if (!await fs.pathExists(filePath)) {
                throw new Error(`Site config not found: ${siteName}`);
            }
            const content = await fs.readFile(filePath, 'utf-8');
            rawConfig = yaml.load(content);
            sourcePath = filePath;
        }

        // 1. 解析配置
        const parsedConfig = this.configParser.parse(rawConfig, sourcePath);

        // 2. 获取策略配置
        const policyConfig = await this.policyParser.getPolicyForSite(parsedConfig);

        // 3. 合并配置（策略 + 站点配置）
        const mergedConfig = this._mergeConfig(policyConfig, parsedConfig);

        // 4. 添加元数据
        mergedConfig._source = sourcePath;
        mergedConfig._loadedAt = new Date();
        mergedConfig._policy = parsedConfig.policy || 'default';

        // 5. 验证配置
        this.configParser.validate(mergedConfig);

        // 6. 缓存
        this.siteConfigs.set(siteName, mergedConfig);
        this.rawSiteConfigs.set(siteName, rawConfig);
        this.siteSourcePaths.set(siteName, sourcePath);

        this.logger.debug(`Loaded site: ${siteName} (policy: ${mergedConfig._policy})`);
        this.emit('siteLoaded', { siteName, config: mergedConfig });

        return mergedConfig;
    }

    /**
     * 合并配置
     */
    _mergeConfig(policyConfig, siteConfig) {
        // 简单深度合并
        return this._deepMerge(policyConfig, siteConfig);
    }

    _deepMerge(target, source) {
        const result = { ...target };
        for (const [key, value] of Object.entries(source)) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                result[key] = this._deepMerge(result[key] || {}, value);
            } else {
                result[key] = value;
            }
        }
        return result;
    }

    // ==================== 重新加载 ====================

    /**
     * 重新加载站点配置
     */
    async reloadSite(siteName) {
        this.siteConfigs.delete(siteName);
        this.rawSiteConfigs.delete(siteName);
        return await this.loadSite(siteName);
    }

    /**
     * 重新加载策略配置
     */
    async reloadPolicy(policyName) {
        // 重新加载策略
        const policy = await this.policyParser.reloadPolicy(policyName);

        // 重新加载所有使用该策略的站点
        for (const [siteName, config] of this.siteConfigs) {
            if (config._policy === policyName) {
                await this.reloadSite(siteName);
            }
        }

        this.emit('policyReloaded', { name: policyName, policy });
        this.logger.info(`Policy reloaded: ${policyName}`);

        return policy;
    }

    // ==================== 保存/删除 ====================

    /**
     * 保存站点配置
     */
    async saveSite(siteName, config) {
        const filePath = path.join(this.sitesDir, `${siteName}.yaml`);

        // 清理元数据
        const cleanConfig = { ...config };
        delete cleanConfig._source;
        delete cleanConfig._loadedAt;
        delete cleanConfig._policy;

        const yamlStr = yaml.dump(cleanConfig, {
            indent: 2,
            lineWidth: -1,
            noRefs: true,
            sortKeys: true
        });

        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, yamlStr, 'utf-8');

        // 重新加载
        await this.loadSite(siteName, cleanConfig, filePath);

        this.emit('siteSaved', { name: siteName, path: filePath });
        this.logger.info(`Site saved: ${siteName}`);

        return filePath;
    }

    /**
     * 删除站点配置
     */
    async deleteSite(siteName) {
        const filePath = this.siteSourcePaths.get(siteName);
        if (filePath && await fs.pathExists(filePath)) {
            await fs.remove(filePath);
            this.siteConfigs.delete(siteName);
            this.rawSiteConfigs.delete(siteName);
            this.siteSourcePaths.delete(siteName);
            this.emit('siteDeleted', { name: siteName, path: filePath });
            this.logger.info(`Site deleted: ${siteName}`);
        }
    }

    // ==================== 查询接口 ====================

    /**
     * 获取站点配置
     */
    getSite(siteName) {
        return this.siteConfigs.get(siteName) || null;
    }

    /**
     * 获取所有站点配置
     */
    getAllSites() {
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
        return this.policyParser.getPolicy(policyName);
    }

    /**
     * 获取全局策略
     */
    getGlobalPolicy() {
        return this.policyParser.getGlobalPolicy();
    }

    /**
     * 检查站点是否存在
     */
    hasSite(siteName) {
        return this.siteConfigs.has(siteName);
    }

    // ==================== 统计信息 ====================

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
                total: this.policyParser.policyCache.size,
                names: Array.from(this.policyParser.policyCache.keys())
            },
            watching: this.watcher !== null,
            initialized: this.initialized
        };
    }

    // ==================== 热加载 ====================

    /**
     * 启动文件监听
     */
    _startWatching() {
        if (this.watcher) return;

        this.watcher = chokidar.watch([this.sitesDir, this.policiesDir], {
            ignored: /(^|[\/\\])\../,
            persistent: true,
            ignoreInitial: true
        });

        this.watcher
            .on('add', async (filePath) => {
                await this._handleFileChange(filePath, 'add');
            })
            .on('change', async (filePath) => {
                await this._handleFileChange(filePath, 'change');
            })
            .on('unlink', async (filePath) => {
                await this._handleFileChange(filePath, 'unlink');
            });

        this.emit('watching', { sitesDir: this.sitesDir, policiesDir: this.policiesDir });
        this.logger.debug(`Started watching: ${this.sitesDir}, ${this.policiesDir}`);
    }

    /**
     * 处理文件变更
     */
    async _handleFileChange(filePath, event) {
        // 处理站点配置变更
        if (filePath.startsWith(this.sitesDir)) {
            const siteName = path.basename(filePath, path.extname(filePath));

            if (event === 'unlink') {
                this.siteConfigs.delete(siteName);
                this.rawSiteConfigs.delete(siteName);
                this.siteSourcePaths.delete(siteName);
                this.emit('siteRemoved', { name: siteName, path: filePath });
                this.logger.info(`Site removed: ${siteName}`);
            } else {
                try {
                    const newConfig = await this.loadSiteFromFile(filePath);
                    const oldConfig = this.siteConfigs.get(siteName);
                    this.siteConfigs.set(siteName, newConfig);
                    this.emit('siteChanged', { name: siteName, path: filePath, config: newConfig, oldConfig });
                    this.logger.info(`Site reloaded: ${siteName}`);
                } catch (error) {
                    this.emit('error', { event, path: filePath, error: error.message });
                    this.logger.error(`Failed to reload site ${siteName}: ${error.message}`);
                }
            }
        }

        // 处理策略配置变更
        if (filePath.startsWith(this.policiesDir)) {
            const policyName = path.basename(filePath, path.extname(filePath));

            if (event === 'unlink') {
                this.policyParser.policyCache.delete(policyName);
                this.emit('policyRemoved', { name: policyName, path: filePath });
                this.logger.info(`Policy removed: ${policyName}`);
            } else {
                try {
                    await this.reloadPolicy(policyName);
                    this.emit('policyChanged', { name: policyName, path: filePath });
                    this.logger.info(`Policy reloaded: ${policyName}`);
                } catch (error) {
                    this.emit('error', { event, path: filePath, error: error.message });
                    this.logger.error(`Failed to reload policy ${policyName}: ${error.message}`);
                }
            }
        }
    }

    /**
     * 停止文件监听
     */
    stopWatching() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
            this.logger.debug('Stopped watching');
        }
    }

    // ==================== 工具方法 ====================

    /**
     * 转换值类型（委托给解析器）
     */
    convertValue(value, type, multiple = false) {
        return this.configParser.convertValue(value, type, multiple);
    }

    /**
     * 清空缓存
     */
    clearCache() {
        this.siteConfigs.clear();
        this.rawSiteConfigs.clear();
        this.siteSourcePaths.clear();
        this.policyParser.clearCache();
        this.logger.debug('Cache cleared');
    }

    /**
     * 关闭配置管理器
     */
    async close() {
        this.logger.info('Closing SiteConfigManager...');

        this.stopWatching();
        this.clearCache();
        this.initialized = false;
        this.removeAllListeners();

        this.logger.info('SiteConfigManager closed');
    }
}