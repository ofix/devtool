// src/main/crawler/adapters/DownloadAdapter.js
import path from 'path';
import fs from 'fs-extra';
import axios from 'axios';
import spawn from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
import m3u8Parser from 'm3u8-parser';

/**
 * 下载适配器 - 支持多种文件格式下载
 * 采用策略模式，根据不同文件类型使用不同下载策略
 */
class DownloadAdapter {
  constructor(url, options = {}) {
    this.url = url;
    this.options = options;
    this.downloadManager = options.downloadManager;
    this.antiSpiderHandler = options.antiSpiderHandler;
    this.config = options.config || {};
    
    // 文件类型策略映射
    this.strategies = {
      'm3u8': new M3U8Strategy(url, options),
      'video': new VideoStrategy(url, options),
      'audio': new AudioStrategy(url, options),
      'image': new ImageStrategy(url, options),
      'document': new DocumentStrategy(url, options),
      'default': new DefaultStrategy(url, options)
    };
  }
  
  /**
   * 执行下载
   */
  async download(metadata = {}) {
    // 检测文件类型
    const fileType = this.detectFileType();
    
    // 获取对应的下载策略
    const strategy = this.strategies[fileType] || this.strategies['default'];
    
    // 执行下载
    const result = await strategy.download(metadata);
    
    // 记录下载信息
    if (this.downloadManager) {
      await this.downloadManager.recordDownload(result);
    }
    
    return result;
  }
  
  /**
   * 检测文件类型
   */
  detectFileType() {
    const url = this.url.toLowerCase();
    const ext = path.extname(url);
    
    const typeMap = {
      '.m3u8': 'm3u8',
      '.mp4': 'video',
      '.avi': 'video',
      '.mkv': 'video',
      '.mov': 'video',
      '.mp3': 'audio',
      '.wav': 'audio',
      '.flac': 'audio',
      '.jpg': 'image',
      '.jpeg': 'image',
      '.png': 'image',
      '.gif': 'image',
      '.webp': 'image',
      '.pdf': 'document',
      '.doc': 'document',
      '.docx': 'document',
      '.xls': 'document',
      '.xlsx': 'document'
    };
    
    // 检查扩展名
    if (typeMap[ext]) {
      return typeMap[ext];
    }
    
    // 检查URL特征
    if (url.includes('.m3u8')) return 'm3u8';
    if (url.includes('video') || url.includes('mp4')) return 'video';
    
    return 'default';
  }
}

/**
 * M3U8流媒体下载策略
 */
