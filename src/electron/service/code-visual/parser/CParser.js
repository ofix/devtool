// parser/parsers/CParser.js

import LanguageParser from '../core/LanguageParser.js';
import { promises as fs } from 'fs';
import path from 'path';
import Parser from 'tree-sitter';
import C from '@tree-sitter/c';
import DependencyResolver from '../DependencyResolver.js';

export class CParser extends LanguageParser {
    constructor(options = {}) {
        super();
        this.languageName = 'c';
        this.fileExtensions = ['.c', '.h'];
        this.supportedFeatures = {
            structs: true,
            classes: false,
            interfaces: false,
            generics: false,
            annotations: false,
            macros: true,
            imports: true
        };

        this.parser = new Parser();
        this.parser.setLanguage(C);
        this.includePaths = options.includePaths || [];
        this.builtinTypes = new Set([
            'void', 'char', 'short', 'int', 'long', 'float', 'double',
            'signed', 'unsigned', 'bool', 'size_t', 'ptrdiff_t'
        ]);

        // 依赖解析器
        this.dependencyResolver = new DependencyResolver({
            includePaths: this.includePaths,
            maxDepth: options.maxDepth || 10
        });
        this.dependencyResolver.setFileParser(this);
    }

    /**
     * 解析文件（包含依赖）
     */
    async parseFile(filePath, content, options = {}) {
        // 如果 content 未提供，读取文件
        if (!content) {
            try {
                content = await fs.readFile(filePath, 'utf-8');
            } catch (error) {
                throw new Error(`Cannot read file ${filePath}: ${error.message}`);
            }
        }

        // 解析当前文件
        const result = await this.parseSingleFile(filePath, content, options);

        // 如果有依赖解析选项，递归解析依赖
        if (options.resolveDependencies !== false) {
            const fullResult = await this.dependencyResolver.parseFileWithDependencies(
                filePath,
                {
                    ...options,
                    includePaths: options.includePaths || this.includePaths
                }
            );

            // 合并结果
            result.dependencies = fullResult;
            result.allStructs = fullResult.mainFile ? fullResult.mainFile.structs : result.structs;
            result.allTypedefs = fullResult.mainFile ? fullResult.mainFile.typedefs : result.typedefs;
            result.unresolvedIncludes = fullResult.unresolvedIncludes || [];
            result.errors = fullResult.errors || [];
        }

        return result;
    }

    /**
     * 解析单个文件（不含依赖）
     */
    async parseSingleFile(filePath, content, options = {}) {
        const startTime = Date.now();

        try {
            const tree = this.parser.parse(content);
            const root = tree.rootNode;

            const result = {
                filePath,
                language: 'c',
                structs: new Map(),
                classes: new Map(),
                interfaces: new Map(),
                unions: new Map(),
                typedefs: new Map(),
                functions: new Map(),
                variables: new Map(),
                enums: new Map(),
                imports: new Map(),
                resolvedImports: [],
                metadata: {
                    parseTime: 0,
                    nodeCount: 0,
                    errors: []
                }
            };

            // 提取各种元素
            this.extractStructs(root, content, result);
            this.extractUnions(root, content, result);
            this.extractTypedefs(root, content, result);
            this.extractEnums(root, content, result);
            this.extractFunctions(root, content, result);
            this.extractImports(root, content, result, options);
            this.extractMacros(root, content, result);

            result.metadata.parseTime = Date.now() - startTime;
            result.metadata.nodeCount = this.countNodes(root);

            return result;
        } catch (error) {
            return {
                filePath,
                language: 'c',
                structs: new Map(),
                classes: new Map(),
                interfaces: new Map(),
                unions: new Map(),
                typedefs: new Map(),
                functions: new Map(),
                variables: new Map(),
                enums: new Map(),
                imports: new Map(),
                resolvedImports: [],
                metadata: {
                    parseTime: Date.now() - startTime,
                    nodeCount: 0,
                    errors: [error.message]
                }
            };
        }
    }

    /**
     * 提取结构体
     */
    extractStructs(root, content, result) {
        const walker = this.createWalker();
        const structNodes = walker.findNodes(root, (node) =>
            node.type === 'struct_specifier'
        );

        for (const node of structNodes) {
            const struct = this.parseStructNode(node, content, result.filePath);
            if (struct && struct.name !== 'anonymous') {
                result.structs.set(struct.name, struct);
            }
        }
    }

    /**
     * 提取联合体
     */
    extractUnions(root, content, result) {
        const walker = this.createWalker();
        const unionNodes = walker.findNodes(root, (node) =>
            node.type === 'union_specifier'
        );

        for (const node of unionNodes) {
            const union = this.parseUnionNode(node, content, result.filePath);
            if (union && union.name !== 'anonymous') {
                result.unions.set(union.name, union);
            }
        }
    }

