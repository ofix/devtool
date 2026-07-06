// parser/CacheManager.js

import { createHash } from 'crypto';

export class CacheManager {
  constructor(options = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize || 100;
    this.ttl = options.ttl || 60000; // 默认60秒
  }

  /**
   * 生成文件哈希
   */
  generateFileHash(content) {
    return createHash('md5').update(content).digest('hex');
  }

  /**
   * 获取缓存
   */
  get(filePath, content = null) {
    const entry = this.cache.get(filePath);
    if (!entry) return null;

    // 检查是否过期
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(filePath);
      return null;
    }

    // 如果提供了内容，检查是否变更
    if (content !== null) {
      const currentHash = this.generateFileHash(content);
      if (entry.fileHash !== currentHash) {
        this.cache.delete(filePath);
        return null;
      }
    }

    return entry.result;
  }

  /**
   * 设置缓存
   */
  set(filePath, content, result) {
    // 如果缓存已满，移除最旧的条目
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(filePath, {
      result,
      timestamp: Date.now(),
      fileHash: this.generateFileHash(content),
      dependencies: new Set(result.includes || [])
    });
  }

  /**
   * 清除缓存
   */
  clear() {
    this.cache.clear();
  }

  /**
   * 清除特定文件的缓存
   */
  invalidate(filePath) {
    this.cache.delete(filePath);
  }

  /**
   * 获取缓存统计
   */
  getStats() {
    let hitCount = 0;
    let missCount = 0;
    
    return {
      total: this.cache.size,
      maxSize: this.maxSize,
      hitRate: this.cache.size > 0 ? (hitCount / (hitCount + missCount) * 100) : 0
    };
  }

  /**
   * 检查文件是否在缓存中且有效
   */
  isValid(filePath, content = null) {
    const entry = this.cache.get(filePath);
    if (!entry) return false;
    
    if (Date.now() - entry.timestamp > this.ttl) return false;
    
    if (content !== null) {
      const currentHash = this.generateFileHash(content);
      if (entry.fileHash !== currentHash) return false;
    }
    
    return true;
  }

  /**
   * 获取所有缓存的文件路径
   */
  getCachedFiles() {
    return Array.from(this.cache.keys());
  }
}

export default CacheManager;