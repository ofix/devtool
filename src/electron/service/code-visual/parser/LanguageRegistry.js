// parser/core/LanguageRegistry.js

import LanguageParser from './LanguageParser.js';

export class LanguageRegistry {
  constructor() {
    this.parsers = new Map();
    this.extensionMap = new Map();
    this.defaultParser = null;
  }

  /**
   * 注册解析器
   */
  register(parser) {
    if (!(parser instanceof LanguageParser)) {
      throw new Error('Parser must be an instance of LanguageParser');
    }

    const langName = parser.languageName;
    if (this.parsers.has(langName)) {
      console.warn(`Parser for language '${langName}' already registered, overwriting`);
    }

    this.parsers.set(langName, parser);

    // 注册扩展名映射
    for (const ext of parser.fileExtensions) {
      this.extensionMap.set(ext, langName);
    }

    return this;
  }

  /**
   * 注册多个解析器
   */
  registerAll(parsers) {
    for (const parser of parsers) {
      this.register(parser);
    }
    return this;
  }

  /**
   * 获取解析器
   */
  getParser(filePath) {
    const ext = this.getFileExtension(filePath);
    const langName = this.extensionMap.get(ext);
    
    if (!langName) {
      return this.defaultParser;
    }

    return this.parsers.get(langName) || this.defaultParser;
  }

  /**
   * 获取解析器（通过语言名）
   */
  getParserByLanguage(langName) {
    return this.parsers.get(langName) || null;
  }

  /**
   * 获取文件扩展名
   */
  getFileExtension(filePath) {
    return filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  }

  /**
   * 获取所有已注册的语言
   */
  getRegisteredLanguages() {
    return Array.from(this.parsers.keys());
  }

  /**
   * 获取所有支持的文件扩展名
   */
  getSupportedExtensions() {
    return Array.from(this.extensionMap.keys());
  }

  /**
   * 设置默认解析器（当找不到匹配时使用）
   */
  setDefaultParser(parser) {
    this.defaultParser = parser;
    return this;
  }

  /**
   * 检查文件是否被支持
   */
  isSupported(filePath) {
    const ext = this.getFileExtension(filePath);
    return this.extensionMap.has(ext);
  }

  /**
   * 获取语言配置
   */
  getLanguageConfig(langName) {
    const parser = this.parsers.get(langName);
    return parser ? parser.getLanguageConfig() : null;
  }

  /**
   * 获取所有语言配置
   */
  getAllConfigs() {
    const configs = [];
    for (const [name, parser] of this.parsers) {
      configs.push(parser.getLanguageConfig());
    }
    return configs;
  }
}

export default LanguageRegistry;