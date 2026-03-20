// src/main/crawler/utils/Database.js
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs-extra';
import dayjs from 'dayjs';

/**
 * 数据库工具类 - 封装 SQLite 数据库操作
 * 提供连接池、事务管理、查询构建器等高级功能
 * DatabaseManager 特性：
SQLite 连接池管理

预编译语句缓存

事务支持

查询结果缓存

慢查询监控

分页查询封装

数据库备份和优化

UPSERT 操作支持
 */
export default class DatabaseManager {
  constructor(dbPath, options = {}) {
    this.dbPath = dbPath || path.join(process.cwd(), 'data', 'crawler.db');
    this.options = {
      readonly: options.readonly || false,
      fileMustExist: options.fileMustExist || false,
      timeout: options.timeout || 5000,
      verbose: options.verbose || false,
      ...options
    };
    
    // 确保数据库目录存在
    this.ensureDbDir();
    
    // 数据库连接
    this.db = null;
    this.transactions = new Map();
    this.preparedStatements = new Map();
    this.queryCache = new Map();
    
    // 统计信息
    this.stats = {
      totalQueries: 0,
      totalTransactions: 0,
      cacheHits: 0,
      cacheMisses: 0,
      slowQueries: []
    };
    
    // 连接数据库
    this.connect();
    
    // 初始化数据库表
    this.initTables();
  }
  
  /**
   * 确保数据库目录存在
   */
  ensureDbDir() {
    const dbDir = path.dirname(this.dbPath);
    try {
      fs.ensureDirSync(dbDir);
    } catch (error) {
      console.error('Failed to create database directory:', error);
    }
  }
  
  /**
   * 连接数据库
   */
  connect() {
    try {
      this.db = new Database(this.dbPath, this.options);
      
      // 设置 WAL 模式以提高并发性能
      this.db.pragma('journal_mode = WAL');
      
      // 设置外键约束
      this.db.pragma('foreign_keys = ON');
      
      // 设置缓存大小
      this.db.pragma(`cache_size = ${this.options.cacheSize || 10000}`);
      
      if (this.options.verbose) {
        this.db.pragma('verbose');
      }
      
      console.log(`Database connected: ${this.dbPath}`);
    } catch (error) {
      console.error('Failed to connect to database:', error);
      throw error;
    }
  }
  
