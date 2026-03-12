// HexDataManager.js - 兼容所有浏览器的高性能数据管理器（async/await版本）
export class HexDataManager {
    constructor() {
      this.totalBytes = 0;
      this.fileName = '';
      this.chunkSize = 1024 * 1024; // 1MB分片
      
      // 使用Uint8Array数组存储数据
      this.dataChunks = new Map(); // chunkIndex -> Uint8Array
      this.loadedChunks = new Set(); // 已加载的分片索引
      
      // 加载队列
      this.pendingChunks = new Map(); // chunkIndex -> Promise
      this.loadQueue = [];
      this.isProcessingQueue = false;
      
      // 监听器
      this.listeners = new Set();
      
      // 预计算表
      this.hexTable = this.initHexTable();
      this.asciiTable = this.initAsciiTable();
      
      // 缓存
      this.rowCache = new Map();
      this.maxCacheRows = 100;
    }
    
    // 初始化十六进制查找表
    initHexTable() {
      const table = new Array(256);
      for (let i = 0; i < 256; i++) {
        table[i] = (i >> 4).toString(16).toUpperCase() + 
                   (i & 0x0F).toString(16).toUpperCase();
      }
      return table;
    }
    
    // 初始化ASCII查找表
    initAsciiTable() {
      const table = new Array(256);
      for (let i = 0; i < 256; i++) {
        table[i] = (i >= 32 && i <= 126) ? String.fromCharCode(i) : '.';
      }
      return table;
    }
    
    /**
     * 加载文件（async/await版本）
     * @param {File} file - 要加载的文件
     * @returns {Promise<{totalBytes: number, fileName: string}>} 加载完成后的文件信息
     */
    async loadFile(file) {
      this.reset();
      this.file = file;
      this.totalBytes = file.size;
      this.fileName = file.name;
      
      // 通知文件加载开始
      this.notifyListeners({
        type: 'file-loaded',
        totalBytes: file.size,
        fileName: file.name
      });
      
      // 计算总分片数
      const totalChunks = Math.ceil(file.size / this.chunkSize);
      
      try {
        // 立即加载第一个分片并等待完成
        await this.loadChunk(0);
        
        // 通知初始分片加载完成
        this.notifyListeners({ 
          type: 'initial-loaded',
          totalBytes: this.totalBytes
        });
        
        // 预加载后续分片（不等待，后台进行）
        this.preloadRemainingChunks(1, totalChunks);
        
        // 返回文件信息
        return {
          totalBytes: this.totalBytes,
          fileName: this.fileName
        };
      } catch (error) {
        console.error('加载文件失败:', error);
        throw error;
      }
    }
    
    /**
     * 预加载剩余分片（后台执行）
     */
    async preloadRemainingChunks(startChunk, totalChunks) {
      for (let chunkIndex = startChunk; chunkIndex < totalChunks; chunkIndex++) {
        // 使用requestIdleCallback或setTimeout优化
        await new Promise(resolve => {
          const loadNext = () => {
            this.loadChunk(chunkIndex).then(resolve).catch(console.error);
          };
          
          if (window.requestIdleCallback) {
            requestIdleCallback(loadNext, { timeout: 1000 });
          } else {
            setTimeout(loadNext, 50);
          }
        });
      }
    }
    
