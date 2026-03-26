export default class SiteManager extends EventEmitter {
    constructor(configDir) {
        super();
        this.configDir = configDir;
        this.sites = new Map();      // 站点配置缓存
        this.engines = new Map();    // 站点引擎缓存
        this.policyManager = new PolicyManager(configDir);
    }
    
    /**
     * 加载站点配置
     */
    async loadSite(siteName) {
        const sitePath = path.join(this.configDir, 'sites', `${siteName}.yaml`);
        
        if (!await fs.pathExists(sitePath)) {
            throw new Error(`Site config not found: ${siteName}`);
        }
        
        const siteConfig = yaml.load(await fs.readFile(sitePath, 'utf8'));
        this.sites.set(siteName, siteConfig);
        
        return siteConfig;
    }
    
    /**
     * 获取或创建站点的 WorkflowEngine
     */
    async getSiteEngine(siteName, dependencies) {
        if (this.engines.has(siteName)) {
            return this.engines.get(siteName);
        }
        
        const siteConfig = await this.loadSite(siteName);
        
        const engine = new WorkflowEngine(siteConfig, {
            ...dependencies,
            policyManager: this.policyManager
        });
        
        this.engines.set(siteName, engine);
        return engine;
    }
    
    /**
     * 获取站点策略（直接访问）
     */
    async getSitePolicy(siteName) {
        const siteConfig = await this.loadSite(siteName);
        return await this.policyManager.getPolicyForSite(siteConfig);
    }
    
    /**
     * 获取所有站点的统计信息
     */
    getAllStats() {
        const stats = {};
        for (const [siteName, engine] of this.engines.entries()) {
            stats[siteName] = {
                engine: engine.getProgress(),
                fetcher: engine.resourceFetcher?.getStats()
            };
        }
        return stats;
    }
}