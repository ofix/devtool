/**
 * 二进制模板解析器（最终版+边界对齐+ES6导出）
 * 核心特性：
 * 1. 完整数值类型：u8/u16/u32/u64/i8/i16/i32/i64/float/double
 * 2. 多版本路由：自动识别文件版本并跳转对应结构
 * 3. 边界对齐：支持自然对齐/强制对齐/填充对齐
 * 4. 双向联动：16进制视图与结构视图精准对应
 * 5. ES6 Module 标准导出
 */

/**
 * 二进制模板解析器核心类
 */
export class BinaryTemplateParser {
    constructor(buffer) {
        this.buffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
        // 全局配置
        this.globalConfig = {
            sectorSize: 2048,
            defaultEncoding: 'ascii',
            littleEndian: false,
            defaultNumberType: 'u32',
            align: 4 // 默认4字节对齐
        };
        // 当前局部配置
        this.currentConfig = { ...this.globalConfig };

        // 模板解析结果
        this.structs = {};        // 结构定义
        this.uiConfigs = {};      // UI配置
        this.loopConfigs = {};    // 循环配置
        this.versionRules = {};   // 版本路由规则
        this.overrideRules = {};  // 局部覆盖规则
        this.alignRules = {};     // 对齐规则：{ StructName: [{ offset: 0, align: 4 }] }

        // 组件内置渲染规则
        this.componentRules = {
            tree: {
                fieldRules: {
                    filename: { type: 'nodeLabel', icon: 'auto' },
                    name: { type: 'nodeLabel', icon: 'auto' },
                    file_size: { type: 'nodeAttr', label: '大小' },
                    size: { type: 'nodeAttr', label: '大小' },
                    flags: { type: 'badge', type: 'fileType' },
                    record_time: { type: 'nodeAttr', label: '修改时间' },
                    default: { type: 'nodeText' }
                },
                childRules: { Directory: { type: 'treeNode' } }
            },
            table: {
                fieldRules: { default: { type: 'tableCell', colName: (f) => f.desc.cn } }
            },
            card: {
                fieldRules: {
                    volume_id: { type: 'cardTitle' },
                    name: { type: 'cardTitle' },
                    size: { type: 'cardHighlight', label: '总大小' },
                    default: { type: 'cardRow', label: (f) => f.desc.cn }
                }
            },
            text: { fieldRules: { default: { type: 'textLine' } } },
            hex: { fieldRules: { content: { type: 'hexView' }, default: { type: 'textLine' } } }
        };

        // 支持的字符串编码
        this.supportedEncodings = ['ascii', 'utf8', 'utf16be', 'utf16le', 'gbk', 'iso8859-1'];
        this.defaultSkipDesc = { en: 'Padding', cn: '填充字节' };

        // 数值类型配置
        this.numberTypes = {
            u8: { bits: 8, method: 'readUInt8', align: 1 },
            u16: { bits: 16, methods: { le: 'readUInt16LE', be: 'readUInt16BE' }, align: 2 },
            u32: { bits: 32, methods: { le: 'readUInt32LE', be: 'readUInt32BE' }, align: 4 },
            u64: { bits: 64, methods: { le: 'readBigUInt64LE', be: 'readBigUInt64BE' }, align: 8 },
            i8: { bits: 8, method: 'readInt8', align: 1 },
            i16: { bits: 16, methods: { le: 'readInt16LE', be: 'readInt16BE' }, align: 2 },
            i32: { bits: 32, methods: { le: 'readInt32LE', be: 'readInt32BE' }, align: 4 },
            i64: { bits: 64, methods: { le: 'readBigInt64LE', be: 'readBigInt64BE' }, align: 8 },
            float: { bits: 32, methods: { le: 'readFloatLE', be: 'readFloatBE' }, align: 4 },
            double: { bits: 64, methods: { le: 'readDoubleLE', be: 'readDoubleBE' }, align: 8 }
        };

        // UI组件适配器
        this.uiAdapter = new UIComponentAdapter(this.componentRules);
    }