class M3U8Strategy {
  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.antiSpiderHandler = options.antiSpiderHandler;
  }
  
  async download(metadata) {
    console.log(`Downloading M3U8: ${this.url}`);
    
    // 1. 解析M3U8文件
    const playlist = await this.parseM3U8();
    
    // 2. 获取所有TS片段
    const segments = this.extractSegments(playlist);
    
    // 3. 下载所有片段
    const downloadPath = await this.downloadSegments(segments, metadata);
    
    // 4. 合并片段为MP4
    const outputPath = await this.mergeSegments(downloadPath, metadata);
    
    // 5. 获取文件信息
    const stats = await fs.stat(outputPath);
    
    return {
      id: this.generateId(),
      filename: path.basename(outputPath),
      path: outputPath,
      size: stats.size,
      type: 'video',
      website: metadata.crawler,
      downloadTime: new Date(),
      url: this.url
    };
  }
  
  async parseM3U8() {
    const response = await axios.get(this.url, {
      headers: this.getHeaders(),
      responseType: 'text'
    });
    
    const parser = new m3u8Parser.Parser();
    parser.push(response.data);
    parser.end();
    
    return parser.manifest;
  }
  
  extractSegments(playlist) {
    const segments = [];
    const baseUrl = this.url.substring(0, this.url.lastIndexOf('/') + 1);
    
    for (const segment of playlist.segments) {
      let segmentUrl = segment.uri;
      if (!segmentUrl.startsWith('http')) {
        segmentUrl = new URL(segmentUrl, baseUrl).href;
      }
      segments.push(segmentUrl);
    }
    
    return segments;
  }
  
  async downloadSegments(segments, metadata) {
    const downloadDir = path.join(
      this.options.downloadManager?.downloadPath || process.cwd(),
      metadata.crawler || 'unknown',
      'temp'
    );
    
    await fs.ensureDir(downloadDir);
    
    // 并发下载片段
    const concurrency = 5;
    const chunks = this.chunkArray(segments, concurrency);
    const downloadedFiles = [];
    
    for (const chunk of chunks) {
      const promises = chunk.map((segment, index) => 
        this.downloadSegment(segment, downloadDir, index)
      );
      const results = await Promise.all(promises);
      downloadedFiles.push(...results);
      
      // 延迟避免被封
      await this.antiSpiderHandler?.randomDelay(100, 200);
    }
    
    return downloadDir;
  }
  
  async downloadSegment(url, downloadDir, index) {
    const filename = `segment_${String(index).padStart(5, '0')}.ts`;
    const filepath = path.join(downloadDir, filename);
    
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      headers: this.getHeaders()
    });
    
    const writer = fs.createWriteStream(filepath);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(filepath));
      writer.on('error', reject);
    });
  }
  
  async mergeSegments(downloadDir, metadata) {
    const outputFilename = `${this.sanitizeFilename(metadata.title || 'video')}.mp4`;
    const outputPath = path.join(
      this.options.downloadManager?.downloadPath || process.cwd(),
      metadata.crawler || 'unknown',
      'videos',
      outputFilename
    );
    
    await fs.ensureDir(path.dirname(outputPath));
    
    // 创建文件列表
    const files = await fs.readdir(downloadDir);
    const tsFiles = files.filter(f => f.endsWith('.ts')).sort();
    const listFile = path.join(downloadDir, 'filelist.txt');
    
    await fs.writeFile(listFile, tsFiles.map(f => `file '${f}'`).join('\n'));
    
    // 使用ffmpeg合并
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(listFile)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .output(outputPath)
        .outputOptions(['-c', 'copy'])
        .on('end', () => {
          // 清理临时文件
          fs.remove(downloadDir).catch(console.error);
          resolve(outputPath);
        })
        .on('error', reject)
        .run();
    });
  }
  
  getHeaders() {
    return {
      'User-Agent': this.antiSpiderHandler?.getRandomUserAgent() || 
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': this.options.referer || this.url
    };
  }
  
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
  
  sanitizeFilename(filename) {
    return filename.replace(/[<>:"/\\|?*]/g, '_').substring(0, 200);
  }
  
  generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * 视频下载策略
 */
class VideoStrategy {
  constructor(url, options) {
    this.url = url;
    this.options = options;
  }
  
  async download(metadata) {
    const filename = `${this.sanitizeFilename(metadata.title || 'video')}.mp4`;
    const downloadPath = path.join(
      this.options.downloadManager?.downloadPath || process.cwd(),
      metadata.crawler || 'unknown',
      'videos',
      filename
    );
    
    await fs.ensureDir(path.dirname(downloadPath));
    
    const response = await axios({
      method: 'GET',
      url: this.url,
      responseType: 'stream',
      headers: {
        'User-Agent': this.options.antiSpiderHandler?.getRandomUserAgent(),
        'Referer': metadata.referer
      }
    });
    
    const writer = fs.createWriteStream(downloadPath);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', async () => {
        const stats = await fs.stat(downloadPath);
        resolve({
          id: this.generateId(),
          filename: filename,
          path: downloadPath,
          size: stats.size,
          type: 'video',
          website: metadata.crawler,
          downloadTime: new Date(),
          url: this.url
        });
      });
      writer.on('error', reject);
    });
  }
  
  sanitizeFilename(filename) {
    return filename.replace(/[<>:"/\\|?*]/g, '_').substring(0, 200);
  }
  
  generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * 图片下载策略
 */
class ImageStrategy {
  constructor(url, options) {
    this.url = url;
    this.options = options;
  }
  
  async download(metadata) {
    const ext = path.extname(this.url) || '.jpg';
    const filename = `${this.sanitizeFilename(metadata.title || 'image')}${ext}`;
    const downloadPath = path.join(
      this.options.downloadManager?.downloadPath || process.cwd(),
      metadata.crawler || 'unknown',
      'images',
      filename
    );
    
    await fs.ensureDir(path.dirname(downloadPath));
    
    const response = await axios({
      method: 'GET',
      url: this.url,
      responseType: 'stream',
      headers: {
        'User-Agent': this.options.antiSpiderHandler?.getRandomUserAgent()
      }
    });
    
    const writer = fs.createWriteStream(downloadPath);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', async () => {
        const stats = await fs.stat(downloadPath);
        resolve({
          id: this.generateId(),
          filename: filename,
          path: downloadPath,
          size: stats.size,
          type: 'image',
          website: metadata.crawler,
          downloadTime: new Date(),
          url: this.url
        });
      });
      writer.on('error', reject);
    });
  }
  
  sanitizeFilename(filename) {
    return filename.replace(/[<>:"/\\|?*]/g, '_').substring(0, 200);
  }
  
  generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * 默认下载策略（普通文件）
 */
class DefaultStrategy {
  constructor(url, options) {
    this.url = url;
    this.options = options;
  }
  
  async download(metadata) {
    const ext = path.extname(this.url) || '.file';
    const filename = `${this.sanitizeFilename(metadata.title || 'download')}${ext}`;
    const downloadPath = path.join(
      this.options.downloadManager?.downloadPath || process.cwd(),
      metadata.crawler || 'unknown',
      'files',
      filename
    );
    
    await fs.ensureDir(path.dirname(downloadPath));
    
    const response = await axios({
      method: 'GET',
      url: this.url,
      responseType: 'stream',
      headers: {
        'User-Agent': this.options.antiSpiderHandler?.getRandomUserAgent()
      }
    });
    
    const writer = fs.createWriteStream(downloadPath);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', async () => {
        const stats = await fs.stat(downloadPath);
        resolve({
          id: this.generateId(),
          filename: filename,
          path: downloadPath,
          size: stats.size,
          type: 'file',
          website: metadata.crawler,
          downloadTime: new Date(),
          url: this.url
        });
      });
      writer.on('error', reject);
    });
  }
  
  sanitizeFilename(filename) {
    return filename.replace(/[<>:"/\\|?*]/g, '_').substring(0, 200);
  }
  
  generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// 其他策略类类似实现...
class AudioStrategy {}
class DocumentStrategy {}

export { DownloadAdapter, M3U8Strategy, VideoStrategy, ImageStrategy, DefaultStrategy };