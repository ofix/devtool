// src/main/crawler/utils/Logger.js
import winston from 'winston';
import path from 'path';
import fs from 'fs-extra';
import dayjs from 'dayjs';

/**
 * 日志工具类 - 提供统一的日志记录功能
 * 支持多级别日志、文件输出、控制台输出、按日期分割
 * Logger 特性：
多级别日志（debug, info, warn, error）

文件和控制台双输出

日志按日期分割

日志缓冲批量写入

按爬虫分类查询日志

日志统计和清理
 */
export default class Logger {
  constructor(name = 'app', options = {}) {
    this.name = name;
    this.options = {
      level: options.level || 'info',
      logDir: options.logDir || path.join(process.cwd(), 'logs'),
      maxFiles: options.maxFiles || 30,
      maxSize: options.maxSize || 10 * 1024 * 1024, // 10MB
      console: options.console !== false,
      format: options.format || 'json'
    };
    
    // 确保日志目录存在
    this.ensureLogDir();
    
    // 创建日志记录器
    this.logger = this.createLogger();
    
    // 日志缓冲区（用于批量写入）
    this.buffer = [];
    this.bufferSize = options.bufferSize || 100;
    this.flushInterval = options.flushInterval || 5000;
    
    // 启动定期刷新
    if (this.bufferSize > 0) {
      this.startFlushTimer();
    }
  }
  
  /**
   * 确保日志目录存在
   */
  ensureLogDir() {
    try {
      fs.ensureDirSync(this.options.logDir);
      fs.ensureDirSync(path.join(this.options.logDir, 'error'));
      fs.ensureDirSync(path.join(this.options.logDir, 'access'));
    } catch (error) {
      console.error('Failed to create log directory:', error);
    }
  }
  
  /**
   * 创建 Winston 日志记录器
   */
  createLogger() {
    const { combine, timestamp, printf, colorize, json, errors } = winston.format;
    
    // 自定义日志格式
    const customFormat = printf(({ level, message, timestamp, name, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `[${timestamp}] [${level.toUpperCase()}] [${name}] ${message}${metaStr}`;
    });
    
    // 控制台输出格式
    const consoleFormat = combine(
      colorize(),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      customFormat
    );
    
    // 文件输出格式
    const fileFormat = combine(
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      errors({ stack: true }),
      this.options.format === 'json' ? json() : customFormat
    );
    
    const transports = [];
    
    // 添加控制台传输
    if (this.options.console) {
      transports.push(
        new winston.transports.Console({
          level: this.options.level,
          format: consoleFormat
        })
      );
    }
    
    // 添加文件传输 - 按级别分类
    transports.push(
      // 所有日志
      new winston.transports.File({
        filename: path.join(this.options.logDir, `${this.name}.log`),
        level: this.options.level,
        format: fileFormat,
        maxsize: this.options.maxSize,
        maxFiles: this.options.maxFiles,
        tailable: true
      }),
      // 错误日志
      new winston.transports.File({
        filename: path.join(this.options.logDir, 'error', `${this.name}-error.log`),
        level: 'error',
        format: fileFormat,
        maxsize: this.options.maxSize,
        maxFiles: this.options.maxFiles,
        tailable: true
      }),
      // 访问日志（info及以上）
      new winston.transports.File({
        filename: path.join(this.options.logDir, 'access', `${this.name}-access.log`),
        level: 'info',
        format: fileFormat,
        maxsize: this.options.maxSize,
        maxFiles: this.options.maxFiles,
        tailable: true
      })
    );
    
    // 创建日志记录器
    return winston.createLogger({
      level: this.options.level,
      format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' })
      ),
      transports,
      exceptionHandlers: [
        new winston.transports.File({
          filename: path.join(this.options.logDir, 'exceptions.log')
        })
      ],
      rejectionHandlers: [
        new winston.transports.File({
          filename: path.join(this.options.logDir, 'rejections.log')
        })
      ]
    });
  }
  