    /**
     * 计算对齐后的偏移
     * @param {number} currentOffset 当前偏移
     * @param {number} alignBytes 对齐字节数
     * @returns {number} 对齐后的偏移
     */
    calculateAlignedOffset(currentOffset, alignBytes) {
        if (alignBytes <= 1) return currentOffset;
        const remainder = currentOffset % alignBytes;
        return remainder === 0 ? currentOffset : currentOffset + (alignBytes - remainder);
    }

    /**
     * 解析模板字符串（新增对齐规则解析）
     */
    parseTemplate(templateStr) {
        // 重置所有配置
        this.structs = {};
        this.uiConfigs = {};
        this.loopConfigs = {};
        this.versionRules = {};
        this.overrideRules = {};
        this.alignRules = {};
        this.currentConfig = { ...this.globalConfig };

        // 按行解析
        const lines = templateStr
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('//'));

        let currentStruct = null;
        let currentRootComponent = 'text';
        let inLoopBlock = false;
        let currentLoop = { condition: '', target: '' };
        let currentAlign = this.globalConfig.align; // 当前对齐字节数
        let fieldOffsetTracker = 0; // 字段偏移追踪器

        for (const line of lines) {
            // 1. 解析全局配置
            if (line.startsWith('#')) {
                // 对齐配置
                if (line.startsWith('#align')) {
                    const [_, align] = line.split(' ');
                    this.globalConfig.align = parseInt(align) || 4;
                    this.currentConfig.align = this.globalConfig.align;
                    currentAlign = this.currentConfig.align;
                    continue;
                }
                // 其他全局配置
                if (!line.startsWith('#override')) {
                    const [key, value] = line.replace('#', '').split('=');
                    if (key === 'little_endian') this.globalConfig.littleEndian = value === 'true';
                    if (key === 'sector_size') this.globalConfig.sectorSize = parseInt(value);
                    if (key === 'encoding') this.globalConfig.defaultEncoding = value;
                    this.currentConfig = { ...this.globalConfig };
                    continue;
                }
            }

            // 2. 解析局部覆盖配置
            if (line.startsWith('#override')) {
                if (!currentStruct) continue;
                const [_, keyValue] = line.split(' ');
                const [key, value] = keyValue.split('=');
                if (!this.overrideRules[currentStruct]) this.overrideRules[currentStruct] = {};

                let parsedValue = value;
                if (value === 'true' || value === 'false') parsedValue = value === 'true';
                else if (!isNaN(parseInt(value))) parsedValue = parseInt(value);

                this.overrideRules[currentStruct][key] = parsedValue;

                // 如果覆盖对齐配置
                if (key === 'align') {
                    this.currentConfig.align = parsedValue;
                    currentAlign = parsedValue;
                }
                continue;
            }

            // 3. 解析对齐指令
            if (line.startsWith('@align')) {
                if (!currentStruct) continue;
                const [_, align] = line.split(' ');
                currentAlign = parseInt(align) || this.currentConfig.align;

                // 记录对齐规则
                if (!this.alignRules[currentStruct]) this.alignRules[currentStruct] = [];
                this.alignRules[currentStruct].push({
                    offset: fieldOffsetTracker,
                    align: currentAlign
                });
                continue;
            }

            // 4. 解析显式填充指令
            if (line.startsWith('@pad')) {
                if (!currentStruct) continue;
                const [_, padSize] = line.split(' ');
                const size = parseInt(padSize) || 1;

                // 添加填充字段
                this.structs[currentStruct].fields.push({
                    name: `padding_${fieldOffsetTracker}`,
                    size: size,
                    type: 'padding',
                    desc: this.defaultSkipDesc,
                    isSkip: true,
                    isPadding: true,
                    lengthField: null,
                    numberType: null,
                    endian: this.currentConfig.littleEndian ? 'le' : 'be',
                    rawOffset: fieldOffsetTracker
                });

                // 更新偏移追踪器
                fieldOffsetTracker += size;
                continue;
            }

            // 5. 解析结构定义
            if (line.startsWith('/')) {
                if (inLoopBlock) {
                    inLoopBlock = false;
                    this.loopConfigs[currentStruct] = currentLoop;
                    currentLoop = { condition: '', target: '' };
                }

                fieldOffsetTracker = 0; // 重置偏移追踪器
                currentAlign = this.currentConfig.align; // 重置对齐

                const structMatch = line.match(/^\/([a-zA-Z0-9_]+)\[([a-zA-Z0-9_]+)\]$/);
                if (structMatch) {
                    currentStruct = structMatch[1];
                    currentRootComponent = structMatch[2];
                } else {
                    currentStruct = line.slice(1);
                    currentRootComponent = 'text';
                }

                this.structs[currentStruct] = { fields: [], rules: [] };
                this.uiConfigs[currentStruct] = { root: currentRootComponent };
                this.versionRules[currentStruct] = [];
                this.alignRules[currentStruct] = [];
                continue;
            }

            // 6. 解析版本路由规则
            if (line.startsWith('?')) {
                if (!currentStruct) continue;
                const [condition, target] = line.replace('?', '').split(': >');
                this.versionRules[currentStruct].push({
                    condition: condition.trim(),
                    target: target.trim()
                });
                continue;
            }

            // 7. 解析循环块
            if (line === '@loop') {
                inLoopBlock = true;
                continue;
            }
            if (line === '@endloop') {
                inLoopBlock = false;
                this.loopConfigs[currentStruct] = currentLoop;
                currentLoop = { condition: '', target: '' };
                continue;
            }
            if (inLoopBlock) {
                currentLoop.condition = line;
                continue;
            }

            // 8. 解析字段定义（核心：对齐计算）
            if (!currentStruct) continue;
            const parts = line.split(/\s+/);
            const size = parts[0];
            let typeAttr = parts[1] || '';
            const nameDescPart = parts.slice(2).join(' ').split(',');

            // 计算对齐后的偏移
            let fieldAlign = currentAlign;
            // 获取字段类型对应的自然对齐
            if (typeAttr.startsWith('.')) {
                const numType = typeAttr.replace('.', '').split('.')[0];
                if (this.numberTypes[numType]) {
                    fieldAlign = this.numberTypes[numType].align || fieldAlign;
                }
            }
            // 对齐当前偏移
            const alignedOffset = this.calculateAlignedOffset(fieldOffsetTracker, fieldAlign);

            // 如果有对齐间隙，自动添加填充字段
            if (alignedOffset > fieldOffsetTracker) {
                const padSize = alignedOffset - fieldOffsetTracker;
                this.structs[currentStruct].fields.push({
                    name: `padding_${fieldOffsetTracker}`,
                    size: padSize,
                    type: 'padding',
                    desc: this.defaultSkipDesc,
                    isSkip: true,
                    isPadding: true,
                    lengthField: null,
                    numberType: null,
                    endian: this.currentConfig.littleEndian ? 'le' : 'be',
                    rawOffset: fieldOffsetTracker
                });
                fieldOffsetTracker = alignedOffset;
            }

            // 解析字段类型
            let fieldType = 'unknown';
            let encoding = this.currentConfig.defaultEncoding;
            let lengthField = null;
            let isArray = false;
            let numberType = null;
            let endian = this.currentConfig.littleEndian ? 'le' : 'be';

            // 字符串类型
            if (typeAttr.startsWith('.str')) {
                fieldType = 'string';
                const strParts = typeAttr.split('.');

                if (strParts.length > 2 && this.supportedEncodings.includes(strParts[2].split(':')[0])) {
                    encoding = strParts[2].split(':')[0];
                }

                const lenMatch = typeAttr.match(/\.str(?:\.[a-z0-9]+)?:([a-zA-Z0-9_]+)/);
                if (lenMatch) lengthField = lenMatch[1];
            }
            // 数组类型
            else if (typeAttr.includes('[]')) {
                fieldType = 'array';
                isArray = true;
                const arrMatch = typeAttr.match(/\.u([0-9]+)\[]:([a-zA-Z0-9_]+)/);
                if (arrMatch) lengthField = arrMatch[2];
            }
            // 数值类型
            else if (typeAttr.startsWith('.')) {
                fieldType = 'number';
                const numParts = typeAttr.replace('.', '').split('.');

                if (this.numberTypes[numParts[0]]) numberType = numParts[0];

                if (numParts.length > 1 && ['le', 'be'].includes(numParts[1])) endian = numParts[1];
            }

            // 解析字段名和描述
            let fieldName = nameDescPart[0] || '';
            let nestedComponent = '';
            const uiMatch = fieldName.match(/(.+)\[([a-zA-Z0-9_]+)\]$/);
            if (uiMatch) {
                fieldName = uiMatch[1];
                nestedComponent = uiMatch[2];
                if (!this.uiConfigs[currentStruct].nestedFields) this.uiConfigs[currentStruct].nestedFields = {};
                this.uiConfigs[currentStruct].nestedFields[fieldName] = nestedComponent;
            }

            const desc = nameDescPart.length > 1
                ? { en: nameDescPart[1].split('|')[0] || fieldName, cn: nameDescPart[1].split('|')[1] || fieldName }
                : { en: fieldName, cn: fieldName };

            // 计算字段实际大小
            let fieldSize = size === '0' ? 0 : parseInt(size);
            if (fieldType === 'number' && numberType && this.numberTypes[numberType]) {
                fieldSize = this.numberTypes[numberType].bits / 8;
            }

            // 添加字段到结构
            this.structs[currentStruct].fields.push({
                name: fieldName,
                size: fieldSize,
                type: fieldType,
                encoding: encoding,
                desc: desc,
                isJudge: typeAttr.startsWith('?'),
                isPtr: typeAttr.includes('.ptr'),
                isString: fieldType === 'string',
                isSkip: false,
                isPadding: false,
                lengthField: lengthField,
                isArray: isArray,
                numberType: numberType,
                endian: endian,
                rawOffset: fieldOffsetTracker // 对齐后的实际偏移
            });

            // 更新偏移追踪器
            fieldOffsetTracker += fieldSize;
        }

