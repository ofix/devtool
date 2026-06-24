import crypto from 'crypto';

export class MemoryCache {
  constructor() {
    /** 文件路径 => 解析状态 */
    this.fileMap = new Map();
    /** symbolId => 完整符号数据 */
    this.symbolMap = new Map();
    /** `${lang}:TypeName` => 定义文件绝对路径 */
    this.typeDefineMap = new Map();
  }

  genHash(text) {
    return crypto.createHash('md5').update(text).digest('hex').slice(0, 12);
  }

  setFileParsed(fileAbsPath, info) {
    this.fileMap.set(fileAbsPath, {
      parsed: true,
      mtime: Date.now(),
      lang: info.lang
    });
  }

  isFileParsed(fileAbsPath) {
    const item = this.fileMap.get(fileAbsPath);
    return item?.parsed ?? false;
  }

  saveSymbol(symbol) {
    this.symbolMap.set(symbol.symbolId, symbol);
    const key = `${symbol.lang}:${symbol.name}`;
    this.typeDefineMap.set(key, symbol.defineFilePath);
  }

  getTypeDefinePath(lang, typeName) {
    return this.typeDefineMap.get(`${lang}:${typeName}`) ?? null;
  }
}

export const globalCache = new MemoryCache();