// lib/cache-manager.js
import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export default class CacheManager {
    constructor(config) {
        this.config = config;
        this.type = config.type || 'memory';
        this.strategy = config.strategy || 'ttl';
        this.cache = new Map(); // 内存缓存
        this.stats = { hits: 0, misses: 0 };
        
        if (this.type === 'redis') {
            this.initRedis();
        } else if (this.type === 'file') {
            this.initFileCache();
        }
    }
    
    initRedis() {
        const redisConfig = this.config.redis;
        this.redis = new Redis({
            host: redisConfig.host,
            port: redisConfig.port,
            password: redisConfig.password,
            db: redisConfig.db
        });
    }
    
    initFileCache() {
        this.cacheDir = this.config.file?.path || './cache';
        // 确保缓存目录存在
        fs.mkdir(this.cacheDir, { recursive: true });
    }
    
    generateKey(request) {
        const generator = this.config.key_generator || 'url';
        
        if (generator === 'url') {
            return this.hash(request.url);
        } else if (generator === 'url+method') {
            return this.hash(`${request.method}:${request.url}`);
        } else if (generator === 'custom' && this.config.key_generator_fn) {
            return this.config.key_generator_fn(request);
        }
        
        return this.hash(JSON.stringify(request));
    }
    
    hash(str) {
        return crypto.createHash('md5').update(str).digest('hex');
    }
    
    async get(request) {
        const key = this.generateKey(request);
        
        // 检查是否应该缓存
        if (!this.shouldCache(request)) {
            return null;
        }
        
        let value = null;
        
        if (this.type === 'memory') {
            value = await this.getFromMemory(key);
        } else if (this.type === 'redis') {
            value = await this.getFromRedis(key);
        } else if (this.type === 'file') {
            value = await this.getFromFile(key);
        }
        
        if (value) {
            this.stats.hits++;
            this.updateLRU(key);
            return value;
        }
        
        this.stats.misses++;
        return null;
    }
    
    async set(request, response) {
        const key = this.generateKey(request);
        const ttl = this.getTTL(request);
        
        if (this.type === 'memory') {
            await this.setToMemory(key, response, ttl);
        } else if (this.type === 'redis') {
            await this.setToRedis(key, response, ttl);
        } else if (this.type === 'file') {
            await this.setToFile(key, response, ttl);
        }
    }
    
    async getFromMemory(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;
        
        // 检查是否过期
        if (entry.expires && entry.expires < Date.now()) {
            this.cache.delete(key);
            return null;
        }
        
        return entry.value;
    }
    
    async setToMemory(key, value, ttl) {
        const expires = ttl ? Date.now() + (ttl * 1000) : null;
        
        this.cache.set(key, {
            value,
            expires,
            lastAccess: Date.now(),
            accessCount: 0
        });
        
        // 检查内存限制
        if (this.config.memory?.maxSize && this.cache.size > this.config.memory.maxSize) {
            this.evict();
        }
    }
    
    async getFromRedis(key) {
        const value = await this.redis.get(key);
        return value ? JSON.parse(value) : null;
    }
    
    async setToRedis(key, value, ttl) {
        const serialized = JSON.stringify(value);
        if (ttl) {
            await this.redis.setex(key, ttl, serialized);
        } else {
            await this.redis.set(key, serialized);
        }
    }
    
    async getFromFile(key) {
        const filePath = path.join(this.cacheDir, `${key}.json`);
        try {
            const data = await fs.readFile(filePath, 'utf8');
            const entry = JSON.parse(data);
            
            if (entry.expires && entry.expires < Date.now()) {
                await fs.unlink(filePath);
                return null;
            }
            
            return entry.value;
        } catch (error) {
            return null;
        }
    }
    
    async setToFile(key, value, ttl) {
        const filePath = path.join(this.cacheDir, `${key}.json`);
        const expires = ttl ? Date.now() + (ttl * 1000) : null;
        
        await fs.writeFile(filePath, JSON.stringify({ value, expires }));
    }
    
    shouldCache(request) {
        // 检查请求方法
        const methods = this.config.methods || ['GET'];
        if (!methods.includes(request.method || 'GET')) {
            return false;
        }
        
        // 检查条件表达式
        if (this.config.condition) {
            // 可以在这里实现表达式求值
            return this.evaluateCondition(this.config.condition, request);
        }
        
        return true;
    }
    
    getTTL(request) {
        // 可以基于请求动态计算TTL
        const defaultTTL = this.config.memory?.ttl || this.config.redis?.ttl || 3600;
        
        if (this.config.ttl_by_url && request.url) {
            for (const [pattern, ttl] of Object.entries(this.config.ttl_by_url)) {
                if (new RegExp(pattern).test(request.url)) {
                    return ttl;
                }
            }
        }
        
        return defaultTTL;
    }
    
    // LRU 淘汰策略
    evict() {
        if (this.strategy === 'lru') {
            let oldest = null;
            let oldestTime = Infinity;
            
            for (const [key, entry] of this.cache.entries()) {
                if (entry.lastAccess < oldestTime) {
                    oldestTime = entry.lastAccess;
                    oldest = key;
                }
            }
            
            if (oldest) {
                this.cache.delete(oldest);
            }
        } else if (this.strategy === 'lfu') {
            let leastUsed = null;
            let minCount = Infinity;
            
            for (const [key, entry] of this.cache.entries()) {
                if (entry.accessCount < minCount) {
                    minCount = entry.accessCount;
                    leastUsed = key;
                }
            }
            
            if (leastUsed) {
                this.cache.delete(leastUsed);
            }
        }
    }
    
    updateLRU(key) {
        const entry = this.cache.get(key);
        if (entry) {
            entry.lastAccess = Date.now();
            entry.accessCount++;
        }
    }
    
    evaluateCondition(condition, request) {
        // 简单的条件求值
        try {
            // 支持类似 ${request.url.includes('api')} 的表达式
            const fn = new Function('request', `return ${condition}`);
            return fn(request);
        } catch (error) {
            console.error('Failed to evaluate condition:', error);
            return true;
        }
    }
    
    getStats() {
        return {
            ...this.stats,
            hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
            cacheSize: this.cache.size
        };
    }
}