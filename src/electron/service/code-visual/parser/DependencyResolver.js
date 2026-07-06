// parser/DependencyResolver.js

import path from 'path';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import ASTTypes from '../types/ast.js';

export class DependencyResolver {
  constructor(options = {}) {
    this.includePaths = options.includePaths || [];
    this.cache = options.cache || new Map();
    this.maxDepth = options.maxDepth || 10;
    this.fileParser = null;
    
    // 全局类型索引
    this.typeIndex = new Map(); // typeName -> { definition, locations: [] }
    this.fileIndex = new Map(); // filePath -> { structs: [], classes: [], ... }
  }

  setFileParser(fileParser) {
    this.fileParser = fileParser;
  }

  /**
   * 解析文件及其所有依赖（增强版）
   */
  async parseFileWithDependencies(filePath, options = {}) {
    const context = ASTTypes.createParseContext(filePath, {
      includePaths: options.includePaths || this.includePaths,
      maxDepth: options.maxDepth || this.maxDepth
    });

    // 开始递归解析
    const result = await this.parseFileRecursive(filePath, context);
    
    // 构建全局类型索引
    this.buildTypeIndex(context);
    
    // 解析所有类型依赖
    await this.resolveAllTypeDependencies(context);

    return {
      mainFile: result,
      allFiles: Array.from(context.parsedResults.values()),
      typeIndex: this.typeIndex,
      unresolvedIncludes: context.unresolvedIncludes,
      errors: context.errors,
      // 包含完整的类型位置信息
      typeLocations: this.getTypeLocations(context)
    };
  }

  /**
   * 递归解析文件
   */
  async parseFileRecursive(filePath, context) {
    // 规范化路径
    filePath = path.resolve(filePath);
    
    // 检查是否已处理
    if (context.processedFiles.has(filePath)) {
      return context.parsedResults.get(filePath);
    }

    // 检查循环依赖
    if (context.processingStack.includes(filePath)) {
      context.errors.push(`Circular dependency detected: ${context.processingStack.join(' -> ')} -> ${filePath}`);
      return null;
    }

    // 检查深度
    if (context.currentDepth > context.maxDepth) {
      context.errors.push(`Max depth exceeded for ${filePath}`);
      return null;
    }

    context.processedFiles.add(filePath);
    context.processingStack.push(filePath);
    context.currentDepth++;

    try {
      // 1. 读取文件内容
      let content;
      let fileHash;
      try {
        content = await fs.readFile(filePath, 'utf-8');
        fileHash = createHash('md5').update(content).digest('hex');
      } catch (error) {
        context.errors.push(`Cannot read file ${filePath}: ${error.message}`);
        context.processingStack.pop();
        context.currentDepth--;
        return null;
      }

      // 2. 解析当前文件
      const result = await this.fileParser.parseSingleFile(filePath, content, {
        includePaths: context.includePaths
      });
      
      // 记录文件哈希
      result.fileHash = fileHash;

      // 3. 缓存结果
      context.parsedResults.set(filePath, result);

      // 4. 记录类型声明位置
      this.recordDeclarations(result, context);

      // 5. 递归解析依赖
      const resolvedIncludes = [];
      const includes = result.imports || new Map();

      for (const [includePath, includeInfo] of includes) {
        const resolvedPath = this.resolveIncludePath(
          includeInfo.path || includePath,
          filePath,
          context.includePaths
        );

        if (resolvedPath) {
          const resolvedFullPath = path.resolve(resolvedPath);
          resolvedIncludes.push(resolvedFullPath);
          
          // 递归解析
          const depResult = await this.parseFileRecursive(resolvedFullPath, context);
          if (depResult) {
            // 合并类型定义（但不覆盖已有的完整定义）
            this.mergeFileResult(result, depResult, context);
          }
        } else {
          context.unresolvedIncludes.push({
            file: filePath,
            include: includePath
          });
        }
      }

      result.resolvedImports = resolvedIncludes;

      context.processingStack.pop();
      context.currentDepth--;
      return result;
    } catch (error) {
      context.errors.push(`Error parsing ${filePath}: ${error.message}`);
      context.processingStack.pop();
      context.currentDepth--;
      return null;
    }
  }