  /**
   * 初始化数据库表
   */
  initTables() {
    // 创建爬取记录表
    this.exec(`
      CREATE TABLE IF NOT EXISTS processed_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        crawler_name TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        item_url TEXT,
        item_title TEXT,
        item_data TEXT,
        processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(crawler_name, content_hash)
      )
    `);
    
    // 创建索引
    this.exec(`
      CREATE INDEX IF NOT EXISTS idx_processed_crawler ON processed_items(crawler_name);
      CREATE INDEX IF NOT EXISTS idx_processed_hash ON processed_items(content_hash);
      CREATE INDEX IF NOT EXISTS idx_processed_date ON processed_items(processed_at);
    `);
    
    // 创建下载记录表
    this.exec(`
      CREATE TABLE IF NOT EXISTS downloaded_files (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        size INTEGER,
        type TEXT,
        website TEXT,
        url TEXT,
        download_time DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // 创建索引
    this.exec(`
      CREATE INDEX IF NOT EXISTS idx_files_website ON downloaded_files(website);
      CREATE INDEX IF NOT EXISTS idx_files_type ON downloaded_files(type);
      CREATE INDEX IF NOT EXISTS idx_files_time ON downloaded_files(download_time);
    `);
    
    // 创建爬虫状态表
    this.exec(`
      CREATE TABLE IF NOT EXISTS crawler_state (
        crawler_name TEXT PRIMARY KEY,
        last_run DATETIME,
        last_item_url TEXT,
        total_processed INTEGER DEFAULT 0,
        total_success INTEGER DEFAULT 0,
        total_failed INTEGER DEFAULT 0,
        state_data TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // 创建爬虫配置表
    this.exec(`
      CREATE TABLE IF NOT EXISTS crawler_configs (
        name TEXT PRIMARY KEY,
        config TEXT NOT NULL,
        enabled BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // 创建登录凭证表
    this.exec(`
      CREATE TABLE IF NOT EXISTS auth_credentials (
        crawler_name TEXT PRIMARY KEY,
        cookies TEXT,
        token TEXT,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // 创建统计表
    this.exec(`
      CREATE TABLE IF NOT EXISTS statistics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        crawler_name TEXT NOT NULL,
        date DATE NOT NULL,
        total_processed INTEGER DEFAULT 0,
        total_success INTEGER DEFAULT 0,
        total_failed INTEGER DEFAULT 0,
        total_downloaded INTEGER DEFAULT 0,
        total_size INTEGER DEFAULT 0,
        UNIQUE(crawler_name, date)
      )
    `);
  }
  
  /**
   * 执行 SQL 语句
   */
  exec(sql) {
    try {
      const startTime = Date.now();
      const result = this.db.exec(sql);
      const duration = Date.now() - startTime;
      
      this.stats.totalQueries++;
      this.trackSlowQuery(sql, duration);
      
      return result;
    } catch (error) {
      console.error('Failed to execute SQL:', sql, error);
      throw error;
    }
  }
  
  /**
   * 准备 SQL 语句
   */
  prepare(sql) {
    try {
      // 检查缓存
      if (this.preparedStatements.has(sql)) {
        return this.preparedStatements.get(sql);
      }
      
      const stmt = this.db.prepare(sql);
      this.preparedStatements.set(sql, stmt);
      
      return stmt;
    } catch (error) {
      console.error('Failed to prepare statement:', sql, error);
      throw error;
    }
  }
  
  /**
   * 执行查询
   */
  query(sql, params = {}) {
    try {
      const startTime = Date.now();
      const stmt = this.prepare(sql);
      const result = stmt.all(params);
      const duration = Date.now() - startTime;
      
      this.stats.totalQueries++;
      this.trackSlowQuery(sql, duration);
      
      return result;
    } catch (error) {
      console.error('Failed to execute query:', sql, error);
      throw error;
    }
  }
  
  /**
   * 执行单行查询
   */
  queryOne(sql, params = {}) {
    try {
      const startTime = Date.now();
      const stmt = this.prepare(sql);
      const result = stmt.get(params);
      const duration = Date.now() - startTime;
      
      this.stats.totalQueries++;
      this.trackSlowQuery(sql, duration);
      
      return result;
    } catch (error) {
      console.error('Failed to execute query:', sql, error);
      throw error;
    }
  }
  
  /**
   * 执行插入/更新
   */
  execute(sql, params = {}) {
    try {
      const startTime = Date.now();
      const stmt = this.prepare(sql);
      const result = stmt.run(params);
      const duration = Date.now() - startTime;
      
      this.stats.totalQueries++;
      this.trackSlowQuery(sql, duration);
      
      return {
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowid
      };
    } catch (error) {
      console.error('Failed to execute SQL:', sql, error);
      throw error;
    }
  }
  
  /**
   * 批量执行
   */
  batch(sql, paramsList) {
    const transaction = this.beginTransaction();
    
    try {
      const results = [];
      for (const params of paramsList) {
        results.push(this.execute(sql, params));
      }
      transaction.commit();
      return results;
    } catch (error) {
      transaction.rollback();
      throw error;
    }
  }
  
  /**
   * 开始事务
   */
  beginTransaction() {
    this.exec('BEGIN TRANSACTION');
    
    let committed = false;
    let rolledBack = false;
    
    return {
      commit: () => {
        if (!committed && !rolledBack) {
          this.exec('COMMIT');
          committed = true;
          this.stats.totalTransactions++;
        }
      },
      rollback: () => {
        if (!committed && !rolledBack) {
          this.exec('ROLLBACK');
          rolledBack = true;
        }
      }
    };
  }
  
  /**
   * 带缓存功能的查询
   */
  queryWithCache(sql, params = {}, ttl = 60000) {
    const cacheKey = `${sql}_${JSON.stringify(params)}`;
    
    // 检查缓存
    if (this.queryCache.has(cacheKey)) {
      const cached = this.queryCache.get(cacheKey);
      if (Date.now() - cached.timestamp < ttl) {
        this.stats.cacheHits++;
        return cached.data;
      } else {
        this.queryCache.delete(cacheKey);
      }
    }
    
    this.stats.cacheMisses++;
    const data = this.query(sql, params);
    
    // 存入缓存
    this.queryCache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });
    
    return data;
  }
  
  /**
   * 清除查询缓存
   */
  clearCache() {
    this.queryCache.clear();
  }
  
  /**
   * 记录慢查询
   */
  trackSlowQuery(sql, duration) {
    if (duration > (this.options.slowQueryThreshold || 1000)) {
      this.stats.slowQueries.push({
        sql,
        duration,
        timestamp: new Date()
      });
      
      // 只保留最近100条慢查询
      if (this.stats.slowQueries.length > 100) {
        this.stats.slowQueries.shift();
      }
    }
  }
  
  /**
   * 获取分页数据
   */
  paginate(table, where = {}, page = 1, pageSize = 20, orderBy = 'id DESC') {
    const offset = (page - 1) * pageSize;
    
    // 构建 WHERE 子句
    const whereClauses = [];
    const params = {};
    
    for (const [key, value] of Object.entries(where)) {
      whereClauses.push(`${key} = @${key}`);
      params[key] = value;
    }
    
    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    
    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM ${table} ${whereSql}`;
    const countResult = this.queryOne(countSql, params);
    const total = countResult.total;
    
    // 查询数据
    const dataSql = `
      SELECT * FROM ${table} 
      ${whereSql} 
      ORDER BY ${orderBy} 
      LIMIT @limit OFFSET @offset
    `;
    
    const data = this.query(dataSql, {
      ...params,
      limit: pageSize,
      offset
    });
    
    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  }
  
  /**
   * 插入或更新记录
   */
  upsert(table, data, keyField) {
    const fields = Object.keys(data);
    const placeholders = fields.map(f => `@${f}`).join(', ');
    const updates = fields.map(f => `${f} = @${f}`).join(', ');
    
    const sql = `
      INSERT INTO ${table} (${fields.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT(${keyField}) DO UPDATE SET
      ${updates}
    `;
    
    return this.execute(sql, data);
  }
  
  /**
   * 备份数据库
   */
  async backup(backupPath = null) {
    if (!backupPath) {
      backupPath = path.join(
        path.dirname(this.dbPath),
        `backup_${dayjs().format('YYYYMMDD_HHmmss')}.db`
      );
    }
    
    try {
      this.exec(`VACUUM INTO '${backupPath}'`);
      return backupPath;
    } catch (error) {
      console.error('Failed to backup database:', error);
      throw error;
    }
  }
  
  /**
   * 数据库优化
   */
  optimize() {
    this.exec('VACUUM');
    this.exec('ANALYZE');
    this.exec('REINDEX');
  }
  
  /**
   * 获取数据库信息
   */
  getInfo() {
    const tables = this.query(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `);
    
    const tableInfo = [];
    for (const table of tables) {
      const count = this.queryOne(`SELECT COUNT(*) as count FROM ${table.name}`);
      tableInfo.push({
        name: table.name,
        rowCount: count.count
      });
    }
    
    return {
      path: this.dbPath,
      tables: tableInfo,
      stats: this.stats,
      cacheSize: this.queryCache.size
    };
  }
  
  /**
   * 关闭数据库连接
   */
  close() {
    this.flush();
    this.clearCache();
    
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('Database connection closed');
    }
  }
  
  /**
   * 刷新所有挂起的操作
   */
  flush() {
    // 刷新 WAL
    this.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  }
}