// parser/TypeResolver.js

import ASTTypes from '../types/ast.js';

export class TypeResolver {
  constructor(parsedFiles) {
    this.parsedFiles = parsedFiles || new Map(); // filePath -> ParsedFileResult
    this.resolvedTypes = new Map(); // typeName -> TypeResolution
    this.resolvingStack = new Set(); // 用于检测循环引用
  }

  /**
   * 解析类型
   */
  resolveType(typeName, currentFile, options = {}) {
    const key = `${typeName}:${currentFile}`;
    
    // 检查是否已经在解析中（循环引用）
    if (this.resolvingStack.has(key)) {
      return {
        originalName: typeName,
        resolvedName: typeName,
        definition: null,
        isBuiltin: ASTTypes.isBuiltin(typeName),
        isResolved: false,
        resolutionPath: Array.from(this.resolvingStack),
        circular: true
      };
    }

    // 检查缓存
    if (this.resolvedTypes.has(key)) {
      return this.resolvedTypes.get(key);
    }

    this.resolvingStack.add(key);

    try {
      // 1. 检查是否是内置类型
      if (ASTTypes.isBuiltin(typeName)) {
        const result = {
          originalName: typeName,
          resolvedName: typeName,
          definition: null,
          isBuiltin: true,
          isResolved: true,
          resolutionPath: Array.from(this.resolvingStack)
        };
        this.resolvedTypes.set(key, result);
        return result;
      }

      // 2. 在当前文件中查找
      const currentResult = this.parsedFiles.get(currentFile);
      if (currentResult) {
        let definition = this.findDefinitionInFile(typeName, currentResult);
        if (definition) {
          const result = {
            originalName: typeName,
            resolvedName: definition.name,
            definition,
            isBuiltin: false,
            isResolved: true,
            resolutionPath: Array.from(this.resolvingStack)
          };
          this.resolvedTypes.set(key, result);
          return result;
        }

        // 检查 typedef
        const typedefInfo = currentResult.typedefs.get(typeName);
        if (typedefInfo) {
          // 递归解析 typedef 指向的类型
          return this.resolveType(typedefInfo.referencedType || typedefInfo.name, currentFile, options);
        }
      }

      // 3. 在依赖文件中查找
      const dependencies = currentResult ? currentResult.includes : [];
      for (const depFile of dependencies) {
        const depResult = this.parsedFiles.get(depFile);
        if (depResult) {
          let definition = this.findDefinitionInFile(typeName, depResult);
          if (definition) {
            const result = {
              originalName: typeName,
              resolvedName: definition.name,
              definition,
              isBuiltin: false,
              isResolved: true,
              resolutionPath: Array.from(this.resolvingStack)
            };
            this.resolvedTypes.set(key, result);
            return result;
          }
        }
      }

      // 4. 未找到
      const result = {
        originalName: typeName,
        resolvedName: typeName,
        definition: null,
        isBuiltin: false,
        isResolved: false,
        resolutionPath: Array.from(this.resolvingStack),
        error: `Type '${typeName}' not found`
      };
      this.resolvedTypes.set(key, result);
      return result;

    } finally {
      this.resolvingStack.delete(key);
    }
  }

  /**
   * 在文件中查找定义
   */
  findDefinitionInFile(typeName, fileResult) {
    // 查找 struct
    if (fileResult.structs.has(typeName)) {
      return fileResult.structs.get(typeName);
    }
    // 查找 union
    if (fileResult.unions.has(typeName)) {
      return fileResult.unions.get(typeName);
    }
    return null;
  }

  /**
   * 解析字段类型
   */
  resolveFieldType(field, currentFile) {
    const typeInfo = field.type;
    
    if (typeInfo.kind === 'pointer' || typeInfo.kind === 'array') {
      // 解析指针或数组指向的类型
      if (typeInfo.referencedType) {
        const resolved = this.resolveType(typeInfo.referencedType, currentFile);
        return {
          ...typeInfo,
          referencedType: resolved,
          resolved: resolved.isResolved
        };
      }
      return typeInfo;
    }

    if (typeInfo.kind === 'struct' || typeInfo.kind === 'union') {
      const resolved = this.resolveType(typeInfo.name, currentFile);
      if (resolved.definition) {
        return {
          ...typeInfo,
          resolved: true,
          definition: resolved.definition
        };
      }
    }

    return typeInfo;
  }

  /**
   * 解析结构体的所有字段
   */
  resolveStructFields(structDef, currentFile) {
    const resolvedFields = structDef.fields.map(field => {
      const resolvedType = this.resolveFieldType(field, currentFile);
      return {
        ...field,
        type: resolvedType
      };
    });

    // 更新依赖关系
    resolvedFields.forEach(field => {
      const typeName = field.type.referencedType || field.type.name;
      if (!ASTTypes.isBuiltin(typeName)) {
        structDef.dependencies.add(typeName);
      }
    });

    return resolvedFields;
  }

  /**
   * 解析文件的类型依赖
   */
  resolveFileTypes(filePath) {
    const fileResult = this.parsedFiles.get(filePath);
    if (!fileResult) return null;

    // 解析所有 struct
    for (const [name, struct] of fileResult.structs) {
      const resolvedFields = this.resolveStructFields(struct, filePath);
      struct.fields = resolvedFields;
      struct.isComplete = true;
    }

    // 解析所有 union
    for (const [name, union] of fileResult.unions) {
      const resolvedFields = this.resolveStructFields(union, filePath);
      union.fields = resolvedFields;
      union.isComplete = true;
    }

    return fileResult;
  }

  /**
   * 批量解析
   */
  resolveAll() {
    const filePaths = Array.from(this.parsedFiles.keys());
    for (const filePath of filePaths) {
      this.resolveFileTypes(filePath);
    }
  }

  /**
   * 获取类型的完整定义（包括所有嵌套结构）
   */
  getTypeDefinition(typeName, currentFile, depth = 0) {
    if (depth > 10) {
      return { error: 'Maximum recursion depth exceeded' };
    }

    const resolved = this.resolveType(typeName, currentFile);
    if (!resolved.definition) {
      return resolved;
    }

    // 递归解析嵌套类型
    const definition = { ...resolved.definition };
    definition.fields = definition.fields.map(field => {
      if (field.type.kind === 'struct' || field.type.kind === 'union') {
        const nested = this.getTypeDefinition(
          field.type.name,
          definition.filePath,
          depth + 1
        );
        return {
          ...field,
          type: {
            ...field.type,
            nestedDefinition: nested.definition || null
          }
        };
      }
      return field;
    });

    return {
      ...resolved,
      definition
    };
  }
}

export default TypeResolver;