// parser/parsers/CParser.js

import LanguageParser from '../core/LanguageParser.js';
import { promises as fs } from 'fs';
import path from 'path';
import Parser from 'tree-sitter';
import C from '@tree-sitter/c';
import DependencyResolver from '../DependencyResolver.js';
import ASTTypes from '../core/ASTTypes.js';

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
        if (!content) {
            try {
                content = await fs.readFile(filePath, 'utf-8');
            } catch (error) {
                throw new Error(`Cannot read file ${filePath}: ${error.message}`);
            }
        }

        const result = await this.parseSingleFile(filePath, content, options);

        if (options.resolveDependencies !== false) {
            const fullResult = await this.dependencyResolver.parseFileWithDependencies(
                filePath,
                {
                    ...options,
                    includePaths: options.includePaths || this.includePaths
                }
            );

            result.dependencies = fullResult;
            result.allStructs = fullResult.mainFile ? fullResult.mainFile.structs : result.structs;
            result.allTypedefs = fullResult.mainFile ? fullResult.mainFile.typedefs : result.typedefs;
            result.unresolvedIncludes = fullResult.unresolvedIncludes || [];
            result.errors = fullResult.errors || [];
        }

        return result;
    }

    /**
     * 解析单个文件（不含依赖）- 核心优化：单次遍历提取所有元素
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
                macros: new Map(),
                resolvedImports: [],
                metadata: {
                    parseTime: 0,
                    nodeCount: 0,
                    errors: []
                }
            };

            // ✅ 单次遍历提取所有元素
            this.extractAll(root, content, result, options);

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
                macros: new Map(),
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
     * 核心方法：单次遍历AST，通过Switch分发处理所有节点类型
     */
    extractAll(root, content, result, options) {
        const stack = [root];
        const visited = new WeakSet(); // 使用WeakSet防止循环引用

        while (stack.length > 0) {
            const node = stack.pop();

            if (!node || visited.has(node)) continue;
            visited.add(node);

            // 根据节点类型分发处理
            switch (node.type) {
                // ============ 类型定义 ============
                case 'struct_specifier':
                    this.handleStructNode(node, content, result);
                    break;

                case 'union_specifier':
                    this.handleUnionNode(node, content, result);
                    break;

                case 'enum_specifier':
                    this.handleEnumNode(node, content, result);
                    break;

                case 'typedef_declaration':
                    this.handleTypedefNode(node, content, result);
                    break;

                // ============ 函数定义 ============
                case 'function_definition':
                    this.handleFunctionNode(node, content, result);
                    break;

                // ============ 预处理指令 ============
                case 'preproc_include':
                    this.handleIncludeNode(node, content, result, options);
                    break;

                case 'preproc_def':
                    this.handleMacroNode(node, content, result);
                    break;

                // ============ 变量声明 ============
                case 'declaration':
                    this.handleDeclarationNode(node, content, result);
                    break;

                case 'init_declarator':
                    this.handleInitDeclaratorNode(node, content, result);
                    break;

                // ============ 注释 ============
                case 'comment':
                    // 可选：收集注释用于文档生成
                    break;

                default:
                    // 其他节点类型，仅遍历子节点
                    break;
            }

            // 遍历子节点（从后往前入栈，保持遍历顺序）
            if (node.children && node.children.length > 0) {
                for (let i = node.children.length - 1; i >= 0; i--) {
                    const child = node.children[i];
                    if (child && !visited.has(child)) {
                        stack.push(child);
                    }
                }
            }
        }
    }

    // ============================================================
    // 节点处理器（各Handler方法）
    // ============================================================

    /**
     * 处理结构体节点
     */
    handleStructNode(node, content, result) {
        const struct = this.parseStructNode(node, content, result.filePath);
        if (struct && struct.name !== 'anonymous') {
            if (!result.structs.has(struct.name)) {
                result.structs.set(struct.name, struct);
            }
        }
    }

    /**
     * 处理联合体节点
     */
    handleUnionNode(node, content, result) {
        const union = this.parseUnionNode(node, content, result.filePath);
        if (union && union.name !== 'anonymous') {
            if (!result.unions.has(union.name)) {
                result.unions.set(union.name, union);
            }
        }
    }

    /**
     * 处理枚举节点
     */
    handleEnumNode(node, content, result) {
        const enumDef = this.parseEnumNode(node, content, result.filePath);
        if (enumDef && enumDef.name !== 'anonymous') {
            if (!result.enums.has(enumDef.name)) {
                result.enums.set(enumDef.name, enumDef);
            }
        }
    }

    /**
     * 处理typedef节点
     */
    handleTypedefNode(node, content, result) {
        const typedef = this.parseTypedefNode(node, content, result.filePath);
        if (typedef && typedef.name) {
            if (!result.typedefs.has(typedef.name)) {
                result.typedefs.set(typedef.name, typedef);
            }
        }
    }

    /**
     * 处理函数定义节点
     */
    handleFunctionNode(node, content, result) {
        const func = this.parseFunctionNode(node, content, result.filePath);
        if (func && func.name) {
            if (!result.functions.has(func.name)) {
                result.functions.set(func.name, func);
            }
        }
    }

    /**
     * 处理包含指令节点
     */
    handleIncludeNode(node, content, result, options) {
        let child = node.firstChild;
        while (child) {
            if (child.type === 'string_literal') {
                const includePath = this.extractStringLiteral(child.text);
                if (includePath) {
                    const isSystem = includePath.startsWith('<');
                    const includePaths = options.includePaths || this.includePaths;
                    const resolved = this.dependencyResolver.resolveIncludePath(
                        includePath,
                        result.filePath,
                        includePaths
                    );

                    if (!result.imports.has(includePath)) {
                        result.imports.set(includePath, {
                            path: includePath,
                            resolved: resolved || includePath,
                            type: isSystem ? 'system' : 'local',
                            isResolved: !!resolved
                        });
                    }
                }
                break;
            }
            child = child.nextSibling;
        }
    }

    /**
     * 处理宏定义节点
     */
    handleMacroNode(node, content, result) {
        const macro = this.parseMacroNode(node, content);
        if (macro && macro.name) {
            if (!result.macros.has(macro.name)) {
                result.macros.set(macro.name, macro);
            }
        }
    }

    /**
     * 处理声明节点（可能包含变量声明）
     */
    handleDeclarationNode(node, content, result) {
        // 检查是否包含init_declarator（变量初始化）
        let child = node.firstChild;
        let typeName = '';
        let isStatic = false;
        let isExtern = false;

        while (child) {
            if (child.type === 'primitive_type' || child.type === 'type_identifier') {
                typeName = child.text;
            } else if (child.type === 'storage_class_specifier') {
                if (child.text === 'static') isStatic = true;
                if (child.text === 'extern') isExtern = true;
            } else if (child.type === 'init_declarator') {
                // 提取变量名
                let varChild = child.firstChild;
                while (varChild) {
                    if (varChild.type === 'identifier' || varChild.type === 'field_identifier') {
                        const varName = varChild.text;
                        if (!result.variables.has(varName)) {
                            result.variables.set(varName, {
                                name: varName,
                                type: typeName || 'unknown',
                                isStatic,
                                isExtern,
                                location: {
                                    filePath: result.filePath,
                                    lineStart: varChild.startPosition.row + 1,
                                    lineEnd: varChild.endPosition.row + 1,
                                    columnStart: varChild.startPosition.column,
                                    columnEnd: varChild.endPosition.column
                                }
                            });
                        }
                        break;
                    }
                    varChild = varChild.nextSibling;
                }
            }
            child = child.nextSibling;
        }
    }

    /**
     * 处理初始化声明器（独立节点）
     */
    handleInitDeclaratorNode(node, content, result) {
        // 通常由 declaration 节点处理，这里作为备用
        let child = node.firstChild;
        while (child) {
            if (child.type === 'identifier' || child.type === 'field_identifier') {
                const varName = child.text;
                if (!result.variables.has(varName)) {
                    result.variables.set(varName, {
                        name: varName,
                        type: 'unknown',
                        isStatic: false,
                        isExtern: false,
                        location: {
                            filePath: result.filePath,
                            lineStart: child.startPosition.row + 1,
                            lineEnd: child.endPosition.row + 1,
                            columnStart: child.startPosition.column,
                            columnEnd: child.endPosition.column
                        }
                    });
                }
                break;
            }
            child = child.nextSibling;
        }
    }

    // ============================================================
    // 解析方法（保持原有逻辑）
    // ============================================================

    /**
     * 解析结构体节点
     */
    parseStructNode(node, content, filePath) {
        let name = 'anonymous';
        let fields = [];
        let isForward = true;
        let attributes = [];

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

        struct.sourceFiles = new Set([filePath]);
        struct.declarations = new Map();
        struct.declarations.set(filePath, {
            location,
            isForward: isForward,
            isDefinition: !isForward,
            isComplete: !isForward && fields.length > 0,
            fileHash: null
        });

        return struct;
    }

    /**
     * 解析联合体节点
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
     * 解析枚举节点
     */
    parseEnumNode(node, content, filePath) {
        let name = 'anonymous';
        let enumerators = [];

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
            if (child.type === 'enumerator_list') {
                enumerators = this.parseEnumeratorList(child, content);
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

        return {
            name,
            kind: 'enum',
            enumerators,
            location,
            isComplete: enumerators.length > 0,
            sourceFiles: new Set([filePath])
        };
    }

    /**
     * 解析枚举值列表
     */
    parseEnumeratorList(node, content) {
        const enumerators = [];
        let child = node.firstChild;

        while (child) {
            if (child.type === 'enumerator') {
                const enumerator = this.parseEnumerator(child, content);
                if (enumerator) {
                    enumerators.push(enumerator);
                }
            }
            child = child.nextSibling;
        }

        return enumerators;
    }

    /**
     * 解析单个枚举值
     */
    parseEnumerator(node, content) {
        let name = null;
        let value = null;

        let child = node.firstChild;
        while (child) {
            if (child.type === 'identifier') {
                name = child.text;
            } else if (child.type === 'number_literal') {
                value = child.text;
            }
            child = child.nextSibling;
        }

        if (!name) return null;

        return {
            name,
            value: value ? parseInt(value) : null,
            location: {
                lineStart: node.startPosition.row + 1,
                lineEnd: node.endPosition.row + 1,
                columnStart: node.startPosition.column,
                columnEnd: node.endPosition.column
            }
        };
    }

    /**
     * 解析typedef节点
     */
    parseTypedefNode(node, content, filePath) {
        let name = null;
        let referencedType = null;
        let isPointer = false;

        let child = node.firstChild;
        let typeParts = [];

        while (child) {
            if (child.type === 'type_identifier' || child.type === 'primitive_type') {
                typeParts.push(child.text);
            } else if (child.type === 'pointer_declarator') {
                isPointer = true;
                let ptrChild = child.firstChild;
                while (ptrChild) {
                    if (ptrChild.type === 'type_identifier' || ptrChild.type === 'primitive_type') {
                        typeParts.push(ptrChild.text);
                    }
                    if (ptrChild.type === 'identifier') {
                        name = ptrChild.text;
                    }
                    ptrChild = ptrChild.nextSibling;
                }
            } else if (child.type === 'type_identifier') {
                // 处理 struct/union 类型别名
                if (typeParts.length === 0) {
                    typeParts.push(child.text);
                }
            } else if (child.type === 'identifier') {
                name = child.text;
            }
            child = child.nextSibling;
        }

        if (!name) {
            // 尝试从最后一个子节点获取名称
            let lastChild = node.lastChild;
            while (lastChild) {
                if (lastChild.type === 'identifier') {
                    name = lastChild.text;
                    break;
                }
                lastChild = lastChild.previousSibling;
            }
        }

        if (name && typeParts.length > 0) {
            referencedType = typeParts.join(' ');
            return {
                name,
                referencedType,
                isPointer,
                kind: 'typedef',
                location: {
                    filePath,
                    lineStart: node.startPosition.row + 1,
                    lineEnd: node.endPosition.row + 1,
                    columnStart: node.startPosition.column,
                    columnEnd: node.endPosition.column
                },
                isResolved: false
            };
        }

        return null;
    }

    /**
     * 解析函数节点
     */
    parseFunctionNode(node, content, filePath) {
        let name = null;
        let returnType = 'unknown';
        let parameters = [];
        let isStatic = false;
        let isExtern = false;

        let child = node.firstChild;
        let returnTypeParts = [];

        while (child) {
            if (child.type === 'primitive_type' || child.type === 'type_identifier') {
                returnTypeParts.push(child.text);
            } else if (child.type === 'storage_class_specifier') {
                if (child.text === 'static') isStatic = true;
                if (child.text === 'extern') isExtern = true;
            } else if (child.type === 'pointer_declarator') {
                // 函数返回指针
                let ptrChild = child.firstChild;
                while (ptrChild) {
                    if (ptrChild.type === 'identifier') {
                        name = ptrChild.text;
                    }
                    if (ptrChild.type === 'function_declarator') {
                        // 解析参数
                        parameters = this.parseParameterList(ptrChild, content);
                    }
                    ptrChild = ptrChild.nextSibling;
                }
            } else if (child.type === 'function_declarator') {
                parameters = this.parseParameterList(child, content);
                // 获取函数名
                let declChild = child.firstChild;
                while (declChild) {
                    if (declChild.type === 'identifier') {
                        name = declChild.text;
                        break;
                    }
                    declChild = declChild.nextSibling;
                }
            } else if (child.type === 'parameter_list') {
                parameters = this.parseParameterList(child, content);
            }
            child = child.nextSibling;
        }

        if (returnTypeParts.length > 0) {
            returnType = returnTypeParts.join(' ');
        }

        if (!name) {
            // 尝试从function_declarator中提取
            let searchChild = node.firstChild;
            while (searchChild) {
                if (searchChild.type === 'function_declarator') {
                    let declChild = searchChild.firstChild;
                    while (declChild) {
                        if (declChild.type === 'identifier') {
                            name = declChild.text;
                            break;
                        }
                        declChild = declChild.nextSibling;
                    }
                }
                searchChild = searchChild.nextSibling;
            }
        }

        if (name) {
            return {
                name,
                returnType,
                parameters,
                isStatic,
                isExtern,
                location: {
                    filePath,
                    lineStart: node.startPosition.row + 1,
                    lineEnd: node.endPosition.row + 1,
                    columnStart: node.startPosition.column,
                    columnEnd: node.endPosition.column
                },
                body: node.text // 函数体
            };
        }

        return null;
    }

    /**
     * 解析参数列表
     */
    parseParameterList(node, content) {
        const params = [];

        let child = node.firstChild;
        while (child) {
            if (child.type === 'parameter_declaration') {
                const param = this.parseParameterDeclaration(child, content);
                if (param) {
                    params.push(param);
                }
            }
            child = child.nextSibling;
        }

        return params;
    }

    /**
     * 解析参数声明
     */
    parseParameterDeclaration(node, content) {
        let name = null;
        let type = 'unknown';
        let isPointer = false;

        let child = node.firstChild;
        let typeParts = [];

        while (child) {
            if (child.type === 'primitive_type' || child.type === 'type_identifier') {
                typeParts.push(child.text);
            } else if (child.type === 'pointer_declarator') {
                isPointer = true;
                let ptrChild = child.firstChild;
                while (ptrChild) {
                    if (ptrChild.type === 'identifier') {
                        name = ptrChild.text;
                    }
                    if (ptrChild.type === 'primitive_type' || ptrChild.type === 'type_identifier') {
                        typeParts.push(ptrChild.text);
                    }
                    ptrChild = ptrChild.nextSibling;
                }
            } else if (child.type === 'identifier') {
                name = child.text;
            }
            child = child.nextSibling;
        }

        if (typeParts.length > 0) {
            type = typeParts.join(' ');
        }

        if (!name) {
            // 尝试从最后一个子节点获取
            let lastChild = node.lastChild;
            while (lastChild) {
                if (lastChild.type === 'identifier') {
                    name = lastChild.text;
                    break;
                }
                lastChild = lastChild.previousSibling;
            }
        }

        return {
            name: name || `param_${params.length}`,
            type,
            isPointer
        };
    }

    /**
     * 解析宏定义节点
     */
    parseMacroNode(node, content) {
        let name = null;
        let value = null;
        let isFunctionLike = false;
        let parameters = [];

        let child = node.firstChild;
        let parts = [];

        while (child) {
            if (child.type === 'identifier') {
                if (!name) {
                    name = child.text;
                }
            } else if (child.type === 'preproc_arg') {
                value = child.text;
            } else if (child.type === 'parameter_list') {
                isFunctionLike = true;
                let paramChild = child.firstChild;
                while (paramChild) {
                    if (paramChild.type === 'identifier') {
                        parameters.push(paramChild.text);
                    }
                    paramChild = paramChild.nextSibling;
                }
            }
            parts.push(child.text);
            child = child.nextSibling;
        }

        if (name) {
            return {
                name,
                value: value || parts.slice(1).join(' '),
                isFunctionLike,
                parameters,
                location: {
                    lineStart: node.startPosition.row + 1,
                    lineEnd: node.endPosition.row + 1,
                    columnStart: node.startPosition.column,
                    columnEnd: node.endPosition.column
                }
            };
        }

        return null;
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

        let arraySizes = [];  // ← 改为数组，存储所有维度
        let bitFieldWidth = null;

        let child = node.firstChild;
        let typeParts = [];

        while (child) {
            if (child.type === 'type_identifier' || child.type === 'primitive_type') {
                typeParts.push(child.text);
            } else if (child.type === 'pointer_declarator') {
                isPointer = true;
                pointerDepth++;
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
                // 处理嵌套数组：递归提取所有维度
                this.collectArrayDimensions(child, arraySizes);
                let arrayChild = child.firstChild;
                while (arrayChild) {
                    if (arrayChild.type === 'field_identifier' || arrayChild.type === 'identifier') {
                        if (!fieldName) fieldName = arrayChild.text;
                    }
                    arrayChild = arrayChild.nextSibling;
                }
            } else if (child.type === 'field_identifier' || child.type === 'identifier') {
                if (!fieldName) {
                    fieldName = child.text;
                }
            } else if (child.type === 'bitfield_clause') {
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
            const finalTypeName = typeParts.join(' ') || 'unknown';
            let cleanFieldDefinition = this.buildCleanFieldDefinition(node);
            return {
                name: fieldName,
                definition: cleanFieldDefinition,  // ← 直接保存原始文本
                type: {
                    name: finalTypeName,
                    kind: this.isBuiltinType(finalTypeName) ? 'builtin' : 'struct',
                    isPointer,
                    pointerDepth,
                    isArray,
                    arraySizes,
                    arraySize: arraySizes.length > 0 ? arraySizes[0] : 0,
                    referencedType: finalTypeName,
                    needsResolution: !this.isBuiltinType(finalTypeName),
                    resolved: false,
                    definition: null
                },
                bitField: bitFieldWidth ? { width: bitFieldWidth } : null,
                offset: null
            };
        }

        return null;
    }

    /**
     * 构建更干净的原始定义
     */
    buildCleanFieldDefinition(node) {
        const parts = [];
        let child = node.firstChild;

        while (child) {
            // 跳过注释节点（如果有）
            if (child.type !== 'comment') {
                parts.push(child.text);
            }
            child = child.nextSibling;
        }

        // 用空格连接，并清理多余空格
        return parts.join(' ').replace(/\s+/g, ' ').trim();
    }

    /**
     * 递归收集多维数组的维度
     */
    collectArrayDimensions(node, sizes) {
        if (!node) return;

        // 检查当前节点是否是数组声明器
        if (node.type === 'array_declarator') {
            let child = node.firstChild;
            while (child) {
                if (child.type === 'number_literal') {
                    // 提取数组大小
                    sizes.push(parseInt(child.text));
                } else if (child.type === 'array_declarator') {
                    // 递归处理嵌套数组
                    this.collectArrayDimensions(child, sizes);
                }
                child = child.nextSibling;
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
                isBuiltin: true,
                definition: null
            };
        }

        if (context) {
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
            if (context.typedefs && context.typedefs.has(typeName)) {
                const typedef = context.typedefs.get(typeName);
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
     * 提取字符串字面量
     */
    extractStringLiteral(text) {
        const match = text.match(/["<]([^">]+)[">]/);
        return match ? match[1] : null;
    }

    /**
     * 判断是否为内置类型
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