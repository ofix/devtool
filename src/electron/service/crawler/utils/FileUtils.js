// src/main/crawler/utils/FileUtils.js
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import mime from 'mime-types';
import dayjs from 'dayjs';

/**
 * 文件工具类 - 提供文件操作相关工具方法
 * 包括文件读写、路径处理、文件类型检测、哈希计算等
 * FileUtils 特性：
文件读写操作

目录管理

文件类型检测

哈希计算

文件名处理

临时文件管理

文件大小格式化

备份和恢复功能
 */
export default class FileUtils {
  constructor(basePath = process.cwd()) {
    this.basePath = basePath;
  }
  
  /**
   * 确保目录存在
   * @param {string} dirPath - 目录路径
   */
  async ensureDir(dirPath) {
    const fullPath = this.resolvePath(dirPath);
    await fs.ensureDir(fullPath);
    return fullPath;
  }
  
  /**
   * 确保目录存在（同步）
   */
  ensureDirSync(dirPath) {
    const fullPath = this.resolvePath(dirPath);
    fs.ensureDirSync(fullPath);
    return fullPath;
  }
  
  /**
   * 写入文件
   * @param {string} filePath - 文件路径
   * @param {string|Buffer} data - 数据
   * @param {Object} options - 选项
   */
  async writeFile(filePath, data, options = {}) {
    const fullPath = this.resolvePath(filePath);
    await this.ensureDir(path.dirname(fullPath));
    
    if (options.createBackup && await fs.pathExists(fullPath)) {
      await this.createBackup(fullPath);
    }
    
    await fs.writeFile(fullPath, data, options);
    return fullPath;
  }
  
  /**
   * 读取文件
   */
  async readFile(filePath, encoding = 'utf-8') {
    const fullPath = this.resolvePath(filePath);
    if (!await fs.pathExists(fullPath)) {
      throw new Error(`File not found: ${fullPath}`);
    }
    return await fs.readFile(fullPath, encoding);
  }
  
  /**
   * 读取 JSON 文件
   */
  async readJson(filePath) {
    const content = await this.readFile(filePath);
    return JSON.parse(content);
  }
  
  /**
   * 写入 JSON 文件
   */
  async writeJson(filePath, data, options = {}) {
    const json = JSON.stringify(data, null, options.spaces || 2);
    return await this.writeFile(filePath, json, options);
  }
  
  /**
   * 复制文件
   */
  async copyFile(src, dest, options = {}) {
    const srcPath = this.resolvePath(src);
    const destPath = this.resolvePath(dest);
    
    await this.ensureDir(path.dirname(destPath));
    await fs.copy(srcPath, destPath, options);
    
    return destPath;
  }
  
  /**
   * 移动文件
   */
  async moveFile(src, dest, options = {}) {
    const srcPath = this.resolvePath(src);
    const destPath = this.resolvePath(dest);
    
    await this.ensureDir(path.dirname(destPath));
    await fs.move(srcPath, destPath, options);
    
    return destPath;
  }
  
  /**
   * 删除文件
   */
  async deleteFile(filePath) {
    const fullPath = this.resolvePath(filePath);
    if (await fs.pathExists(fullPath)) {
      await fs.remove(fullPath);
      return true;
    }
    return false;
  }
  
  /**
   * 删除目录
   */
  async deleteDir(dirPath) {
    const fullPath = this.resolvePath(dirPath);
    if (await fs.pathExists(fullPath)) {
      await fs.remove(fullPath);
      return true;
    }
    return false;
  }
  
  /**
   * 检查文件是否存在
   */
  async exists(filePath) {
    const fullPath = this.resolvePath(filePath);
    return await fs.pathExists(fullPath);
  }
  
  /**
   * 获取文件信息
   */
  async getFileInfo(filePath) {
    const fullPath = this.resolvePath(filePath);
    if (!await fs.pathExists(fullPath)) {
      return null;
    }
    
    const stats = await fs.stat(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    const mimeType = mime.lookup(fullPath) || 'application/octet-stream';
    
    return {
      path: fullPath,
      filename: path.basename(fullPath),
      dirname: path.dirname(fullPath),
      ext,
      size: stats.size,
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      mimeType,
      type: this.getFileType(ext, mimeType)
    };
  }
  
  /**
   * 获取文件类型
   */
  getFileType(ext, mimeType) {
    const videoExts = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'];
    const audioExts = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'];
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
    const documentExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt'];
    
    if (videoExts.includes(ext)) return 'video';
    if (audioExts.includes(ext)) return 'audio';
    if (imageExts.includes(ext)) return 'image';
    if (documentExts.includes(ext)) return 'document';
    
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('image/')) return 'image';
    
    return 'other';
  }
  