    /**
     * 解析结构体节点（增强版 - 记录精确位置）
     */
    parseStructNode(node, content, filePath) {
        let name = 'anonymous';
        let fields = [];
        let isForward = true;
        let attributes = [];

        // 获取名称
        let child = node.firstChild;
        while (child) {
            if (child.type === 'type_identifier') {
                name = child.text;
                break;
            }
            if (child.type === 'attribute_specifier') {
                attributes.push(child.text);
            }
            child = child.nextSibling;
        }

        // 获取字段
        child = node.firstChild;
        while (child) {
            if (child.type === 'field_declaration_list') {
                fields = this.parseFieldList(child, content);
                isForward = false;
                break;
            }
            child = child.nextSibling;
        }

        // 获取精确的行列位置
        const location = {
            filePath,
            lineStart: node.startPosition.row + 1, // tree-sitter 从0开始
            lineEnd: node.endPosition.row + 1,
            columnStart: node.startPosition.column,
            columnEnd: node.endPosition.column
        };

        // 解析字段类型
        for (const field of fields) {
            const typeName = field.type.referencedType || field.type.name;
            field.type.needsResolution = !this.isBuiltinType(typeName);
        }

        const struct = ASTTypes.createStructDefinition(
            name,
            'struct',
            fields,
            location,
            {
                isComplete: !isForward && fields.length > 0,
                isForwardDeclaration: isForward,
                attributes,
                size: null,
                alignment: null,
                isResolved: false
            }
        );

        // 添加额外的元数据
        struct.sourceFiles = new Set([filePath]);
        struct.declarations = new Map();
        struct.declarations.set(filePath, {
            location,
            isForward: isForward,
            isDefinition: !isForward,
            isComplete: !isForward && fields.length > 0,
            fileHash: null // 稍后填充
        });

        return struct;
    }

    /**
     * 解析联合体节点（增强版）
     */
    parseUnionNode(node, content, filePath) {
        let name = 'anonymous';
        let fields = [];
        let isForward = true;

        let child = node.firstChild;
        while (child) {
            if (child.type === 'type_identifier') {
                name = child.text;
                break;
            }
            child = child.nextSibling;
        }

        child = node.firstChild;
        while (child) {
            if (child.type === 'field_declaration_list') {
                fields = this.parseFieldList(child, content);
                isForward = false;
                break;
            }
            child = child.nextSibling;
        }

        const location = {
            filePath,
            lineStart: node.startPosition.row + 1,
            lineEnd: node.endPosition.row + 1,
            columnStart: node.startPosition.column,
            columnEnd: node.endPosition.column
        };

        const union = ASTTypes.createStructDefinition(
            name,
            'union',
            fields,
            location,
            {
                isComplete: !isForward,
                isForwardDeclaration: isForward,
                isResolved: false
            }
        );

        union.sourceFiles = new Set([filePath]);
        union.declarations = new Map();
        union.declarations.set(filePath, {
            location,
            isForward: isForward,
            isDefinition: !isForward,
            isComplete: !isForward,
            fileHash: null
        });

        return union;
    }


    /**
     * 解析字段列表
     */
    parseFieldList(node, content) {
        const fields = [];
        let child = node.firstChild;

        while (child) {
            if (child.type === 'field_declaration') {
                const field = this.parseFieldDeclaration(child, content);
                if (field) {
                    fields.push(field);
                }
            }
            child = child.nextSibling;
        }

        return fields;
    }