        // 保存最后一个循环配置
        if (inLoopBlock && currentStruct) {
            this.loopConfigs[currentStruct] = currentLoop;
        }
    }

    /**
     * 解析指定结构（包含对齐计算）
     */
    parseStruct(structName, offset = 0) {
        if (!this.structs[structName]) return null;

        // 应用局部覆盖配置
        this.currentConfig = { ...this.globalConfig };
        if (this.overrideRules[structName]) {
            Object.keys(this.overrideRules[structName]).forEach(key => {
                this.currentConfig[key] = this.overrideRules[structName][key];
            });
        }

        const parsedData = new ParsedStructData(structName);
        parsedData.rawOffset = offset;
        parsedData.rawSize = 0;

        // 填充UI配置
        const uiConfig = this.uiConfigs[structName];
        const componentRule = this.componentRules[uiConfig.root] || this.componentRules.text;
        parsedData.uiConfig.rootComponent = uiConfig.root;
        parsedData.uiConfig.props = componentRule.props || {};
        parsedData.uiConfig.type = componentRule.type || 'default';

        // 存储已解析的字段值
        const fieldValues = {};
        const structDef = this.structs[structName];
        let currentOffset = offset;

        // 解析字段
        structDef.fields.forEach(fieldDef => {
            // 动态计算长度关联字段的实际大小
            let actualSize = fieldDef.size;
            if (fieldDef.lengthField && fieldValues[fieldDef.lengthField] !== undefined) {
                actualSize = parseInt(fieldValues[fieldDef.lengthField]);
            }

            // 解析字段值
            const fieldValue = this.parseFieldValue(fieldDef, currentOffset, actualSize);
            const fieldUIConfig = this.getFieldRenderConfig(structName, fieldDef.name);

            // 存储字段值
            fieldValues[fieldDef.name] = fieldValue;

            // 添加到解析结果
            parsedData.addField({
                name: fieldDef.name,
                value: fieldValue,
                desc: fieldDef.desc,
                type: fieldDef.type,
                isPadding: fieldDef.isPadding,
                offset: currentOffset,
                size: actualSize,
                uiComponent: fieldUIConfig.component,
                uiProps: fieldUIConfig.rule
            });

            // 更新偏移
            currentOffset += actualSize;
            parsedData.rawSize += actualSize;
        });

        // 执行版本路由规则
        if (this.versionRules[structName] && this.versionRules[structName].length > 0) {
            this.versionRules[structName].forEach(rule => {
                let condition = rule.condition;
                Object.keys(fieldValues).forEach(key => {
                    const value = fieldValues[key];
                    const valueStr = typeof value === 'bigint' ? value.toString() : value;
                    condition = condition.replace(new RegExp(`\\b${key}\\b`, 'g'), valueStr);
                });

                try {
                    if (eval(condition)) {
                        const childData = this.parseStruct(rule.target, currentOffset);
                        if (childData) {
                            parsedData.addChild(childData);
                            currentOffset += childData.rawSize;
                            parsedData.rawSize += childData.rawSize;
                        }
                    }
                } catch (e) {
                    console.warn(`版本路由规则执行失败: ${condition}`, e);
                }
            });
        }

        // 执行循环
        if (this.loopConfigs[structName]) {
            const loopConfig = this.loopConfigs[structName];
            if (loopConfig.condition && loopConfig.target) {
                const loopResults = this.executeLoop(structName, loopConfig, {
                    pos: currentOffset,
                    currentStructData: parsedData,
                    fieldValues: fieldValues
                });
                loopResults.forEach(child => {
                    parsedData.addChild(child);
                    currentOffset += child.rawSize;
                    parsedData.rawSize += child.rawSize;
                });
            }
        }

        return parsedData;
    }

    /**
     * 解析字段值
     */
    parseFieldValue(fieldDef, offset, actualSize) {
        if (fieldDef.isSkip || fieldDef.isPadding) return '<填充字节>';
        if (offset + actualSize > this.buffer.length) return '<超出范围>';
        if (actualSize <= 0) return '';

        // 字符串类型
        if (fieldDef.type === 'string') {
            try {
                return this.buffer.toString(fieldDef.encoding, offset, offset + actualSize)
                    .replace(/\0/g, '')
                    .trim();
            } catch (e) {
                return `[编码错误:${fieldDef.encoding}]`;
            }
        }

        // 数组/二进制类型
        if (fieldDef.type === 'array') {
            return this.buffer.slice(offset, offset + actualSize).toString('hex');
        }

        // 数值类型
        if (fieldDef.type === 'number') {
            return this.parseNumberField(fieldDef, offset);
        }

        // 默认类型
        return this.buffer.slice(offset, offset + actualSize).toString('hex');
    }

    /**
     * 解析数值字段
     */
    parseNumberField(fieldDef, offset) {
        const numType = fieldDef.numberType || this.currentConfig.defaultNumberType;
        const endian = fieldDef.endian;
        const typeConfig = this.numberTypes[numType];

        if (!typeConfig) {
            return this.buffer.slice(offset, offset + 4).toString('hex');
        }

        if (typeConfig.method) {
            return this.buffer[typeConfig.method](offset);
        }

        if (typeConfig.methods && typeConfig.methods[endian]) {
            const value = this.buffer[typeConfig.methods[endian]](offset);
            return (numType.includes('64') && !numType.includes('float')) ? value : Number(value);
        }

        return 0;
    }

    /**
     * 执行循环
     */
    executeLoop(structName, loopConfig, context) {
        const results = [];
        let count = 0;
        const sectorEnd = Math.floor(context.pos / this.currentConfig.sectorSize) * this.currentConfig.sectorSize + this.currentConfig.sectorSize;
        let currentOffset = context.pos;

        while (true) {
            const loopContext = {
                count,
                pos: currentOffset,
                sector_end: sectorEnd,
                ...context.fieldValues,
                ...this.extractFieldValues(context.currentStructData)
            };

            let condition = loopConfig.condition;
            Object.keys(loopContext).forEach(key => {
                const value = loopContext[key];
                const valueStr = typeof value === 'bigint' ? value.toString() : value;
                condition = condition.replace(new RegExp(`\\b${key}\\b`, 'g'), valueStr);
            });

            let continueLoop = false;
            try {
                continueLoop = eval(condition);
            } catch (e) {
                console.warn(`循环条件执行失败: ${condition}`, e);
                continueLoop = false;
            }

            if (!continueLoop || count > 10000) break;

            const childData = this.parseStruct(loopConfig.target, currentOffset);
            if (!childData) break;

            results.push(childData);
            currentOffset += childData.rawSize;
            count++;
        }

        return results;
    }

    /**
     * 获取字段渲染配置
     */
    getFieldRenderConfig(structName, fieldName) {
        const structUI = this.uiConfigs[structName] || { root: 'text', nestedFields: {} };
        const rootComponent = structUI.root;
        const componentRule = this.componentRules[rootComponent] || this.componentRules.text;

        if (structUI.nestedFields && structUI.nestedFields[fieldName]) {
            const nestedComp = structUI.nestedFields[fieldName];
            return {
                component: nestedComp,
                rule: this.componentRules[nestedComp]?.fieldRules?.default || { type: 'nodeText' }
            };
        }

        const fieldRule = componentRule.fieldRules[fieldName] || componentRule.fieldRules.default;
        return {
            component: rootComponent,
            rule: fieldRule
        };
    }

    /**
     * 提取字段值
     */
    extractFieldValues(structData) {
        if (!structData || !structData.fields) return {};
        const values = {};
        structData.fields.forEach(field => {
            values[field.name] = field.value;
        });
        return values;
    }

    /**
     * 适配为UI组件数据
     */
    adaptToUI(parsedData) {
        return this.uiAdapter.adapt(parsedData);
    }

    /**
     * 重置解析器配置
     */
    reset() {
        this.currentConfig = { ...this.globalConfig };
    }
}

