// parser/parsers/JavaParser.js

import LanguageParser from '../core/LanguageParser.js';
import path from 'path';
import Parser from 'tree-sitter';
import Java from '@tree-sitter/java';

export class JavaParser extends LanguageParser {
  constructor(options = {}) {
    super();
    this.languageName = 'java';
    this.fileExtensions = ['.java'];
    this.supportedFeatures = {
      structs: false,
      classes: true,
      interfaces: true,
      generics: true,
      annotations: true,
      macros: false,
      imports: true
    };

    this.parser = new Parser();
    this.parser.setLanguage(Java);
    this.classPaths = options.classPaths || [];
    this.builtinTypes = new Set([
      'void', 'byte', 'short', 'int', 'long', 'float', 'double',
      'char', 'boolean', 'String', 'Object', 'Class',
      'Integer', 'Double', 'Float', 'Long', 'Short', 'Byte', 'Character',
      'Boolean', 'Void', 'Enum', 'Throwable', 'Exception', 'RuntimeException'
    ]);
  }

  /**
   * 解析文件
   */
  async parseFile(filePath, content, options = {}) {
    const startTime = Date.now();
    
    try {
      const tree = this.parser.parse(content);
      const root = tree.rootNode;

      const result = {
        filePath,
        language: 'java',
        structs: new Map(),
        classes: new Map(),
        interfaces: new Map(),
        typedefs: new Map(),
        functions: new Map(),
        variables: new Map(),
        enums: new Map(),
        imports: new Map(),
        metadata: {
          parseTime: 0,
          nodeCount: 0,
          errors: [],
          package: '',
          annotations: []
        }
      };

      this.extractPackage(root, content, result);
      this.extractImports(root, content, result, options);
      this.extractClasses(root, content, result);
      this.extractInterfaces(root, content, result);
      this.extractEnums(root, content, result);
      this.extractAnnotations(root, content, result);
      this.extractMethods(root, content, result);
      this.extractFields(root, content, result);

      result.metadata.parseTime = Date.now() - startTime;
      result.metadata.nodeCount = this.countNodes(root);

      return result;
    } catch (error) {
      return {
        filePath,
        language: 'java',
        structs: new Map(),
        classes: new Map(),
        interfaces: new Map(),
        typedefs: new Map(),
        functions: new Map(),
        variables: new Map(),
        enums: new Map(),
        imports: new Map(),
        metadata: {
          parseTime: Date.now() - startTime,
          nodeCount: 0,
          errors: [error.message],
          package: '',
          annotations: []
        }
      };
    }
  }

  /**
   * 提取包名
   */
  extractPackage(root, content, result) {
    const walker = this.createWalker();
    const packageNodes = walker.findNodes(root, (node) => 
      node.type === 'package_declaration'
    );

    for (const node of packageNodes) {
      let child = node.firstChild;
      let packageName = '';
      while (child) {
        if (child.type === 'scoped_identifier' || child.type === 'identifier') {
          packageName = child.text;
          break;
        }
        child = child.nextSibling;
      }
      result.metadata.package = packageName;
    }
  }

  /**
   * 提取导入
   */
  extractImports(root, content, result, options) {
    const walker = this.createWalker();
    const importNodes = walker.findNodes(root, (node) => 
      node.type === 'import_declaration'
    );

    for (const node of importNodes) {
      let isStatic = false;
      let isWildcard = false;
      let importPath = '';

      let child = node.firstChild;
      while (child) {
        if (child.type === 'import') {
          // 跳过
        } else if (child.type === 'static') {
          isStatic = true;
        } else if (child.type === 'scoped_identifier') {
          importPath = child.text;
          if (importPath.endsWith('.*')) {
            isWildcard = true;
            importPath = importPath.slice(0, -2);
          }
        } else if (child.type === 'identifier') {
          importPath = child.text;
        }
        child = child.nextSibling;
      }

      if (importPath) {
        result.imports.set(importPath, {
          path: importPath,
          resolved: importPath,
          isStatic,
          isWildcard,
          type: 'import'
        });
      }
    }
  }

  /**
   * 提取类定义
   */
  extractClasses(root, content, result) {
    const walker = this.createWalker();
    const classNodes = walker.findNodes(root, (node) => 
      node.type === 'class_declaration'
    );

    for (const node of classNodes) {
      const classDef = this.parseClassNode(node, content, result.filePath);
      if (classDef) {
        result.classes.set(classDef.name, classDef);
      }
    }
  }

