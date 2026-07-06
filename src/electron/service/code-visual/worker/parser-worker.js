// parser/worker/parser-worker.js

import { parentPort } from 'worker_threads';
import { promises as fs } from 'fs';
import path from 'path';
import Parser from 'tree-sitter';
import C from '@tree-sitter/c';
import ASTTypes from '../../types/ast.js';

class WorkerParser {
    constructor() {
        this.parser = new Parser();
        this.parser.setLanguage(C);
        this.parsedCache = new Map();
    }

    /**
     * 解析文件
     */
    async parseFile(filePath, includePaths = []) {
        try {
            const startTime = Date.now();
            const content = await fs.readFile(filePath, 'utf-8');

            // 解析AST
            const tree = this.parser.parse(content);
            const rootNode = tree.rootNode;

            // 创建结果对象
            const result = ASTTypes.createParsedFileResult(
                filePath,
                this.getFileType(filePath)
            );

            // 提取includes
            result.includes = this.extractIncludes(rootNode, content, filePath, includePaths);

            // 提取结构体
            this.extractStructs(rootNode, content, filePath, result);

            // 提取typedef
            this.extractTypedefs(rootNode, content, result);

            // 提取枚举
            this.extractEnums(rootNode, content, result);

            // 提取宏
            this.extractMacros(rootNode, content, result);

            result.parseTime = Date.now() - startTime;

            return {
                success: true,
                filePath,
                data: result,
                content
            };
        } catch (error) {
            return {
                success: false,
                filePath,
                error: error.message,
                stack: error.stack
            };
        }
    }

    /**
     * 获取文件类型
     */
    getFileType(filePath) {
        const ext = path.extname(filePath);
        switch (ext) {
            case '.c': return 'c';
            case '.h': return 'h';
            case '.cpp': return 'cpp';
            case '.hpp': return 'hpp';
            default: return 'c';
        }
    }

    /**
     * 提取 include 语句
     */
    extractIncludes(rootNode, content, filePath, includePaths) {
        const includes = [];
        const query = `
      (preproc_include
        (string_literal) @include)
    `;

        const cursor = rootNode.walk();
        this.collectIncludesRecursive(cursor, content, includes, filePath, includePaths);

        return includes;
    }