/**
 * 解析后的数据结构（新增对齐相关字段）
 */
export class ParsedStructData {
    constructor(structName) {
        this.structName = structName;
        this.uiConfig = { rootComponent: '', props: {}, type: '' };
        this.fields = [];
        this.children = [];
        this.rawOffset = 0;
        this.rawSize = 0;
    }

    addField(fieldData) {
        this.fields.push(fieldData);
    }

    addChild(childStructData) {
        this.children.push(childStructData);
    }

    getFieldValue(fieldName) {
        const field = this.fields.find(f => f.name === fieldName);
        return field ? field.value : null;
    }

    getFieldMap() {
        const map = {};
        this.fields.forEach(field => {
            map[field.name] = {
                value: field.value,
                offset: field.offset,
                size: field.size,
                type: field.type,
                isPadding: field.isPadding
            };
        });
        return map;
    }
}

/**
 * UI组件适配器
 */
export class UIComponentAdapter {
    constructor(componentRules) {
        this.componentRules = componentRules;
        this.adapters = {
            tree: this.adaptTree.bind(this),
            table: this.adaptTable.bind(this),
            card: this.adaptCard.bind(this),
            text: this.adaptText.bind(this),
            hex: this.adaptHex.bind(this)
        };
    }

    adapt(parsedData) {
        const rootComponent = parsedData.uiConfig.rootComponent;
        const adapter = this.adapters[rootComponent] || this.adaptText;
        return adapter(parsedData);
    }