  /**
   * 解析类节点
   */
  parseClassNode(node, content, filePath) {
    let name = '';
    let modifiers = [];
    let typeParameters = [];
    let extendsClass = null;
    let implementsInterfaces = [];
    let fields = [];
    let methods = [];
    let annotations = [];

    let child = node.firstChild;
    while (child) {
      if (child.type === 'identifier') {
        name = child.text;
      } else if (child.type === 'modifier') {
        modifiers.push(child.text);
      } else if (child.type === 'type_parameters') {
        typeParameters = this.parseTypeParameters(child, content);
      } else if (child.type === 'extends') {
        let next = child.nextSibling;
        if (next && next.type === 'type_identifier') {
          extendsClass = next.text;
        }
      } else if (child.type === 'implements') {
        let next = child.nextSibling;
        if (next) {
          implementsInterfaces = this.parseTypeList(next, content);
        }
      } else if (child.type === 'class_body') {
        const body = this.parseClassBody(child, content);
        fields = body.fields;
        methods = body.methods;
      } else if (child.type === 'annotation') {
        annotations.push(child.text);
      }
      child = child.nextSibling;
    }

    return {
      name,
      kind: 'class',
      modifiers,
      typeParameters,
      extendsClass,
      implementsInterfaces,
      fields,
      methods,
      annotations,
      filePath,
      lineStart: node.startPosition.row,
      lineEnd: node.endPosition.row,
      isComplete: true,
      dependencies: new Set()
    };
  }

  /**
   * 解析类主体
   */
  parseClassBody(node, content) {
    const fields = [];
    const methods = [];

    let child = node.firstChild;
    while (child) {
      if (child.type === 'field_declaration') {
        const field = this.parseFieldDeclaration(child, content);
        if (field) fields.push(field);
      } else if (child.type === 'method_declaration') {
        const method = this.parseMethodDeclaration(child, content);
        if (method) methods.push(method);
      } else if (child.type === 'constructor_declaration') {
        const constructor = this.parseConstructorDeclaration(child, content);
        if (constructor) methods.push(constructor);
      }
      child = child.nextSibling;
    }

    return { fields, methods };
  }

  /**
   * 解析字段声明
   */
  parseFieldDeclaration(node, content) {
    let typeName = 'void';
    let fieldName = '';
    let modifiers = [];
    let annotations = [];

    let child = node.firstChild;
    while (child) {
      if (child.type === 'modifier') {
        modifiers.push(child.text);
      } else if (child.type === 'annotation') {
        annotations.push(child.text);
      } else if (child.type === 'type_identifier' || child.type === 'primitive_type') {
        typeName = child.text;
      } else if (child.type === 'variable_declarator') {
        let declChild = child.firstChild;
        while (declChild) {
          if (declChild.type === 'identifier') {
            fieldName = declChild.text;
          }
          declChild = declChild.nextSibling;
        }
      }
      child = child.nextSibling;
    }

    return {
      name: fieldName,
      type: typeName,
      modifiers,
      annotations,
      lineStart: node.startPosition.row
    };
  }

  /**
   * 解析方法声明
   */
  parseMethodDeclaration(node, content) {
    let name = '';
    let returnType = 'void';
    const params = [];
    let modifiers = [];
    let annotations = [];
    let typeParameters = [];
    let throwsList = [];

    let child = node.firstChild;
    while (child) {
      if (child.type === 'modifier') {
        modifiers.push(child.text);
      } else if (child.type === 'annotation') {
        annotations.push(child.text);
      } else if (child.type === 'type_identifier' || child.type === 'primitive_type') {
        returnType = child.text;
      } else if (child.type === 'identifier') {
        name = child.text;
      } else if (child.type === 'type_parameters') {
        typeParameters = this.parseTypeParameters(child, content);
      } else if (child.type === 'formal_parameters') {
        const parsedParams = this.parseParameters(child, content);
        params.push(...parsedParams);
      } else if (child.type === 'throws') {
        let next = child.nextSibling;
        if (next) {
          throwsList = this.parseTypeList(next, content);
        }
      }
      child = child.nextSibling;
    }

    return {
      name,
      returnType,
      params,
      modifiers,
      annotations,
      typeParameters,
      throwsList,
      isConstructor: false,
      lineStart: node.startPosition.row,
      lineEnd: node.endPosition.row
    };
  }

