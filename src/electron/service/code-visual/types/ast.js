// types/ast.js

/**
 * @typedef {Object} TypeInfo
 * @property {string} name - 类型名称
 * @property {'builtin'|'struct'|'union'|'enum'|'typedef'|'pointer'|'array'} kind
 * @property {boolean} [isConst]
 * @property {boolean} [isPointer]
 * @property {number} [pointerDepth] - 指针层级
 * @property {number|null} [arraySize] - 数组大小
 * @property {string} [referencedType] - 指向的类型名称
 * @property {boolean} [resolved] - 是否已解析
 */

/**
 * @typedef {Object} StructField
 * @property {string} name
 * @property {TypeInfo} type
 * @property {number} [offset]
 * @property {Object} [bitField]
 * @property {number} bitField.width
 * @property {number} [bitField.startBit]
 * @property {string} [documentation]
 */

/**
 * @typedef {Object} StructDefinition
 * @property {string} name
 * @property {'struct'|'union'} kind
 * @property {StructField[]} fields
 * @property {number} [size]
 * @property {number} [alignment]
 * @property {string} filePath
 * @property {number} lineStart
 * @property {number} lineEnd
 * @property {Set<string>} dependencies
 * @property {boolean} isComplete
 * @property {boolean} [isForwardDeclared]
 * @property {string[]} [attributes]
 */

/**
 * @typedef {Object} ParsedFileResult
 * @property {string} filePath
 * @property {'c'|'h'|'cpp'|'hpp'} fileType
 * @property {string[]} includes
 * @property {Map<string, StructDefinition>} structs
 * @property {Map<string, StructDefinition>} unions
 * @property {Map<string, TypeInfo>} typedefs
 * @property {Map<string, any>} globals
 * @property {Map<string, any>} enums
 * @property {Map<string, string>} macros
 * @property {number} parseTime
 * @property {string[]} errors
 */

/**
 * @typedef {Object} CacheEntry
 * @property {ParsedFileResult} result
 * @property {number} timestamp
 * @property {string} fileHash
 * @property {Set<string>} dependencies
 */

/**
 * @typedef {Object} DependencyNode
 * @property {string} filePath
 * @property {Set<string>} dependencies
 * @property {Set<string>} dependents
 * @property {'idle'|'parsing'|'resolved'|'error'} status
 * @property {string} [error]
 * @property {string[]} structs
 */

/**
 * @typedef {Object} DependencyGraph
 * @property {Map<string, DependencyNode>} nodes
 * @property {string[][]} cycles
 * @property {string[]} topologicalOrder
 */

export class ASTTypes {
    static get builtinTypes() {
        return new Set([
            'void', 'char', 'short', 'int', 'long', 'float', 'double',
            'signed', 'unsigned', 'bool', 'size_t', 'ptrdiff_t',
            'int8_t', 'int16_t', 'int32_t', 'int64_t',
            'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t'
        ]);
    }

    static isBuiltin(typeName) {
        return this.builtinTypes.has(typeName);
    }

    static createTypeInfo(name, kind = 'builtin', options = {}) {
        return {
            name,
            kind,
            isConst: options.isConst || false,
            isPointer: options.isPointer || false,
            pointerDepth: options.pointerDepth || 0,
            arraySize: options.arraySize || null,
            referencedType: options.referencedType || null,
            resolved: options.resolved || false,
            ...options
        };
    }

    static createStructField(name, type, options = {}) {
        return {
            name,
            type,
            offset: options.offset || null,
            bitField: options.bitField || null,
            documentation: options.documentation || null
        };
    }

    static createStructDefinition(name, kind, fields, filePath, options = {}) {
        return {
            name,
            kind: kind || 'struct',
            fields: fields || [],
            size: options.size || null,
            alignment: options.alignment || null,
            filePath,
            lineStart: options.lineStart || 0,
            lineEnd: options.lineEnd || 0,
            dependencies: new Set(),
            isComplete: options.isComplete || false,
            isForwardDeclared: options.isForwardDeclared || false,
            attributes: options.attributes || []
        };
    }