    adaptTree(parsedData) {
        const treeNode = {
            id: `${parsedData.structName}_${parsedData.rawOffset}`,
            label: parsedData.structName,
            props: {},
            children: [],
            type: parsedData.structName,
            rawData: parsedData
        };

        parsedData.fields.forEach(field => {
            if (field.uiProps.type === 'nodeLabel') {
                treeNode.label = field.value || treeNode.label;
            } else if (field.uiProps.type === 'nodeAttr') {
                treeNode.props[field.name] = field.value;
            } else {
                treeNode.props[field.name] = {
                    value: field.value,
                    offset: field.offset,
                    size: field.size,
                    isPadding: field.isPadding
                };
            }
        });

        parsedData.children.forEach(child => {
            treeNode.children.push(this.adaptTree(child));
        });

        return treeNode;
    }

    adaptTable(parsedData) {
        const tableData = {
            columns: [
                { key: 'name', title: '字段名' },
                { key: 'offset', title: '偏移(0x)' },
                { key: 'size', title: '长度(B)' },
                { key: 'type', title: '类型' },
                { key: 'value', title: '值' },
                { key: 'isPadding', title: '是否填充' }
            ],
            rows: [],
            children: []
        };

        parsedData.fields.forEach(field => {
            tableData.rows.push({
                name: field.name,
                offset: field.offset.toString(16).padStart(8, '0'),
                size: field.size,
                type: field.type,
                value: field.value,
                isPadding: field.isPadding ? '是' : '否'
            });
        });

        parsedData.children.forEach(child => {
            tableData.children.push(this.adaptTable(child));
        });

        return tableData;
    }