  /**
   * 解析构造函数声明
   */
  parseConstructorDeclaration(node, content) {
    let name = '';
    const params = [];
    let modifiers = [];
    let throwsList = [];

    let child = node.firstChild;
    while (child) {
      if (child.type === 'modifier') {
        modifiers.push(child.text);
      } else if (child.type === 'identifier') {
        name = child.text;
      } else if (child.type === 'formal_parameters') {
        const parsedParams = this.parseParameters(child, content);
        params.push(...parsedParams);
      } else if (child.type === 'throws') {
        let next = child.nextSibling;
        if (next) {
          throwsList = this.parseTypeList(next, content);
        }
      }
      child = child.nextSibling;
    }

    return {
      name,
      returnType: name,
      params,
      modifiers,
      annotations: [],
      typeParameters: [],
      throwsList,
      isConstructor: true,
      lineStart: node.startPosition.row,
      lineEnd: node.endPosition.row
    };
  }

  /**
   * 解析参数
   */
  parseParameters(node, content) {
    const params = [];
    let child = node.firstChild;
    while (child) {
      if (child.type === 'formal_parameter') {
        let typeName = 'void';
        let paramName = '';
        let paramChild = child.firstChild;
        while (paramChild) {
          if (paramChild.type === 'type_identifier' || paramChild.type === 'primitive_type') {
            typeName = paramChild.text;
          } else if (paramChild.type === 'identifier') {
            paramName = paramChild.text;
          }
          paramChild = paramChild.nextSibling;
        }
        params.push({ name: paramName, type: typeName });
      }
      child = child.nextSibling;
    }
    return params;
  }

  /**
   * 解析类型参数（泛型）
   */
  parseTypeParameters(node, content) {
    const params = [];
    let child = node.firstChild;
    while (child) {
      if (child.type === 'type_parameter') {
        let name = '';
        let extendsList = [];
        let paramChild = child.firstChild;
        while (paramChild) {
          if (paramChild.type === 'identifier') {
            name = paramChild.text;
          } else if (paramChild.type === 'extends') {
            let next = paramChild.nextSibling;
            while (next) {
              if (next.type === 'type_identifier') {
                extendsList.push(next.text);
              }
              next = next.nextSibling;
            }
          }
          paramChild = paramChild.nextSibling;
        }
        params.push({ name, extends: extendsList });
      }
      child = child.nextSibling;
    }
    return params;
  }

  /**
   * 解析类型列表（实现/抛出）
   */
  parseTypeList(node, content) {
    const types = [];
    let child = node.firstChild;
    while (child) {
      if (child.type === 'type_identifier') {
        types.push(child.text);
      }
      child = child.nextSibling;
    }
    return types;
  }

  /**
   * 提取接口
   */
  extractInterfaces(root, content, result) {
    const walker = this.createWalker();
    const interfaceNodes = walker.findNodes(root, (node) => 
      node.type === 'interface_declaration'
    );

    for (const node of interfaceNodes) {
      let name = '';
      const methods = [];
      let modifiers = [];
      let typeParameters = [];
      let extendsInterfaces = [];

      let child = node.firstChild;
      while (child) {
        if (child.type === 'identifier') {
          name = child.text;
        } else if (child.type === 'modifier') {
          modifiers.push(child.text);
        } else if (child.type === 'type_parameters') {
          typeParameters = this.parseTypeParameters(child, content);
        } else if (child.type === 'extends') {
          let next = child.nextSibling;
          if (next) {
            extendsInterfaces = this.parseTypeList(next, content);
          }
        } else if (child.type === 'interface_body') {
          // 提取方法
          let bodyChild = child.firstChild;
          while (bodyChild) {
            if (bodyChild.type === 'method_declaration') {
              const method = this.parseMethodDeclaration(bodyChild, content);
              if (method) methods.push(method);
            }
            bodyChild = bodyChild.nextSibling;
          }
        }
        child = child.nextSibling;
      }

      result.interfaces.set(name, {
        name,
        modifiers,
        typeParameters,
        extendsInterfaces,
        methods,
        filePath: result.filePath,
        lineStart: node.startPosition.row,
        lineEnd: node.endPosition.row
      });
    }
  }

