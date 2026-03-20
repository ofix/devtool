export default class IncrementalManager {
    constructor(dbPath) {
      this.db = new Database(dbPath);
      this.initTables();
      // 内存缓存：加速重复检查
      this.cache = new LRUCache({ max: 10000 });
    }
    
    async isProcessed(crawlerName, contentHash) {
      // 1. 先查内存缓存
      if (this.cache.has(contentHash)) return true;
      // 2. 再查数据库
      const result = await this.db.prepare(`
        SELECT COUNT(*) FROM processed_items 
        WHERE crawler_name = ? AND content_hash = ?
      `).get(crawlerName, contentHash);
      // 3. 更新缓存
      if (result.count > 0) {
        this.cache.set(contentHash, true);
      }
      return result.count > 0;
    }
    
    async markProcessed(crawlerName, contentHash, data) {
      // 1. 存储到数据库
      // 2. 更新内存缓存
      // 3. 记录历史统计
      await this.db.prepare(`
        INSERT INTO processed_items 
        (crawler_name, content_hash, item_data, processed_at)
        VALUES (?, ?, ?, ?)
      `).run(crawlerName, contentHash, JSON.stringify(data), new Date());
      
      this.cache.set(contentHash, true);
    }
  }