  /**
   * 记录类型声明位置
   */
  recordDeclarations(result, context) {
    const filePath = result.filePath;
    const fileHash = result.fileHash;

    // 记录 structs
    for (const [name, struct] of result.structs) {
      const location = ASTTypes.createLocation(
        filePath,
        struct.lineStart || 0,
        struct.lineEnd || 0
      );
      location.fileHash = fileHash;

      // 添加到 struct 的声明列表
      struct.location = location;
      struct.declarations.set(filePath, {
        location,
        isForward: struct.isForwardDeclaration || false,
        isDefinition: !struct.isForwardDeclaration && struct.isComplete,
        isComplete: struct.isComplete,
        fileHash
      });

      // 添加到全局索引
      if (!this.typeIndex.has(name)) {
        this.typeIndex.set(name, {
          definition: struct,
          locations: [location],
          files: new Set([filePath]),
          isComplete: struct.isComplete,
          isForwardDeclaration: struct.isForwardDeclaration || false
        });
      } else {
        const existing = this.typeIndex.get(name);
        // 如果当前是完整定义，更新
        if (!struct.isForwardDeclaration && struct.isComplete) {
          if (!existing.definition.isComplete || 
              (existing.definition.isComplete && existing.definition.filePath !== filePath)) {
            // 保留更完整的定义
            if (struct.fields.length > existing.definition.fields.length) {
              existing.definition = struct;
            }
          }
        }
        existing.locations.push(location);
        existing.files.add(filePath);
        if (struct.isComplete) {
          existing.isComplete = true;
        }
        if (!struct.isForwardDeclaration) {
          existing.isForwardDeclaration = false;
        }
      }
    }

    // 记录 classes (C++/Java)
    for (const [name, cls] of result.classes) {
      const location = ASTTypes.createLocation(
        filePath,
        cls.lineStart || 0,
        cls.lineEnd || 0
      );
      location.fileHash = fileHash;

      cls.location = location;
      cls.declarations = cls.declarations || new Map();
      cls.declarations.set(filePath, {
        location,
        isForward: false,
        isDefinition: cls.isComplete,
        fileHash
      });

      if (!this.typeIndex.has(name)) {
        this.typeIndex.set(name, {
          definition: cls,
          locations: [location],
          files: new Set([filePath]),
          isComplete: cls.isComplete,
          kind: 'class'
        });
      } else {
        const existing = this.typeIndex.get(name);
        existing.locations.push(location);
        existing.files.add(filePath);
        if (cls.isComplete) {
          existing.isComplete = true;
          existing.definition = cls;
        }
      }
    }

    // 记录 unions
    for (const [name, union] of result.unions || new Map()) {
      const location = ASTTypes.createLocation(
        filePath,
        union.lineStart || 0,
        union.lineEnd || 0
      );
      location.fileHash = fileHash;

      union.location = location;
      union.declarations = union.declarations || new Map();
      union.declarations.set(filePath, {
        location,
        isForward: union.isForwardDeclaration || false,
        isDefinition: !union.isForwardDeclaration,
        fileHash
      });

      if (!this.typeIndex.has(name)) {
        this.typeIndex.set(name, {
          definition: union,
          locations: [location],
          files: new Set([filePath]),
          isComplete: union.isComplete,
          kind: 'union'
        });
      }
    }

    // 更新文件索引
    this.fileIndex.set(filePath, {
      structs: Array.from(result.structs.keys()),
      classes: Array.from(result.classes.keys()),
      unions: Array.from(result.unions || new Map().keys()),
      enums: Array.from(result.enums.keys()),
      typedefs: Array.from(result.typedefs.keys()),
      functions: Array.from(result.functions.keys())
    });
  }

