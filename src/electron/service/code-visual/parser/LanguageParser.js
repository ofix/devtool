// parser/core/LanguageParser.js

/**
 * @typedef {Object} ParseOptions
 * @property {string[]} includePaths - 包含路径
 * @property {boolean} [parseMacros] - 是否解析宏
 * @property {boolean} [parseComments] - 是否解析注释
 * @property {number} [maxDepth] - 最大递归深度
 */

/**
 * @typedef {Object} StructField
 * @property {string} name
 * @property {TypeInfo} type
 * @property {Object} [attributes] - 语言特定属性
 */

/**
 * @typedef {Object} TypeInfo
 * @property {string} name
 * @property {string} kind - builtin|struct|union|enum|class|interface|typedef|generic
 * @property {Object} [metadata] - 语言特定元数据
 */

/**
 * @typedef {Object} ParsedResult
 * @property {string} filePath
 * @property {string} language
 * @property {Map<string, StructDefinition>} structs
 * @property {Map<string, StructDefinition>} classes
 * @property {Map<string, StructDefinition>} interfaces
 * @property {Map<string, TypeInfo>} typedefs
 * @property {Map<string, any>} functions
 * @property {Map<string, any>} variables
 * @property {Map<string, any>} enums
 * @property {Map<string, any>} imports
 * @property {Object} metadata - 语言特定元数据
 */

/**
 * 语言解析器基类
 */
export class LanguageParser {
    constructor() {
      this.languageName = 'unknown';
      this.fileExtensions = [];
      this.supportedFeatures = {
        structs: false,
        classes: false,
        interfaces: false,
        generics: false,
        annotations: false,
        macros: false,
        imports: false
      };
    }
  
    /**
     * 检查是否支持该文件
     */
    supportsFile(filePath) {
      const ext = this.getFileExtension(filePath);
      return this.fileExtensions.includes(ext);
    }
  
    /**
     * 获取文件扩展名
     */
    getFileExtension(filePath) {
      return filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
    }
  
    /**
     * 解析文件（子类必须实现）
     */
    async parseFile(filePath, content, options = {}) {
      throw new Error('parseFile must be implemented by subclass');
    }
  
    /**
     * 解析文件中的某个类型
     */
    resolveType(typeName, filePath, context = null) {
      throw new Error('resolveType must be implemented by subclass');
    }
  
    /**
     * 提取文件依赖（import/include）
     */
    extractDependencies(filePath, content) {
      throw new Error('extractDependencies must be implemented by subclass');
    }
  
    /**
     * 获取语言特定配置
     */
    getLanguageConfig() {
      return {
        name: this.languageName,
        extensions: this.fileExtensions,
        features: this.supportedFeatures
      };
    }
  
    /**
     * 解析类型引用（辅助方法）
     */
    parseTypeString(typeString) {
      // 子类可以覆盖
      return {
        name: typeString,
        kind: 'unknown'
      };
    }
  
    /**
     * 是否内置类型
     */
    isBuiltinType(typeName) {
      return false;
    }
  
    /**
     * 获取内置类型列表
     */
    getBuiltinTypes() {
      return [];
    }
  }
  
  export default LanguageParser;