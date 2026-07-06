// parser/CodeProjectParser.js

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import LanguageRegistry from './core/LanguageRegistry.js';
import CacheManager from './CacheManager.js';
import DependencyGraph from './DependencyGraph.js';
import TypeResolver from './TypeResolver.js';
import CParser from './parsers/CParser.js';
import CppParser from './parsers/CppParser.js';
import JavaParser from './parsers/JavaParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class CodeProjectParser {
  constructor(options = {}) {
    // 语言注册中心
    this.registry = new LanguageRegistry();
    
    // 注册所有解析器
    this.registry.registerAll([
      new CParser({ includePaths: options.includePaths || [] }),
      new CppParser({ includePaths: options.includePaths || [] }),
      new JavaParser({ classPaths: options.classPaths || [] })
    ]);

    // 其他组件
    this.cache = new CacheManager(options.cache);
    this.dependencyGraph = new DependencyGraph();
    this.parsedFiles = new Map();
    this.typeResolver = new TypeResolver(this.parsedFiles);
    
    // Worker 管理
    this.maxWorkers = options.maxWorkers || Math.max(1, os.cpus().length - 1);
    this.workers = [];
    this.taskQueue = [];
    this.activeTasks = new Map();
    this.taskIdCounter = 0;
    this.isInitialized = false;

    // 事件监听
    this.eventListeners = new Map();
  }

  /**
   * 解析文件（自动检测语言）
   */
  async parseFile(filePath, options = {}) {
    // 获取对应的解析器
    const parser = this.registry.getParser(filePath);
    if (!parser) {
      throw new Error(`No parser found for file: ${filePath}`);
    }

    // 检查缓存
    const content = await fs.readFile(filePath, 'utf-8');
    const cached = this.cache.get(filePath, content);
    if (cached) {
      return cached;
    }

    // 使用 Worker 解析
    const result = await this.parseWithWorker(filePath, content, parser, options);
    
    // 缓存结果
    this.cache.set(filePath, content, result);
    this.parsedFiles.set(filePath, result);
    
    // 更新依赖图
    const deps = parser.extractDependencies(filePath, content);
    this.dependencyGraph.addNode(filePath, deps.dependencies || []);

    return result;
  }

  /**
   * 使用 Worker 解析
   */
  async parseWithWorker(filePath, content, parser, options) {
    // 在 Worker 中执行
    const result = await parser.parseFile(filePath, content, options);
    
    // 解析类型依赖
    this.typeResolver = new TypeResolver(this.parsedFiles);
    this.typeResolver.resolveFileTypes(filePath);

    return result;
  }

  /**
   * 获取结构体
   */
  getStruct(structName, filePath) {
    const fileResult = this.parsedFiles.get(filePath);
    if (!fileResult) return null;

    if (fileResult.structs.has(structName)) {
      return fileResult.structs.get(structName);
    }

    // 在依赖中查找
    for (const depFile of fileResult.imports.keys()) {
      const depResult = this.parsedFiles.get(depFile);
      if (depResult && depResult.structs.has(structName)) {
        return depResult.structs.get(structName);
      }
    }

    return null;
  }

  /**
   * 获取类
   */
  getClass(className, filePath) {
    const fileResult = this.parsedFiles.get(filePath);
    if (!fileResult) return null;

    if (fileResult.classes.has(className)) {
      return fileResult.classes.get(className);
    }

    // 在依赖中查找
    for (const depFile of fileResult.imports.keys()) {
      const depResult = this.parsedFiles.get(depFile);
      if (depResult && depResult.classes.has(className)) {
        return depResult.classes.get(className);
      }
    }

    return null;
  }

  /**
   * 获取完整的类型定义
   */
  getTypeDefinition(typeName, filePath) {
    const fileResult = this.parsedFiles.get(filePath);
    if (!fileResult) return null;

    // 尝试获取解析器
    const parser = this.registry.getParser(filePath);
    if (!parser) return null;

    return parser.resolveType(typeName, filePath, {
      structs: fileResult.structs,
      classes: fileResult.classes,
      interfaces: fileResult.interfaces
    });
  }

  /**
   * 获取所有支持的语言
   */
  getSupportedLanguages() {
    return this.registry.getRegisteredLanguages();
  }

  /**
   * 获取语言配置
   */
  getLanguageConfig(langName) {
    return this.registry.getLanguageConfig(langName);
  }

  /**
   * 批量解析
   */
  async parseFiles(filePaths, options = {}) {
    const promises = filePaths.map(filePath => 
      this.parseFile(filePath, options)
    );
    return Promise.all(promises);
  }

  /**
   * 解析目录
   */
  async parseDirectory(dirPath, options = {}) {
    const pattern = options.pattern || /\.(c|h|cpp|hpp|java)$/;
    const files = await this.findFiles(dirPath, pattern);
    return this.parseFiles(files, options);
  }

  /**
   * 查找文件
   */
  async findFiles(dirPath, pattern) {
    const files = [];
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          const subFiles = await this.findFiles(fullPath, pattern);
          files.push(...subFiles);
        }
      } else if (pattern.test(entry.name)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * 获取解析统计
   */
  getStats() {
    return {
      parsedFiles: this.parsedFiles.size,
      cachedFiles: this.cache.getStats().total,
      supportedLanguages: this.registry.getRegisteredLanguages(),
      dependencyGraph: this.dependencyGraph.getStats()
    };
  }

  /**
   * 关闭
   */
  shutdown() {
    // 关闭所有 Worker
    for (const workerInfo of this.workers) {
      workerInfo.worker.terminate();
    }
    this.workers = [];
    this.isInitialized = false;
  }

  // ... 其他方法（事件系统等）
}

export default CodeProjectParser;