  /**
   * 提取枚举
   */
  extractEnums(root, content, result) {
    const walker = this.createWalker();
    const enumNodes = walker.findNodes(root, (node) => 
      node.type === 'enum_declaration'
    );

    for (const node of enumNodes) {
      let name = '';
      const constants = [];
      let modifiers = [];

      let child = node.firstChild;
      while (child) {
        if (child.type === 'identifier') {
          name = child.text;
        } else if (child.type === 'modifier') {
          modifiers.push(child.text);
        } else if (child.type === 'enum_body') {
          let bodyChild = child.firstChild;
          while (bodyChild) {
            if (bodyChild.type === 'enum_constant') {
              let constName = '';
              let constChild = bodyChild.firstChild;
              while (constChild) {
                if (constChild.type === 'identifier') {
                  constName = constChild.text;
                }
                constChild = constChild.nextSibling;
              }
              if (constName) constants.push(constName);
            }
            bodyChild = bodyChild.nextSibling;
          }
        }
        child = child.nextSibling;
      }

      result.enums.set(name, {
        name,
        constants,
        modifiers,
        filePath: result.filePath
      });
    }
  }

  /**
   * 提取注解
   */
  extractAnnotations(root, content, result) {
    const walker = this.createWalker();
    const annotationNodes = walker.findNodes(root, (node) => 
      node.type === 'annotation'
    );

    for (const node of annotationNodes) {
      result.metadata.annotations.push(node.text);
    }
  }

  /**
   * 提取方法
   */
  extractMethods(root, content, result) {
    // 方法已在类中提取，这里补充顶级方法（如果有）
    const walker = this.createWalker();
    const methodNodes = walker.findNodes(root, (node) => 
      node.type === 'method_declaration'
    );

    for (const node of methodNodes) {
      const method = this.parseMethodDeclaration(node, content);
      if (method) {
        result.functions.set(method.name, method);
      }
    }
  }

  /**
   * 提取字段
   */
  extractFields(root, content, result) {
    const walker = this.createWalker();
    const fieldNodes = walker.findNodes(root, (node) => 
      node.type === 'field_declaration'
    );

    for (const node of fieldNodes) {
      const field = this.parseFieldDeclaration(node, content);
      if (field) {
        result.variables.set(field.name, field);
      }
    }
  }

  /**
   * 解析类型
   */
  resolveType(typeName, filePath, context = null) {
    if (this.isBuiltinType(typeName)) {
      return {
        name: typeName,
        kind: 'builtin',
        isResolved: true,
        definition: null
      };
    }

    // 尝试在上下文中查找
    if (context) {
      if (context.classes && context.classes.has(typeName)) {
        return {
          name: typeName,
          kind: 'class',
          isResolved: true,
          definition: context.classes.get(typeName)
        };
      }
      if (context.interfaces && context.interfaces.has(typeName)) {
        return {
          name: typeName,
          kind: 'interface',
          isResolved: true,
          definition: context.interfaces.get(typeName)
        };
      }
    }

    return {
      name: typeName,
      kind: 'unknown',
      isResolved: false,
      definition: null
    };
  }

  /**
   * 是否内置类型
   */
  isBuiltinType(typeName) {
    return this.builtinTypes.has(typeName);
  }

  /**
   * 获取内置类型列表
   */
  getBuiltinTypes() {
    return Array.from(this.builtinTypes);
  }

  /**
   * 创建 AST 遍历器
   */
  createWalker() {
    return {
      findNodes: (node, predicate) => {
        const results = [];
        const traverse = (n) => {
          if (predicate(n)) {
            results.push(n);
          }
          if (n.children) {
            for (const child of n.children) {
              traverse(child);
            }
          }
        };
        traverse(node);
        return results;
      }
    };
  }

  /**
   * 统计节点数量
   */
  countNodes(node) {
    let count = 1;
    if (node.children) {
      for (const child of node.children) {
        count += this.countNodes(child);
      }
    }
    return count;
  }

  /**
   * 提取依赖
   */
  extractDependencies(filePath, content) {
    const result = {
      imports: [],
      dependencies: []
    };

    const lines = content.split('\n');
    for (const line of lines) {
      const match = line.match(/^import\s+([^;]+);/);
      if (match) {
        const importPath = match[1].trim();
        result.imports.push(importPath);
        if (!importPath.endsWith('.*')) {
          result.dependencies.push(importPath);
        }
      }
    }

    return result;
  }
}

export default JavaParser;