  /**
   * 计算文件哈希
   */
  async calculateHash(filePath, algorithm = 'md5') {
    const fullPath = this.resolvePath(filePath);
    
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash(algorithm);
      const stream = fs.createReadStream(fullPath);
      
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
  
  /**
   * 计算字符串哈希
   */
  calculateStringHash(str, algorithm = 'md5') {
    return crypto.createHash(algorithm).update(str).digest('hex');
  }
  
  /**
   * 获取文件名（不含扩展名）
   */
  getBaseName(filePath) {
    const basename = path.basename(filePath);
    return basename.substring(0, basename.lastIndexOf('.'));
  }
  
  /**
   * 生成唯一文件名
   */
  generateUniqueFilename(dir, filename, ext = '') {
    const baseName = this.getBaseName(filename);
    const extension = ext || path.extname(filename);
    let counter = 1;
    let newFilename = filename;
    
    while (fs.existsSync(path.join(dir, newFilename))) {
      newFilename = `${baseName}_${counter}${extension}`;
      counter++;
    }
    
    return newFilename;
  }
  
  /**
   * 创建文件备份
   */
  async createBackup(filePath) {
    const fullPath = this.resolvePath(filePath);
    if (!await fs.pathExists(fullPath)) {
      return null;
    }
    
    const backupDir = path.join(path.dirname(fullPath), 'backups');
    await this.ensureDir(backupDir);
    
    const timestamp = dayjs().format('YYYYMMDD_HHmmss');
    const basename = path.basename(fullPath);
    const backupPath = path.join(backupDir, `${basename}.${timestamp}.bak`);
    
    await fs.copy(fullPath, backupPath);
    return backupPath;
  }
  
  /**
   * 列出目录文件
   */
  async listFiles(dirPath, pattern = null, recursive = false) {
    const fullPath = this.resolvePath(dirPath);
    if (!await fs.pathExists(fullPath)) {
      return [];
    }
    
    const files = [];
    
    const readDir = async (currentPath) => {
      const items = await fs.readdir(currentPath);
      
      for (const item of items) {
        const itemPath = path.join(currentPath, item);
        const stat = await fs.stat(itemPath);
        
        if (stat.isDirectory() && recursive) {
          await readDir(itemPath);
        } else if (stat.isFile()) {
          if (!pattern || pattern.test(item)) {
            files.push(itemPath);
          }
        }
      }
    };
    
    await readDir(fullPath);
    return files;
  }
  
  /**
   * 获取文件大小（格式化）
   */
  formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * 解析文件大小字符串
   */
  parseSize(sizeStr) {
    const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)$/i);
    if (!match) return null;
    
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    const units = { B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 };
    
    return value * (units[unit] || 1);
  }
  
  /**
   * 获取临时目录路径
   */
  getTempPath(subDir = '') {
    const tempDir = path.join(this.basePath, 'temp');
    return subDir ? path.join(tempDir, subDir) : tempDir;
  }
  
  /**
   * 创建临时文件
   */
  async createTempFile(content, options = {}) {
    const tempDir = await this.ensureDir(this.getTempPath());
    const filename = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}${options.ext || ''}`;
    const filepath = path.join(tempDir, filename);
    
    await this.writeFile(filepath, content);
    
    if (options.autoDelete) {
      setTimeout(() => {
        this.deleteFile(filepath).catch(console.error);
      }, options.autoDelete);
    }
    
    return filepath;
  }
  
  /**
   * 清理临时文件
   */
  async cleanTempFiles(maxAge = 24 * 60 * 60 * 1000) { // 默认24小时
    const tempDir = this.getTempPath();
    if (!await this.exists(tempDir)) return;
    
    const files = await this.listFiles(tempDir, null, true);
    const now = Date.now();
    
    for (const file of files) {
      const info = await this.getFileInfo(file);
      if (info && (now - info.modifiedAt.getTime()) > maxAge) {
        await this.deleteFile(file);
      }
    }
  }
  
  /**
   * 解析路径（支持相对路径）
   */
  resolvePath(filePath) {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(this.basePath, filePath);
  }
  
  /**
   * 设置基础路径
   */
  setBasePath(basePath) {
    this.basePath = basePath;
  }
  
  /**
   * 获取相对路径
   */
  getRelativePath(fullPath) {
    return path.relative(this.basePath, fullPath);
  }
}