    /**
     * 加载指定分片（async/await版本）
     * @param {number} chunkIndex - 分片索引
     * @returns {Promise<Uint8Array>} 分片数据
     */
    async loadChunk(chunkIndex) {
      // 如果已经在加载中，返回已有的Promise
      if (this.pendingChunks.has(chunkIndex)) {
        return this.pendingChunks.get(chunkIndex);
      }
      
      // 如果已经加载完成，直接返回数据
      if (this.loadedChunks.has(chunkIndex)) {
        return this.dataChunks.get(chunkIndex);
      }
      
      const startAddr = chunkIndex * this.chunkSize;
      const endAddr = Math.min(startAddr + this.chunkSize, this.totalBytes);
      const blob = this.file.slice(startAddr, endAddr);
      
      // 创建加载Promise
      const loadPromise = new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
          const arrayBuffer = e.target.result;
          const uint8Array = new Uint8Array(arrayBuffer);
          
          // 存储分片数据
          this.dataChunks.set(chunkIndex, uint8Array);
          this.loadedChunks.add(chunkIndex);
          
          // 清除相关的行缓存
          this.clearRowCacheForChunk(chunkIndex);
          
          // 通知数据更新
          this.notifyListeners({
            type: 'data-updated',
            startAddr,
            endAddr: startAddr + uint8Array.length - 1
          });
          
          // 更新进度
          const progress = (this.loadedChunks.size / Math.ceil(this.totalBytes / this.chunkSize)) * 100;
          this.notifyListeners({
            type: 'progress',
            progress
          });
          
          this.pendingChunks.delete(chunkIndex);
          resolve(uint8Array);
        };
        
        reader.onerror = (error) => {
          this.pendingChunks.delete(chunkIndex);
          reject(new Error(`读取分片 ${chunkIndex} 失败: ${error}`));
        };
        