    static createParsedFileResult(filePath, fileType) {
        return {
            filePath,
            fileType: fileType || 'c',
            includes: [],
            structs: new Map(),
            unions: new Map(),
            typedefs: new Map(),
            globals: new Map(),
            enums: new Map(),
            macros: new Map(),
            parseTime: 0,
            errors: []
        };
    }

    /**
     * 解析上下文 - 用于依赖解析
     */
    static createParseContext(filePath, options = {}) {
        return {
            filePath,
            includePaths: options.includePaths || [],
            processedFiles: new Set(), // 防止循环依赖
            maxDepth: options.maxDepth || 10,
            currentDepth: 0,
            parsedResults: new Map(), // filePath -> ParsedFileResult
            unresolvedIncludes: [], // 无法解析的 include
            errors: []
        };
    }

    /**
     * 完整的类型定义（包含依赖）
     */
    static createFullTypeDefinition(typeName, kind, filePath) {
        return {
            name: typeName,
            kind: kind || 'struct', // struct | class | interface | union
            filePath,
            fields: [],
            methods: [], // 仅 class
            baseTypes: [], // 继承/实现的类型
            dependencies: new Set(), // 依赖的类型名
            isComplete: false,
            isResolved: false,
            sourceFiles: new Set(), // 定义所在的文件（包括依赖）
            lineStart: 0,
            lineEnd: 0
        };
    }

    /**
     * 声明位置信息
     */
    static createLocation(filePath, lineStart, lineEnd, columnStart = 0, columnEnd = 0) {
        return {
            filePath,
            lineStart,
            lineEnd,
            columnStart,
            columnEnd,
            // 文件内容的哈希，用于检测文件变化
            fileHash: null
        };
    }

    /**
     * 结构体定义（增强版）
     */
    static createStructDefinition(name, kind, fields, location, options = {}) {
        return {
            name,
            kind: kind || 'struct',
            fields: fields || [],
            // 主要定义位置（完整定义的位置）
            location: location || null,
            // 所有声明位置（包括前向声明）
            declarations: new Map(), // filePath -> { location, isForward, isDefinition }
            // 如果是从依赖合并来的，记录来源
            sourceFiles: new Set(),
            // 是否是完整定义（有字段列表）
            isComplete: options.isComplete || false,
            // 是否只是前向声明
            isForwardDeclaration: options.isForwardDeclaration || false,
            // 依赖的类型
            dependencies: new Set(),
            // 元数据
            size: options.size || null,
            alignment: options.alignment || null,
            attributes: options.attributes || [],
            // 解析状态
            isResolved: options.isResolved || false
        };
    }

    /**
     * 类定义（增强版）
     */
    static createClassDefinition(name, location, options = {}) {
        return {
            name,
            kind: 'class',
            location: location || null,
            declarations: new Map(),
            sourceFiles: new Set(),
            fields: options.fields || [],
            methods: options.methods || [],
            baseClasses: options.baseClasses || [],
            modifiers: options.modifiers || [],
            typeParameters: options.typeParameters || [],
            isComplete: options.isComplete || false,
            isResolved: options.isResolved || false,
            dependencies: new Set()
        };
    }

    /**
     * 解析上下文（增强版）
     */
    static createParseContext(filePath, options = {}) {
        return {
            filePath,
            includePaths: options.includePaths || [],
            processedFiles: new Set(),
            processingStack: [], // 当前解析栈，用于循环检测
            maxDepth: options.maxDepth || 10,
            currentDepth: 0,
            // 存储所有解析结果
            parsedResults: new Map(), // filePath -> ParsedFileResult
            // 存储所有类型定义（全局索引）
            typeDefinitions: new Map(), // typeName -> StructDefinition
            // 类型声明位置索引
            typeLocations: new Map(), // typeName -> [Location]
            unresolvedIncludes: [],
            errors: []
        };
    }
}

export default ASTTypes;