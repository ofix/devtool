import crypto from 'crypto';

/**
 * 全局内存缓存
 * 负责：文件解析缓存、结构体/类符号缓存、类型索引、ID 生成
 */
export class MemoryCache {
  constructor() {
    // ------------------------------
    // 1. 文件缓存：是否已经解析过
    // key: 文件绝对路径
    // value: { parsed: boolean, lang: string, mtime: number }
    // ------------------------------
    this.fileCache = new Map();

    // ------------------------------
    // 2. 结构体 / Class 符号缓存
    // key: symbolId (唯一ID)
    // value: 完整结构体数据 { uid, lang, className, fields, ... }
    // ------------------------------
    this.symbolCache = new Map();

    // ------------------------------
    // 3. 类型索引：快速查找某个类型定义在哪个文件
    // key: `${lang}:${className}` 例如 "cpp:task_struct"
    // value: 定义文件绝对路径
    // ------------------------------
    this.typeIndex = new Map();

    // 最大缓存数量（防止内存爆炸）
    this.MAX_CACHE_SIZE = 500;
  }

  /**
   * 生成唯一ID（MD5 短hash）
   * @param {string} text 原始字符串
   * @returns 12位唯一ID
   */
  generateId(text) {
    return crypto
      .createHash('md5')
      .update(String(text))
      .digest('hex')
      .slice(0, 12);
  }

  /**
   * 标记一个文件已经解析完成
   */
  markFileParsed(fileAbsolutePath, lang = 'unknown') {
    this.fileCache.set(fileAbsolutePath, {
      parsed: true,
      lang,
      mtime: Date.now()
    });
  }

  /**
   * 判断文件是否已经解析过
   */
  isFileParsed(fileAbsolutePath) {
    const entry = this.fileCache.get(fileAbsolutePath);
    return entry?.parsed === true;
  }

  /**
   * 保存一个结构体 / class 到缓存
   * @param {object} struct 结构体数据 { uid, className, fields, ... }
   */
  saveStruct(struct) {
    if (!struct?.uid) return;
    this.symbolCache.set(struct.uid, struct);

    // 建立类型索引
    const key = `${struct.lang}:${struct.className}`;
    this.typeIndex.set(key, struct.defineFilePath);

    // 超过上限自动清理最早的（防止内存溢出）
    if (this.symbolCache.size > this.MAX_CACHE_SIZE) {
      this.cleanOldCache();
    }
  }

  /**
   * 批量保存结构体
   */
  saveStructList(structList) {
    if (!Array.isArray(structList)) return;
    structList.forEach(item => this.saveStruct(item));
  }

  /**
   * 根据 uid 获取结构体
   */
  getStructByUid(uid) {
    return this.symbolCache.get(uid) || null;
  }

  /**
   * 根据 语言 + 类名 查找定义
   */
  getStructByType(lang, className) {
    const typeKey = `${lang}:${className}`;
    const filePath = this.typeIndex.get(typeKey);
    if (!filePath) return null;

    // 遍历找到对应类名的结构体
    for (const sym of this.symbolCache.values()) {
      if (sym.lang === lang && sym.className === className) {
        return sym;
      }
    }
    return null;
  }

  /**
   * 获取所有缓存的结构体数组（给画布渲染用）
   */
  getAllStructs() {
    return Array.from(this.symbolCache.values());
  }

  /**
   * 清理最早的 20% 缓存
   */
  cleanOldCache() {
    const entries = Array.from(this.symbolCache.entries());
    const keepCount = Math.floor(this.MAX_CACHE_SIZE * 0.8);
    const removeList = entries.slice(keepCount);

    for (const [uid] of removeList) {
      this.symbolCache.delete(uid);
    }
  }

  /**
   * 清空所有缓存（切换项目/重新解析时调用）
   */
  clearAll() {
    this.fileCache.clear();
    this.symbolCache.clear();
    this.typeIndex.clear();
  }
}

// 导出全局单例（整个应用共用一个缓存）
export const globalCache = new MemoryCache();