  /**
   * 合并文件结果
   */
  mergeFileResult(mainResult, depResult, context) {
    // 合并 structs（只合并完整定义，前向声明不覆盖）
    for (const [name, struct] of depResult.structs) {
      if (!mainResult.structs.has(name)) {
        mainResult.structs.set(name, struct);
        struct.sourceFiles = struct.sourceFiles || new Set();
        struct.sourceFiles.add(depResult.filePath);
      } else {
        // 如果已有的不是完整定义，但新的是，则替换
        const existing = mainResult.structs.get(name);
        if (!existing.isComplete && struct.isComplete) {
          mainResult.structs.set(name, struct);
          struct.sourceFiles = struct.sourceFiles || new Set();
          struct.sourceFiles.add(depResult.filePath);
        } else if (existing.isComplete && struct.isComplete) {
          // 如果都是完整定义，保留字段更多的
          if (struct.fields.length > existing.fields.length) {
            mainResult.structs.set(name, struct);
            struct.sourceFiles = struct.sourceFiles || new Set();
            struct.sourceFiles.add(depResult.filePath);
          }
        }
        // 合并声明列表
        for (const [filePath, decl] of struct.declarations || new Map()) {
          if (!existing.declarations) existing.declarations = new Map();
          if (!existing.declarations.has(filePath)) {
            existing.declarations.set(filePath, decl);
          }
        }
      }
    }

    // 合并 classes
    for (const [name, cls] of depResult.classes) {
      if (!mainResult.classes.has(name)) {
        mainResult.classes.set(name, cls);
        cls.sourceFiles = cls.sourceFiles || new Set();
        cls.sourceFiles.add(depResult.filePath);
      }
    }

    // 合并 unions
    for (const [name, union] of depResult.unions || new Map()) {
      if (!mainResult.unions.has(name)) {
        mainResult.unions.set(name, union);
        union.sourceFiles = union.sourceFiles || new Set();
        union.sourceFiles.add(depResult.filePath);
      }
    }

    // 合并 enums
    for (const [name, enumDef] of depResult.enums) {
      if (!mainResult.enums.has(name)) {
        mainResult.enums.set(name, enumDef);
      }
    }

    // 合并 typedefs
    for (const [name, typedef] of depResult.typedefs) {
      if (!mainResult.typedefs.has(name)) {
        mainResult.typedefs.set(name, typedef);
      }
    }
  }

  /**
   * 构建全局类型索引
   */
  buildTypeIndex(context) {
    this.typeIndex.clear();
    
    for (const [filePath, result] of context.parsedResults) {
      // 索引 structs
      for (const [name, struct] of result.structs) {
        if (!this.typeIndex.has(name)) {
          this.typeIndex.set(name, {
            definition: struct,
            locations: [struct.location],
            files: new Set([filePath]),
            isComplete: struct.isComplete,
            kind: 'struct'
          });
        } else {
          const existing = this.typeIndex.get(name);
          if (struct.isComplete && !existing.isComplete) {
            existing.definition = struct;
            existing.isComplete = true;
          }
          if (struct.location) {
            existing.locations.push(struct.location);
          }
          existing.files.add(filePath);
        }
      }

      // 索引 classes
      for (const [name, cls] of result.classes) {
        if (!this.typeIndex.has(name)) {
          this.typeIndex.set(name, {
            definition: cls,
            locations: [cls.location],
            files: new Set([filePath]),
            isComplete: cls.isComplete,
            kind: 'class'
          });
        }
      }

      // 索引 unions
      for (const [name, union] of result.unions || new Map()) {
        if (!this.typeIndex.has(name)) {
          this.typeIndex.set(name, {
            definition: union,
            locations: [union.location],
            files: new Set([filePath]),
            isComplete: union.isComplete,
            kind: 'union'
          });
        }
      }
    }
  }

  /**
   * 获取类型的位置信息
   */
  getTypeLocations(context) {
    const locations = new Map();
    
    for (const [name, info] of this.typeIndex) {
      locations.set(name, {
        definitionFile: info.definition.location?.filePath || null,
        definitionLine: info.definition.location?.lineStart || null,
        allLocations: info.locations.map(loc => ({
          file: loc.filePath,
          line: loc.lineStart,
          isDefinition: loc.filePath === info.definition.location?.filePath
        })),
        files: Array.from(info.files)
      });
    }
    
    return locations;
  }

