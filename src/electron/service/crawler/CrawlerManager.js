import QueueManager from "./QueueManager.js";
export default class CrawlerManager extends EventEmitter {
    constructor(options) {
      // 管理所有爬虫实例
      this.crawlers = new Map();
      this.queueManager = // 创建队列管理器
      this.queueManager = new QueueManager({
        globalConcurrent: 3,        // 全局最多同时运行3个任务
        maxConcurrentPerSite: 1,    // 每个站点最多同时运行1个任务
        queueTimeout: 30000,        // 任务超时时间30秒
        autoProcess: true           // 自动处理队列
      });
      
      this.circuitBreakers = new Map();
    }
    
    // 工厂方法：创建爬虫实例
    async registerCrawler(config) {
      // 1. 创建熔断器
      const breaker = new CircuitBreaker(config);
      // 2. 创建爬虫实例
      const crawler = new BaseCrawler(config, {
        circuitBreaker: breaker,
        queueManager: this.queueManager
      });
      // 3. 注册事件监听
      this.setupCrawlerEvents(crawler);
      // 4. 存储实例
      this.crawlers.set(config.name, crawler);
    }
    
    // 调度器：控制并发和排队
    async startCrawler(name) {
      // 1. 检查熔断状态
      // 2. 检查站点队列
      // 3. 通过QueueManager调度
      await this.queueManager.enqueue(name, async () => {
        await crawler.start();
      });
    }
    
    // 状态聚合：收集所有爬虫状态
    getAllStatus() {
      // 聚合每个爬虫的状态、熔断器状态、队列状态
    }
  }