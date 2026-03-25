// src/electron/service/crawler/infrastructure/IncrementalManager.js
import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs-extra';

export default class IncrementalManager {
    constructor(options = {}) {
        this.dbPath = options.dbPath || './data/crawler.db';
        this.db = null;
        this.cache = new Map();
        
        this._initDb();
    }
    
    _initDb() {
        const dir = path.dirname(this.dbPath);
        fs.ensureDirSync(dir);
        
        this.db = new Database(this.dbPath);
        
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS processed_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                site_name TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                url TEXT NOT NULL,
                processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(site_name, content_hash)
            );
            
            CREATE INDEX IF NOT EXISTS idx_site_hash ON processed_items(site_name, content_hash);
            CREATE INDEX IF NOT EXISTS idx_processed_at ON processed_items(processed_at);
        `);
    }
    
    async isProcessed(siteName, url) {
        const cacheKey = `${siteName}:${url}`;
        
        if (this.cache.has(cacheKey)) {
            return true;
        }
        
        const hash = this._generateHash(url);
        
        const result = this.db.prepare(`
            SELECT 1 FROM processed_items 
            WHERE site_name = ? AND content_hash = ?
        `).get(siteName, hash);
        
        if (result) {
            this.cache.set(cacheKey, true);
            return true;
        }
        
        return false;
    }
    
    async markProcessed(siteName, url, data) {
        const hash = this._generateHash(url);
        const cacheKey = `${siteName}:${url}`;
        
        this.db.prepare(`
            INSERT OR IGNORE INTO processed_items (site_name, content_hash, url)
            VALUES (?, ?, ?)
        `).run(siteName, hash, url);
        
        this.cache.set(cacheKey, true);
    }
    
    _generateHash(url) {
        return crypto.createHash('md5').update(url).digest('hex');
    }
    
    async getStatistics(filters = {}) {
        const total = this.db.prepare('SELECT COUNT(*) as count FROM processed_items').get();
        
        const today = new Date().toISOString().slice(0, 10);
        const todayCount = this.db.prepare(`
            SELECT COUNT(*) as count FROM processed_items 
            WHERE date(processed_at) = ?
        `).get(today);
        
        return {
            total: total.count,
            today: todayCount.count,
            cacheSize: this.cache.size
        };
    }
    
    async cleanup(daysToKeep = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        
        const result = this.db.prepare(`
            DELETE FROM processed_items WHERE processed_at < ?
        `).run(cutoffDate.toISOString());
        
        return result.changes;
    }
    
    async close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
        this.cache.clear();
    }
}