  /**
   * 启动定时刷新缓冲区
   */
  startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }
  
  /**
   * 刷新日志缓冲区
   */
  flush() {
    if (this.buffer.length === 0) return;
    
    const bufferCopy = [...this.buffer];
    this.buffer = [];
    
    for (const log of bufferCopy) {
      this.logger.log(log);
    }
  }
  
  /**
   * 写入日志（带缓冲）
   */
  write(level, message, meta = {}) {
    const logEntry = {
      level,
      message,
      name: this.name,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      ...meta
    };
    
    if (this.bufferSize > 0) {
      this.buffer.push(logEntry);
      if (this.buffer.length >= this.bufferSize) {
        this.flush();
      }
    } else {
      this.logger.log(logEntry);
    }
  }
  
  /**
   * 记录调试日志
   */
  debug(message, meta = {}) {
    this.write('debug', message, meta);
  }
  
  /**
   * 记录信息日志
   */
  info(message, meta = {}) {
    this.write('info', message, meta);
  }
  
  /**
   * 记录警告日志
   */
  warn(message, meta = {}) {
    this.write('warn', message, meta);
  }
  
  /**
   * 记录错误日志
   */
  error(message, meta = {}) {
    // 错误日志立即写入，不缓冲
    const logEntry = {
      level: 'error',
      message,
      name: this.name,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      stack: meta.stack,
      ...meta
    };
    this.logger.log(logEntry);
    
    // 同时输出到控制台（如果还没配置控制台）
    if (!this.options.console) {
      console.error(`[ERROR] [${this.name}] ${message}`, meta);
    }
  }
  
  /**
   * 记录访问日志
   */
  access(message, meta = {}) {
    this.write('info', message, { ...meta, type: 'access' });
  }
  
  /**
   * 记录爬虫特定日志
   */
  crawler(crawlerName, level, message, meta = {}) {
    this.write(level, message, { ...meta, crawler: crawlerName });
  }
  
  /**
   * 获取指定爬虫的日志
   * @param {string} crawlerName - 爬虫名称
   * @param {number} limit - 限制数量
   * @param {string} level - 日志级别
   */
  async getLogs(crawlerName, limit = 100, level = null) {
    try {
      const logFile = path.join(this.options.logDir, `${this.name}.log`);
      const content = await fs.readFile(logFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      // 解析日志行
      const logs = [];
      for (const line of lines.slice(-limit * 2)) { // 多读一些以便筛选
        try {
          const log = JSON.parse(line);
          if (log.crawler === crawlerName) {
            if (!level || log.level === level) {
              logs.push(log);
            }
          }
        } catch {
          // 如果不是JSON格式，尝试解析文本格式
          if (line.includes(crawlerName)) {
            logs.push({
              timestamp: new Date(),
              level: 'info',
              message: line,
              crawler: crawlerName
            });
          }
        }
        
        if (logs.length >= limit) break;
      }
      
      return logs;
    } catch (error) {
      this.error('Failed to get logs', { error: error.message });
      return [];
    }
  }
  
  /**
   * 获取所有日志
   */
  async getAllLogs(limit = 100, level = null) {
    try {
      const logFile = path.join(this.options.logDir, `${this.name}.log`);
      const content = await fs.readFile(logFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      const logs = [];
      for (const line of lines.slice(-limit)) {
        try {
          const log = JSON.parse(line);
          if (!level || log.level === level) {
            logs.push(log);
          }
        } catch {
          logs.push({
            timestamp: new Date(),
            level: 'info',
            message: line
          });
        }
      }
      
      return logs;
    } catch (error) {
      this.error('Failed to get all logs', { error: error.message });
      return [];
    }
  }
  
  /**
   * 获取错误日志
   */
  async getErrorLogs(limit = 100) {
    return this.getAllLogs(limit, 'error');
  }
  
  /**
   * 清理旧日志文件
   */
  async cleanOldLogs(daysToKeep = 30) {
    try {
      const files = await fs.readdir(this.options.logDir);
      const now = Date.now();
      const maxAge = daysToKeep * 24 * 60 * 60 * 1000;
      
      for (const file of files) {
        const filePath = path.join(this.options.logDir, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.remove(filePath);
          this.info(`Removed old log file: ${file}`);
        }
      }
    } catch (error) {
      this.error('Failed to clean old logs', { error: error.message });
    }
  }
  
  /**
   * 创建子日志记录器
   */
  child(name) {
    return new Logger(`${this.name}:${name}`, this.options);
  }
  
  /**
   * 获取统计信息
   */
  async getStats() {
    try {
      const logFile = path.join(this.options.logDir, `${this.name}.log`);
      const content = await fs.readFile(logFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      const stats = {
        total: lines.length,
        byLevel: { error: 0, warn: 0, info: 0, debug: 0 },
        lastHour: 0,
        lastDay: 0,
        lastWeek: 0
      };
      
      const now = Date.now();
      const hourAgo = now - 60 * 60 * 1000;
      const dayAgo = now - 24 * 60 * 60 * 1000;
      const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
      
      for (const line of lines) {
        try {
          const log = JSON.parse(line);
          const timestamp = new Date(log.timestamp).getTime();
          
          stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
          
          if (timestamp >= hourAgo) stats.lastHour++;
          if (timestamp >= dayAgo) stats.lastDay++;
          if (timestamp >= weekAgo) stats.lastWeek++;
        } catch {
          // 忽略解析错误
        }
      }
      
      return stats;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * 关闭日志记录器
   */
  close() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flush();
    this.logger.close();
  }
}