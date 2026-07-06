// parser/parsers/CppParser.js

import LanguageParser from '../core/LanguageParser.js';
import path from 'path';
import Parser from 'tree-sitter';
import Cpp from '@tree-sitter/cpp';

export class CppParser extends LanguageParser {
  constructor(options = {}) {
    super();
    this.languageName = 'cpp';
    this.fileExtensions = ['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx'];
    this.supportedFeatures = {
      structs: true,
      classes: true,
      interfaces: false,
      generics: true,
      annotations: false,
      macros: true,
      imports: true
    };

    this.parser = new Parser();
    this.parser.setLanguage(Cpp);
    this.includePaths = options.includePaths || [];
    this.builtinTypes = new Set([
      'void', 'char', 'short', 'int', 'long', 'float', 'double',
      'signed', 'unsigned', 'bool', 'size_t', 'ptrdiff_t',
      'std::string', 'std::vector', 'std::map', 'std::set',
      'std::list', 'std::deque', 'std::array', 'std::tuple',
      'std::pair', 'std::unique_ptr', 'std::shared_ptr', 'std::weak_ptr'
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
        language: 'cpp',
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
          namespace: 'global'
        }
      };

      this.extractClasses(root, content, result);
      this.extractStructs(root, content, result);
      this.extractTypedefs(root, content, result);
      this.extractEnums(root, content, result);
      this.extractFunctions(root, content, result);
      this.extractImports(root, content, result, options);
      this.extractNamespaces(root, content, result);
      this.extractTemplates(root, content, result);

      result.metadata.parseTime = Date.now() - startTime;
      result.metadata.nodeCount = this.countNodes(root);

      return result;
    } catch (error) {
      return {
        filePath,
        language: 'cpp',
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
          namespace: 'global'
        }
      };
    }
  }

  /**
   * 提取类定义
   */
  extractClasses(root, content, result) {
    const walker = this.createWalker();
    const classNodes = walker.findNodes(root, (node) => 
      node.type === 'class_specifier'
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
    let name = 'anonymous';
    let fields = [];
    let methods = [];
    let baseClasses = [];
    let accessSpecifiers = [];

    // 获取名称
    let child = node.firstChild;
    while (child) {
      if (child.type === 'type_identifier') {
        name = child.text;
        break;
      }
      child = child.nextSibling;
    }

    // 获取基类
    child = node.firstChild;
    while (child) {
      if (child.type === 'base_class_list') {
        baseClasses = this.parseBaseClasses(child, content);
        break;
      }
      child = child.nextSibling;
    }

    // 获取成员
    child = node.firstChild;
    while (child) {
      if (child.type === 'field_declaration_list') {
        const parsed = this.parseClassBody(child, content);
        fields = parsed.fields;
        methods = parsed.methods;
        accessSpecifiers = parsed.accessSpecifiers;
        break;
      }
      child = child.nextSibling;
    }

    return {
      name,
      kind: 'class',
      fields,
      methods,
      baseClasses,
      accessSpecifiers,
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
    const accessSpecifiers = [];
    let currentAccess = 'private';

    let child = node.firstChild;
    while (child) {
      if (child.type === 'access_specifier') {
        currentAccess = child.text.replace(':', '').trim();
        accessSpecifiers.push({
          type: currentAccess,
          line: child.startPosition.row
        });
      } else if (child.type === 'field_declaration') {
        const field = this.parseFieldDeclaration(child, content);
        if (field) {
          field.access = currentAccess;
          fields.push(field);
        }
      } else if (child.type === 'function_definition') {
        const method = this.parseMethodDefinition(child, content);
        if (method) {
          method.access = currentAccess;
          methods.push(method);
        }
      }
      child = child.nextSibling;
    }

    return { fields, methods, accessSpecifiers };
  }

  /**
   * 解析方法定义
   */
  parseMethodDefinition(node, content) {
    let name = 'unknown';
    let returnType = 'void';
    const params = [];
    let isConst = false;
    let isVirtual = false;
    let isStatic = false;

    let child = node.firstChild;
    while (child) {
      if (child.type === 'function_declarator') {
        let declChild = child.firstChild;
        while (declChild) {
          if (declChild.type === 'identifier') {
            name = declChild.text;
          } else if (declChild.type === 'parameter_list') {
            let paramChild = declChild.firstChild;
            while (paramChild) {
              if (paramChild.type === 'parameter_declaration') {
                const param = this.parseParameter(paramChild, content);
                if (param) params.push(param);
              }
              paramChild = paramChild.nextSibling;
            }
          }
          declChild = declChild.nextSibling;
        }
      } else if (child.type === 'type_identifier' || child.type === 'primitive_type') {
        returnType = child.text;
      } else if (child.type === 'virtual') {
        isVirtual = true;
      } else if (child.type === 'static') {
        isStatic = true;
      } else if (child.type === 'const') {
        isConst = true;
      }
      child = child.nextSibling;
    }

    return {
      name,
      returnType,
      params,
      isConst,
      isVirtual,
      isStatic,
      lineStart: node.startPosition.row,
      lineEnd: node.endPosition.row
    };
  }

  /**
   * 解析基类列表
   */
  parseBaseClasses(node, content) {
    const baseClasses = [];
    let child = node.firstChild;
    while (child) {
      if (child.type === 'base_class') {
        let name = '';
        let access = 'public';
        let isVirtual = false;

        let baseChild = child.firstChild;
        while (baseChild) {
          if (baseChild.type === 'access_specifier') {
            access = baseChild.text.replace(':', '').trim();
          } else if (baseChild.type === 'virtual') {
            isVirtual = true;
          } else if (baseChild.type === 'type_identifier') {
            name = baseChild.text;
          }
          baseChild = baseChild.nextSibling;
        }

        baseClasses.push({ name, access, isVirtual });
      }
      child = child.nextSibling;
    }
    return baseClasses;
  }

  /**
   * 提取模板
   */
  extractTemplates(root, content, result) {
    const walker = this.createWalker();
    const templateNodes = walker.findNodes(root, (node) => 
      node.type === 'template_declaration'
    );

    for (const node of templateNodes) {
      // 解析模板参数
      let child = node.firstChild;
      while (child) {
        if (child.type === 'template_parameter_list') {
          const params = [];
          let paramChild = child.firstChild;
          while (paramChild) {
            if (paramChild.type === 'type_parameter') {
              const match = paramChild.text.match(/class\s+(\w+)/);
              if (match) {
                params.push(match[1]);
              }
            }
            paramChild = paramChild.nextSibling;
          }
          // 存储模板信息
          result.metadata.templates = result.metadata.templates || [];
          result.metadata.templates.push({
            params,
            line: node.startPosition.row
          });
          break;
        }
        child = child.nextSibling;
      }
    }
  }

  /**
   * 提取命名空间
   */
  extractNamespaces(root, content, result) {
    const walker = this.createWalker();
    const namespaceNodes = walker.findNodes(root, (node) => 
      node.type === 'namespace_definition'
    );

    for (const node of namespaceNodes) {
      let child = node.firstChild;
      let namespaceName = 'global';
      
      while (child) {
        if (child.type === 'identifier') {
          namespaceName = child.text;
          break;
        }
        child = child.nextSibling;
      }

      result.metadata.namespace = namespaceName;
    }
  }

  /**
   * 其他方法继承自 CParser，并做相应覆盖
   */
  parseFieldDeclaration(node, content) {
    // C++ 字段解析，支持更多类型
    let typeName = 'unknown';
    let fieldName = null;
    let isPointer = false;
    let isReference = false;

    let child = node.firstChild;
    let typeParts = [];

    while (child) {
      if (child.type === 'type_identifier' || child.type === 'primitive_type') {
        typeParts.push(child.text);
      } else if (child.type === 'pointer_declarator') {
        isPointer = true;
        let ptrChild = child.firstChild;
        while (ptrChild) {
          if (ptrChild.type === 'field_identifier' || ptrChild.type === 'identifier') {
            fieldName = ptrChild.text;
          } else if (ptrChild.type === 'type_identifier' || ptrChild.type === 'primitive_type') {
            typeParts.push(ptrChild.text);
          }
          ptrChild = ptrChild.nextSibling;
        }
      } else if (child.type === 'reference_declarator') {
        isReference = true;
      } else if (child.type === 'field_identifier' || child.type === 'identifier') {
        if (!fieldName) {
          fieldName = child.text;
        }
      }
      child = child.nextSibling;
    }

    if (fieldName) {
      return {
        name: fieldName,
        type: {
          name: typeParts.join(' '),
          kind: this.isBuiltinType(typeParts.join(' ')) ? 'builtin' : 'class',
          isPointer,
          isReference,
          referencedType: typeParts.join(' ')
        }
      };
    }

    return null;
  }

  /**
   * 提取包含文件（支持 C++ 风格的 include）
   */
  extractImports(root, content, result, options) {
    // 使用父类方法，但增加对 C++ 标准库的支持
    super.extractImports(root, content, result, options);
    
    // 额外提取 using namespace 和 using declaration
    const walker = this.createWalker();
    const usingNodes = walker.findNodes(root, (node) => 
      node.type === 'using_declaration' || node.type === 'using_namespace_directive'
    );

    for (const node of usingNodes) {
      const text = node.text;
      const match = text.match(/using\s+(?:namespace\s+)?(.+);/);
      if (match) {
        const usingName = match[1].trim();
        result.imports.set(usingName, {
          path: usingName,
          resolved: usingName,
          type: 'using'
        });
      }
    }
  }

  /**
   * 是否内置类型（扩展 C++ 标准库类型）
   */
  isBuiltinType(typeName) {
    if (super.isBuiltinType(typeName)) return true;
    return this.builtinTypes.has(typeName);
  }

  /**
   * 创建 AST 遍历器
   */
  createWalker() {
    // 同 CParser
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
      // include
      let match = line.match(/^#include\s+["<]([^">]+)[">]/);
      if (match) {
        result.imports.push(match[1]);
        result.dependencies.push(match[1]);
        continue;
      }

      // using namespace
      match = line.match(/using\s+namespace\s+(\w+(?:::\w+)*);/);
      if (match) {
        result.imports.push(match[1]);
      }
    }

    return result;
  }
}

export default CppParser;