        reader.readAsArrayBuffer(blob);
      });
      
      this.pendingChunks.set(chunkIndex, loadPromise);
      return loadPromise;
    }
    
    /**
     * 确保地址范围已加载
     * @param {number} startAddr - 起始地址
     * @param {number} endAddr - 结束地址
     * @returns {Promise<void>}
     */
    async ensureRangeLoaded(startAddr, endAddr) {
      const startChunk = Math.floor(startAddr / this.chunkSize);
      const endChunk = Math.floor(endAddr / this.chunkSize);
      
      const loadPromises = [];
      
      for (let chunkIdx = startChunk; chunkIdx <= endChunk; chunkIdx++) {
        if (!this.loadedChunks.has(chunkIdx) && !this.pendingChunks.has(chunkIdx)) {
          loadPromises.push(this.loadChunk(chunkIdx));
        } else if (this.pendingChunks.has(chunkIdx)) {
          // 如果已经在加载中，等待它完成
          loadPromises.push(this.pendingChunks.get(chunkIdx));
        }
      }
      
      if (loadPromises.length > 0) {
        await Promise.all(loadPromises);
      }
    }
    
    /**
     * 获取指定地址的字节
     * @param {number} addr - 地址
     * @returns {Promise<number|null>} 字节值，如果未加载返回null
     */
    async getByte(addr) {
      if (addr >= this.totalBytes) return null;
      
      const chunkIndex = Math.floor(addr / this.chunkSize);
      
      // 确保分片已加载
      if (!this.loadedChunks.has(chunkIndex)) {
        if (this.pendingChunks.has(chunkIndex)) {
          await this.pendingChunks.get(chunkIndex);
        } else {
          await this.loadChunk(chunkIndex);
        }
      }
      
      const chunk = this.dataChunks.get(chunkIndex);
      if (!chunk) return null;
      
      const offset = addr % this.chunkSize;
      return offset < chunk.length ? chunk[offset] : null;
    }
    
    /**
     * 直接获取十六进制（同步版本，如果未加载返回'--'）
     */
    getHex(addr) {
      const chunkIndex = Math.floor(addr / this.chunkSize);
      const chunk = this.dataChunks.get(chunkIndex);
      
      if (!chunk) {
        // 异步加载（不等待）
        this.loadChunk(chunkIndex).catch(console.error);
        return '--';
      }
      
      const offset = addr % this.chunkSize;
      if (offset >= chunk.length) return '--';
      
      return this.hexTable[chunk[offset]];
    }
    
    /**
     * 异步获取十六进制（等待加载完成）
     * @param {number} addr - 地址
     * @returns {Promise<string>} 十六进制字符串
     */
    async getHexAsync(addr) {
      const byte = await this.getByte(addr);
      return byte !== null ? this.hexTable[byte] : '--';
    }
    
    /**
     * 批量获取十六进制（同步版本）
     */
    getHexBatch(startAddr, count) {
      const result = new Array(count);
      const endAddr = startAddr + count - 1;
      const startChunk = Math.floor(startAddr / this.chunkSize);
      const endChunk = Math.floor(endAddr / this.chunkSize);
      
      // 如果跨分片，逐个处理
      if (startChunk !== endChunk) {
        for (let i = 0; i < count; i++) {
          result[i] = this.getHex(startAddr + i);
        }
        return result;
      }
      
      // 单个分片内，直接批量读取
      const chunk = this.dataChunks.get(startChunk);
      if (!chunk) {
        this.loadChunk(startChunk).catch(console.error);
        for (let i = 0; i < count; i++) {
          result[i] = '--';
        }
        return result;
      }
      
      const offset = startAddr % this.chunkSize;
      const available = Math.min(count, chunk.length - offset);
      
      // 批量转换
      for (let i = 0; i < available; i++) {
        result[i] = this.hexTable[chunk[offset + i]];
      }
      for (let i = available; i < count; i++) {
        result[i] = '--';
      }
      
      return result;
    }
    
    /**
     * 批量异步获取十六进制
     * @param {number} startAddr - 起始地址
     * @param {number} count - 数量
     * @returns {Promise<string[]>} 十六进制字符串数组
     */
    async getHexBatchAsync(startAddr, count) {
      // 先确保范围已加载
      await this.ensureRangeLoaded(startAddr, startAddr + count - 1);
      
      // 然后批量获取
      const result = new Array(count);
      const endAddr = startAddr + count - 1;
      const startChunk = Math.floor(startAddr / this.chunkSize);
      const endChunk = Math.floor(endAddr / this.chunkSize);
      
      if (startChunk !== endChunk) {
        for (let i = 0; i < count; i++) {
          const byte = await this.getByte(startAddr + i);
          result[i] = byte !== null ? this.hexTable[byte] : '--';
        }
      } else {
        const chunk = this.dataChunks.get(startChunk);
        const offset = startAddr % this.chunkSize;
        
        for (let i = 0; i < count; i++) {
          const addr = startAddr + i;
          if (addr >= this.totalBytes) {
            result[i] = '--';
          } else {
            const byte = chunk[offset + i];
            result[i] = this.hexTable[byte];
          }
        }
      }
      
      return result;
    }
    
    /**
     * 获取ASCII（同步版本）
     */
    getAscii(addr) {
      const chunkIndex = Math.floor(addr / this.chunkSize);
      const chunk = this.dataChunks.get(chunkIndex);
      
      if (!chunk) {
        this.loadChunk(chunkIndex).catch(console.error);
        return '.';
      }
      
      const offset = addr % this.chunkSize;
      if (offset >= chunk.length) return '.';
      
      return this.asciiTable[chunk[offset]];
    }
    
    /**
     * 异步获取ASCII
     * @param {number} addr - 地址
     * @returns {Promise<string>} ASCII字符
     */
    async getAsciiAsync(addr) {
      const byte = await this.getByte(addr);
      return byte !== null ? this.asciiTable[byte] : '.';
    }
    
    /**
     * 批量获取ASCII（同步版本）
     */
    getAsciiBatch(startAddr, count) {
      const result = new Array(count);
      const endAddr = startAddr + count - 1;
      const startChunk = Math.floor(startAddr / this.chunkSize);
      const endChunk = Math.floor(endAddr / this.chunkSize);
      
      if (startChunk !== endChunk) {
        for (let i = 0; i < count; i++) {
          result[i] = this.getAscii(startAddr + i);
        }
        return result;
      }
      
      const chunk = this.dataChunks.get(startChunk);
      if (!chunk) {
        this.loadChunk(startChunk).catch(console.error);
        for (let i = 0; i < count; i++) {
          result[i] = '.';
        }
        return result;
      }
      
      const offset = startAddr % this.chunkSize;
      const available = Math.min(count, chunk.length - offset);
      
      for (let i = 0; i < available; i++) {
        result[i] = this.asciiTable[chunk[offset + i]];
      }
      for (let i = available; i < count; i++) {
        result[i] = '.';
      }
      
      return result;
    }
    
    /**
     * 批量异步获取ASCII
     * @param {number} startAddr - 起始地址
     * @param {number} count - 数量
     * @returns {Promise<string[]>} ASCII字符数组
     */
    async getAsciiBatchAsync(startAddr, count) {
      await this.ensureRangeLoaded(startAddr, startAddr + count - 1);
      
      const result = new Array(count);
      for (let i = 0; i < count; i++) {
        const byte = await this.getByte(startAddr + i);
        result[i] = byte !== null ? this.asciiTable[byte] : '.';
      }
      return result;
    }
    
    /**
     * 获取行数据（同步版本，带缓存）
     */
    getRowData(row) {
      // 检查缓存
      if (this.rowCache.has(row)) {
        return this.rowCache.get(row);
      }
      
      const startAddr = row * 16;
      const hexData = this.getHexBatch(startAddr, 16);
      const asciiData = this.getAsciiBatch(startAddr, 16);
      
      const rowData = { hex: hexData, ascii: asciiData, startAddr };
      
      // 存入缓存
      this.rowCache.set(row, rowData);
      
      // 限制缓存大小
      if (this.rowCache.size > this.maxCacheRows) {
        const firstKey = this.rowCache.keys().next().value;
        this.rowCache.delete(firstKey);
      }
      
      return rowData;
    }
    
    /**
     * 异步获取行数据
     * @param {number} row - 行号
     * @returns {Promise<{hex: string[], ascii: string[], startAddr: number}>}
     */
    async getRowDataAsync(row) {
      const startAddr = row * 16;
      await this.ensureRangeLoaded(startAddr, startAddr + 15);
      return this.getRowData(row);
    }
    
    // 清除分片相关的行缓存
    clearRowCacheForChunk(chunkIndex) {
      const startAddr = chunkIndex * this.chunkSize;
      const endAddr = Math.min(startAddr + this.chunkSize, this.totalBytes);
      const startRow = Math.floor(startAddr / 16);
      const endRow = Math.floor(endAddr / 16);
      
      for (let row = startRow; row <= endRow; row++) {
        this.rowCache.delete(row);
      }
    }
    
    // 添加监听器
    addListener(callback) {
      this.listeners.add(callback);
    }
    
    // 移除监听器
    removeListener(callback) {
      this.listeners.delete(callback);
    }
    
    // 通知监听器
    notifyListeners(event) {
      Promise.resolve().then(() => {
        this.listeners.forEach(callback => {
          try {
            callback(event);
          } catch (e) {
            console.error('Listener error:', e);
          }
        });
      });
    }
    
    /**
     * 等待指定地址的数据加载完成
     * @param {number} addr - 地址
     * @returns {Promise<boolean>} 是否加载成功
     */
    async waitForAddr(addr) {
      try {
        const chunkIndex = Math.floor(addr / this.chunkSize);
        if (this.loadedChunks.has(chunkIndex)) {
          return true;
        }
        if (this.pendingChunks.has(chunkIndex)) {
          await this.pendingChunks.get(chunkIndex);
          return true;
        }
        await this.loadChunk(chunkIndex);
        return true;
      } catch (error) {
        console.error(`等待地址 ${addr} 加载失败:`, error);
        return false;
      }
    }
    
    // 重置
    reset() {
      this.dataChunks.clear();
      this.loadedChunks.clear();
      this.pendingChunks.clear();
      this.rowCache.clear();
      this.loadQueue = [];
      this.isProcessingQueue = false;
      this.totalBytes = 0;
      this.file = null;
    }
    
    // 销毁
    destroy() {
      this.reset();
      this.listeners.clear();
    }
  }
  
  // 创建单例
  export const hexDataManager = new HexDataManager();