  /**
   * 解析结构体字段的类型（增强版）
   */
  async resolveStructFields(struct, context) {
    if (!struct.fields) return;

    for (const field of struct.fields) {
      const typeName = field.type.referencedType || field.type.name;
      
      // 检查是否是内置类型
      if (this.isBuiltinType(typeName)) {
        field.type.resolved = true;
        field.type.isBuiltin = true;
        field.type.definition = null;
        continue;
      }

      // 在全局索引中查找
      const typeInfo = this.typeIndex.get(typeName);
      if (typeInfo) {
        field.type.resolved = true;
        field.type.definition = typeInfo.definition;
        field.type.definitionLocation = typeInfo.definition.location;
        field.type.allLocations = typeInfo.locations;
        struct.dependencies.add(typeName);
        
        // 标记字段类型所在的文件
        field.type.definitionFile = typeInfo.definition.location?.filePath;
      } else {
        field.type.resolved = false;
        field.type.error = `Type '${typeName}' not found`;
      }
    }

    struct.isResolved = true;
  }

  /**
   * 获取类型的完整定义（包括位置信息）
   */
  getFullTypeDefinition(typeName) {
    const typeInfo = this.typeIndex.get(typeName);
    if (!typeInfo) return null;

    const definition = JSON.parse(JSON.stringify(typeInfo.definition));
    
    // 添加位置信息
    definition._location = typeInfo.definition.location;
    definition._allDeclarations = Array.from(typeInfo.definition.declarations || new Map())
      .map(([file, decl]) => ({
        file,
        location: decl.location,
        isForward: decl.isForward,
        isDefinition: decl.isDefinition
      }));

    // 递归解析嵌套类型
    if (definition.fields) {
      for (const field of definition.fields) {
        const fieldType = field.type.referencedType || field.type.name;
        if (!this.isBuiltinType(fieldType)) {
          const nested = this.typeIndex.get(fieldType);
          if (nested) {
            field.type.definition = nested.definition;
            field.type.definitionLocation = nested.definition.location;
          }
        }
      }
    }

    return definition;
  }

  /**
   * 获取类型的所有声明位置
   */
  getTypeDeclarationLocations(typeName) {
    const typeInfo = this.typeIndex.get(typeName);
    if (!typeInfo) return [];

    const locations = [];
    for (const [filePath, decl] of typeInfo.definition.declarations || new Map()) {
      locations.push({
        file: filePath,
        lineStart: decl.location.lineStart,
        lineEnd: decl.location.lineEnd,
        isForward: decl.isForward || false,
        isDefinition: decl.isDefinition || false,
        isComplete: decl.isComplete || false
      });
    }
    return locations;
  }

  /**
   * 解析 include 路径
   */
  resolveIncludePath(includePath, currentFile, includePaths) {
    // 处理相对路径
    if (includePath.startsWith('"') || includePath.startsWith('<')) {
      const fileName = includePath.replace(/["<>]/g, '');
      
      // 尝试相对路径
      if (!includePath.startsWith('<')) {
        const relativePath = path.join(path.dirname(currentFile), fileName);
        return relativePath;
      }
      
      // 尝试系统路径
      for (const includeDir of includePaths) {
        const fullPath = path.join(includeDir, fileName);
        return fullPath;
      }
    }

    return includePath;
  }

  /**
   * 检查是否为内置类型
   */
  isBuiltinType(typeName) {
    const builtinTypes = new Set([
      'void', 'char', 'short', 'int', 'long', 'float', 'double',
      'signed', 'unsigned', 'bool', 'size_t', 'ptrdiff_t',
      'int8_t', 'int16_t', 'int32_t', 'int64_t',
      'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t',
      'byte', 'boolean', 'String', 'Object',
      'std::string', 'std::vector', 'std::map', 'std::set'
    ]);
    return builtinTypes.has(typeName);
  }

  /**
   * 获取解析统计
   */
  getStats() {
    let totalStructs = 0;
    let totalClasses = 0;
    let totalFiles = this.fileIndex.size;

    for (const [, info] of this.typeIndex) {
      if (info.kind === 'struct') totalStructs++;
      if (info.kind === 'class') totalClasses++;
    }

    return {
      totalFiles,
      totalTypes: this.typeIndex.size,
      totalStructs,
      totalClasses,
      typeIndexSize: this.typeIndex.size
    };
  }
}

export default DependencyResolver;