    adaptCard(parsedData) {
        const cardData = {
            title: parsedData.structName,
            highlight: {},
            rows: [],
            nested: {}
        };

        parsedData.fields.forEach(field => {
            if (field.uiProps.type === 'cardTitle') {
                cardData.title = field.value || cardData.title;
            } else if (field.uiProps.type === 'cardHighlight') {
                cardData.highlight[field.name] = {
                    value: field.value,
                    offset: field.offset,
                    size: field.size
                };
            } else {
                cardData.rows.push({
                    label: `${field.desc.cn} [0x${field.offset.toString(16)}:${field.size}B]`,
                    value: field.value,
                    isPadding: field.isPadding
                });
            }
        });

        parsedData.children.forEach(child => {
            cardData.nested[child.structName] = this.adaptCard(child);
        });

        return cardData;
    }

    adaptText(parsedData) {
        const textData = {
            lines: [],
            children: []
        };

        parsedData.fields.forEach(field => {
            textData.lines.push({
                label: `${field.name} [0x${field.offset.toString(16)}:${field.size}B]`,
                value: field.value,
                type: field.type,
                isPadding: field.isPadding
            });
        });

        parsedData.children.forEach(child => {
            textData.children.push(this.adaptText(child));
        });

        return textData;
    }

    adaptHex(parsedData) {
        const hexData = {
            hex: '',
            text: '',
            children: []
        };

        const contentField = parsedData.fields.find(f => f.name === 'content' || f.uiProps.type === 'hexView');
        if (contentField) {
            hexData.hex = contentField.value;
            hexData.text = Buffer.from(contentField.value, 'hex').toString('utf8');
        }

        parsedData.children.forEach(child => {
            hexData.children.push(this.adaptHex(child));
        });

        return hexData;
    }
}

// 可选：默认导出（方便整体导入）
export default {
    BinaryTemplateParser,
    ParsedStructData,
    UIComponentAdapter
};