    /**
     * 解析字段声明
     */
    parseFieldDeclaration(node, content) {
        let typeName = 'unknown';
        let fieldName = null;
        let isPointer = false;
        let pointerDepth = 0;
        let isArray = false;
        let arraySize = null;
        let bitFieldWidth = null;

        let child = node.firstChild;
        let typeParts = [];

        while (child) {
            if (child.type === 'type_identifier' || child.type === 'primitive_type') {
                typeParts.push(child.text);
            } else if (child.type === 'pointer_declarator') {
                isPointer = true;
                pointerDepth++;
                // 提取指针指向的类型
                let ptrChild = child.firstChild;
                while (ptrChild) {
                    if (ptrChild.type === 'field_identifier' || ptrChild.type === 'identifier') {
                        if (!fieldName) fieldName = ptrChild.text;
                    } else if (ptrChild.type === 'type_identifier' || ptrChild.type === 'primitive_type') {
                        typeParts.push(ptrChild.text);
                    }
                    ptrChild = ptrChild.nextSibling;
                }
            } else if (child.type === 'array_declarator') {
                isArray = true;
                // 提取数组大小
                let arrayChild = child.firstChild;
                while (arrayChild) {
                    if (arrayChild.type === 'number_literal') {
                        arraySize = parseInt(arrayChild.text);
                    } else if (arrayChild.type === 'field_identifier' || arrayChild.type === 'identifier') {
                        if (!fieldName) fieldName = arrayChild.text;
                    }
                    arrayChild = arrayChild.nextSibling;
                }
            } else if (child.type === 'field_identifier' || child.type === 'identifier') {
                if (!fieldName) {
                    fieldName = child.text;
                }
            } else if (child.type === 'bitfield_clause') {
                // 位域支持
                let bitChild = child.firstChild;
                while (bitChild) {
                    if (bitChild.type === 'number_literal') {
                        bitFieldWidth = parseInt(bitChild.text);
                    }
                    bitChild = bitChild.nextSibling;
                }
            }
            child = child.nextSibling;
        }

        if (fieldName) {
            const finalTypeName = typeParts.join(' ');
            return {
                name: fieldName,
                type: {
                    name: finalTypeName,
                    kind: this.isBuiltinType(finalTypeName) ? 'builtin' : 'struct',
                    isPointer,
                    pointerDepth,
                    isArray,
                    arraySize,
                    referencedType: finalTypeName,
                    needsResolution: !this.isBuiltinType(finalTypeName),
                    resolved: false,
                    definition: null
                },
                bitField: bitFieldWidth ? { width: bitFieldWidth } : null,
                offset: null // 可以后续计算
            };
        }

        return null;
    }

    /**
     * 解析类型（从依赖中查找）
     */
    resolveType(typeName, filePath, context = null) {
        // 检查是否是内置类型
        if (this.isBuiltinType(typeName)) {
            return {
                name: typeName,
                kind: 'builtin',
                isResolved: true,
                isBuiltin: true,
                definition: null
            };
        }

        // 在上下文中查找
        if (context) {
            // 查找 struct
            if (context.structs && context.structs.has(typeName)) {
                const def = context.structs.get(typeName);
                return {
                    name: typeName,
                    kind: 'struct',
                    isResolved: true,
                    isBuiltin: false,
                    definition: def
                };
            }
            // 查找 union
            if (context.unions && context.unions.has(typeName)) {
                const def = context.unions.get(typeName);
                return {
                    name: typeName,
                    kind: 'union',
                    isResolved: true,
                    isBuiltin: false,
                    definition: def
                };
            }
            // 查找 typedef
            if (context.typedefs && context.typedefs.has(typeName)) {
                const typedef = context.typedefs.get(typeName);
                // 递归解析
                if (typedef.referencedType) {
                    return this.resolveType(typedef.referencedType, filePath, context);
                }
                return {
                    name: typeName,
                    kind: 'typedef',
                    isResolved: true,
                    isBuiltin: false,
                    definition: typedef,
                    isTypedef: true
                };
            }
        }

        return {
            name: typeName,
            kind: 'unknown',
            isResolved: false,
            isBuiltin: false,
            definition: null,
            error: `Type '${typeName}' not found`
        };
    }

    /**
     * 提取包含文件
     */
    extractImports(root, content, result, options) {
        const walker = this.createWalker();
        const includeNodes = walker.findNodes(root, (node) =>
            node.type === 'preproc_include'
        );

        const includePaths = options.includePaths || this.includePaths;

        for (const node of includeNodes) {
            let child = node.firstChild;
            while (child) {
                if (child.type === 'string_literal') {
                    const includePath = this.extractStringLiteral(child.text);
                    if (includePath) {
                        const isSystem = includePath.startsWith('<');
                        const resolved = this.dependencyResolver.resolveIncludePath(
                            includePath,
                            result.filePath,
                            includePaths
                        );

                        result.imports.set(includePath, {
                            path: includePath,
                            resolved: resolved || includePath,
                            type: isSystem ? 'system' : 'local',
                            isResolved: !!resolved
                        });
                    }
                    break;
                }
                child = child.nextSibling;
            }
        }
    }

    /**
     * 提取字符串字面量
     */
    extractStringLiteral(text) {
        const match = text.match(/["<]([^">]+)[">]/);
        return match ? match[1] : null;
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
            const match = line.match(/^#include\s+["<]([^">]+)[">]/);
            if (match) {
                const includePath = match[1];
                result.imports.push(includePath);
                result.dependencies.push(includePath);
            }
        }

        return result;
    }
}

export default CParser;