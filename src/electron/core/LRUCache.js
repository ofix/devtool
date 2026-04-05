// LRUCache.js - 独立文件
class LRUCache {
    constructor(maxSize = 500) {
        this.maxSize = maxSize;
        this.cache = new Map();
        this.hits = 0;
        this.misses = 0;
    }

    has (key) {
        return this.cache.has(key);
    }

    get (key) {
        if (!this.cache.has(key)) {
            this.misses++;
            return null;
        }
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        this.hits++;
        return value;
    }

    set (key, value) {
        if (this.cache.has(key)) this.cache.delete(key);
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }

    delete (key) {
        return this.cache.delete(key);
    }

    clear () {
        this.cache.clear();
        this.hits = this.misses = 0;
    }

    getStats () {
        const total = this.hits + this.misses;
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hitRate: total ? `${(this.hits / total * 100).toFixed(1)}%` : '0%'
        };
    }
}

export default LRUCache;