    collectIncludesRecursive(cursor, content, includes, currentFile, includePaths) {
        const node = cursor.currentNode;

        // 检查当前节点是否是 include
        if (node.type === 'preproc_include') {
            const child = node.firstChild;
            if (child && child.type === 'string_literal') {
                const includePath = this.extractStringLiteral(child.text);
                if (includePath) {
                    const resolved = this.resolveIncludePath(includePath, currentFile, includePaths);
                    if (resolved) {
                        includes.push(resolved);
                    }
                }
            }
        }

        // 递归遍历子节点
        if (cursor.gotoFirstChild()) {
            do {
                this.collectIncludesRecursive(cursor, content, includes, currentFile, includePaths);
            } while (cursor.gotoNextSibling());
            cursor.gotoParent();
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
     * 解析 include 路径
     */
    resolveIncludePath(includePath, currentFile, includePaths) {
        // 尝试相对路径    
        if (includePath.startsWith('"')) {
            const relativePath = path.join(path.dirname(currentFile), includePath.replace(/"/g, ''));
            return relativePath;
        }

        // 尝试系统包含路径
        for (const includeDir of includePaths) {
            const fullPath = path.join(includeDir, includePath);
            // 这里不实际检查文件是否存在，让调用方处理
            return fullPath;
        }

        return null;
    }

    /**
     * 提取结构体定义
     */
    extractStructs(rootNode, content, filePath, result) {
        const query = `
      (struct_specifier
        name: (type_identifier) @name
        body: (field_declaration_list) @body)
    `;

        const cursor = rootNode.walk();
        this.collectStructsRecursive(cursor, content, filePath, result);
    }

    collectStructsRecursive(cursor, content, filePath, result) {
        const node = cursor.currentNode;

        if (node.type === 'struct_specifier') {
            this.parseStructNode(node, content, filePath, result);
        }

        if (cursor.gotoFirstChild()) {
            do {
                this.collectStructsRecursive(cursor, content, filePath, result);
            } while (cursor.gotoNextSibling());
            cursor.gotoParent();
        }
    }

    parseStructNode(node, content, filePath, result) {
        let name = 'anonymous';
        let fields = [];
        let lineStart = node.startPosition.row;
        let lineEnd = node.endPosition.row;

        // 获取名称
        let child = node.firstChild;
        while (child) {
            if (child.type === 'type_identifier') {
                name = child.text;
                break;
            }
            child = child.nextSibling;
        }

        // 获取字段
        if (node.type === 'struct_specifier') {
            // 查找字段列表
            child = node.firstChild;
            while (child) {
                if (child.type === 'field_declaration_list') {
                    fields = this.parseFieldList(child, content);
                    break;
                }
                child = child.nextSibling;
            }
        }

        const struct = ASTTypes.createStructDefinition(
            name,
            'struct',
            fields,
            filePath,
            { lineStart, lineEnd, isComplete: fields.length > 0 }
        );

        result.structs.set(name, struct);
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
        let typeKind = 'builtin';
        let isPointer = false;
        let pointerDepth = 0;

        // 解析类型和名称
        let child = node.firstChild;
        let typeParts = [];

        while (child) {
            if (child.type === 'type_identifier' || child.type === 'primitive_type') {
                typeParts.push(child.text);
            } else if (child.type === 'pointer_declarator') {
                isPointer = true;
                pointerDepth++;
                // 递归解析指针指向的类型
                let ptrChild = child.firstChild;
                while (ptrChild) {
                    if (ptrChild.type === 'field_identifier' || ptrChild.type === 'identifier') {
                        fieldName = ptrChild.text;
                    } else if (ptrChild.type === 'type_identifier' || ptrChild.type === 'primitive_type') {
                        typeParts.push(ptrChild.text);
                    }
                    ptrChild = ptrChild.nextSibling;
                }
            } else if (child.type === 'field_identifier' || child.type === 'identifier') {
                if (!fieldName) {
                    fieldName = child.text;
                }
            } else if (child.type === 'array_declarator') {
                // 数组支持
            }
            child = child.nextSibling;
        }

        // 构建类型信息
        const typeInfo = ASTTypes.createTypeInfo(
            typeParts.join(' '),
            typeKind,
            { isPointer, pointerDepth }
        );

        if (fieldName) {
            return ASTTypes.createStructField(fieldName, typeInfo);
        }

        return null;
    }

    /**
     * 提取 typedef
     */
    extractTypedefs(rootNode, content, result) {
        // 简化实现
        const cursor = rootNode.walk();
        this.collectTypedefsRecursive(cursor, content, result);
    }

    collectTypedefsRecursive(cursor, content, result) {
        const node = cursor.currentNode;

        if (node.type === 'preproc_typedef') {
            // 简单解析 typedef
            const text = node.text;
            const match = text.match(/typedef\s+(\S+)\s+(\S+)\s*;/);
            if (match) {
                const [, originalType, alias] = match;
                const typeInfo = ASTTypes.createTypeInfo(
                    alias,
                    'typedef',
                    { referencedType: originalType }
                );
                result.typedefs.set(alias, typeInfo);
            }
        }

        if (cursor.gotoFirstChild()) {
            do {
                this.collectTypedefsRecursive(cursor, content, result);
            } while (cursor.gotoNextSibling());
            cursor.gotoParent();
        }
    }

    /**
     * 提取枚举
     */
    extractEnums(rootNode, content, result) {
        // 简化实现
        const cursor = rootNode.walk();
        this.collectEnumsRecursive(cursor, content, result);
    }

    collectEnumsRecursive(cursor, content, result) {
        const node = cursor.currentNode;

        if (node.type === 'enum_specifier') {
            // 解析枚举
            let name = 'anonymous';
            const enumValues = [];

            let child = node.firstChild;
            while (child) {
                if (child.type === 'type_identifier') {
                    name = child.text;
                } else if (child.type === 'enumerator_list') {
                    // 解析枚举值
                    let enumChild = child.firstChild;
                    while (enumChild) {
                        if (enumChild.type === 'enumerator') {
                            const nameMatch = enumChild.text.match(/^\s*(\w+)/);
                            if (nameMatch) {
                                enumValues.push(nameMatch[1]);
                            }
                        }
                        enumChild = enumChild.nextSibling;
                    }
                }
                child = child.nextSibling;
            }

            result.enums.set(name, {
                name,
                values: enumValues,
                filePath: node.startPosition
            });
        }

        if (cursor.gotoFirstChild()) {
            do {
                this.collectEnumsRecursive(cursor, content, result);
            } while (cursor.gotoNextSibling());
            cursor.gotoParent();
        }
    }

    /**
     * 提取宏定义
     */
    extractMacros(rootNode, content, result) {
        const cursor = rootNode.walk();
        this.collectMacrosRecursive(cursor, content, result);
    }

    collectMacrosRecursive(cursor, content, result) {
        const node = cursor.currentNode;

        if (node.type === 'preproc_def') {
            const text = node.text;
            const match = text.match(/^#define\s+(\w+)\s+(.+)$/);
            if (match) {
                const [, name, value] = match;
                result.macros.set(name, value.trim());
            }
        }

        if (cursor.gotoFirstChild()) {
            do {
                this.collectMacrosRecursive(cursor, content, result);
            } while (cursor.gotoNextSibling());
            cursor.gotoParent();
        }
    }
}

// 创建解析器实例
const parser = new WorkerParser();

// 监听父进程消息
parentPort.on('message', async (message) => {
  if (message.type === 'parse') {
    const { task } = message;
    const result = await parser.parseFile(task.filePath, task.includePaths);
    parentPort.postMessage({
      taskId: task.id,
      ...result
    });
  }
});

console.log('Parser worker initialized');