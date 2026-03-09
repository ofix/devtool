/**
 * 二进制模板解析器（最终版）
 * 核心特性：
 * 1. 完整数值类型：u8/u16/u32/u64/i8/i16/i32/i64/float/double（支持大小端）
 * 2. 长度前缀字符串：.str:len / .str.utf8:len
 * 3. 多版本路由：?version == X: >Struct 自动跳转对应版本结构
 * 4. 局部配置覆盖：#override little_endian=true/sector_size=16384
 * 5. 多分支选择：@case 条件 >Struct 支持多版本分支
 * 6. UI组件映射：tree/table/card/text/hex
 * 7. 多条件循环：@loop 条件 && 条件 @endloop
 */
class BinaryTemplateParser {
    constructor(buffer) {
      this.buffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      // 全局配置（可被局部override覆盖）
      this.globalConfig = {
        sectorSize: 2048,
        defaultEncoding: 'ascii',
        littleEndian: false,
        defaultNumberType: 'u32'
      };
      // 当前局部配置（解析时动态更新）
      this.currentConfig = { ...this.globalConfig };
  
      // 模板解析结果
      this.structs = {};        // 结构定义：{ StructName: { fields: [], rules: [] } }
      this.uiConfigs = {};      // UI配置：{ StructName: { root: 'card' } }
      this.loopConfigs = {};    // 循环配置
      this.versionRules = {};   // 版本路由规则：{ StructName: [{ condition: '', target: '' }] }
      this.overrideRules = {};  // 局部覆盖规则：{ StructName: { key: value } }
  
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
      this.defaultSkipDesc = { en: 'Unknown', cn: '未知' };
  
      // 数值类型配置（位宽、解析方法）
      this.numberTypes = {
        // 无符号整数
        u8: { bits: 8, method: 'readUInt8' },
        u16: { bits: 16, methods: { le: 'readUInt16LE', be: 'readUInt16BE' } },
        u32: { bits: 32, methods: { le: 'readUInt32LE', be: 'readUInt32BE' } },
        u64: { bits: 64, methods: { le: 'readBigUInt64LE', be: 'readBigUInt64BE' } },
        // 有符号整数
        i8: { bits: 8, method: 'readInt8' },
        i16: { bits: 16, methods: { le: 'readInt16LE', be: 'readInt16BE' } },
        i32: { bits: 32, methods: { le: 'readInt32LE', be: 'readInt32BE' } },
        i64: { bits: 64, methods: { le: 'readBigInt64LE', be: 'readBigInt64BE' } },
        // 浮点数
        float: { bits: 32, methods: { le: 'readFloatLE', be: 'readFloatBE' } },
        double: { bits: 64, methods: { le: 'readDoubleLE', be: 'readDoubleBE' } }
      };
  
      // UI组件适配器
      this.uiAdapter = new UIComponentAdapter(this.componentRules);
    }
  
    /**
     * 解析模板字符串（核心：新增多版本路由+局部覆盖解析）
     * @param {string} templateStr 模板内容
     */
    parseTemplate(templateStr) {
      // 重置所有配置
      this.structs = {};
      this.uiConfigs = {};
      this.loopConfigs = {};
      this.versionRules = {};
      this.overrideRules = {};
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
      let parsedLengthFields = {};
  
      for (const line of lines) {
        // 1. 解析全局配置（#key=value）
        if (line.startsWith('#') && !line.startsWith('#override')) {
          const [key, value] = line.replace('#', '').split('=');
          if (key === 'little_endian') this.globalConfig.littleEndian = value === 'true';
          if (key === 'sector_size') this.globalConfig.sectorSize = parseInt(value);
          if (key === 'encoding') this.globalConfig.defaultEncoding = value;
          this.currentConfig = { ...this.globalConfig };
          continue;
        }
  
        // 2. 解析局部覆盖配置（#override key=value）
        if (line.startsWith('#override')) {
          if (!currentStruct) continue;
          const [_, keyValue] = line.split(' ');
          const [key, value] = keyValue.split('=');
          if (!this.overrideRules[currentStruct]) this.overrideRules[currentStruct] = {};
          
          // 转换值类型
          let parsedValue = value;
          if (value === 'true' || value === 'false') parsedValue = value === 'true';
          else if (!isNaN(parseInt(value))) parsedValue = parseInt(value);
          
          this.overrideRules[currentStruct][key] = parsedValue;
          continue;
        }
  
        // 3. 解析结构定义（/Struct[component]）
        if (line.startsWith('/')) {
          // 重置循环状态
          if (inLoopBlock) {
            inLoopBlock = false;
            this.loopConfigs[currentStruct] = currentLoop;
            currentLoop = { condition: '', target: '' };
          }
          parsedLengthFields = {};
  
          // 提取结构名和UI组件
          const structMatch = line.match(/^\/([a-zA-Z0-9_]+)\[([a-zA-Z0-9_]+)\]$/);
          if (structMatch) {
            currentStruct = structMatch[1];
            currentRootComponent = structMatch[2];
          } else {
            currentStruct = line.slice(1);
            currentRootComponent = 'text';
          }
  
          // 初始化结构
          this.structs[currentStruct] = { fields: [], rules: [] };
          this.uiConfigs[currentStruct] = { root: currentRootComponent };
          this.versionRules[currentStruct] = [];
          continue;
        }
  
        // 4. 解析版本路由规则（?condition: >Target）
        if (line.startsWith('?')) {
          if (!currentStruct) continue;
          const [condition, target] = line.replace('?', '').split(': >');
          this.versionRules[currentStruct].push({
            condition: condition.trim(),
            target: target.trim()
          });
          continue;
        }
  
        // 5. 解析多分支选择（@case condition: >Target）
        if (line.startsWith('@case')) {
          if (!currentStruct) continue;
          const [_, conditionTarget] = line.split(' ');
          const [condition, target] = conditionTarget.split(': >');
          this.versionRules[currentStruct].push({
            condition: condition.trim(),
            target: target.trim()
          });
          continue;
        }
  
        // 6. 解析循环块开始（@loop）
        if (line === '@loop') {
          inLoopBlock = true;
          continue;
        }
  
        // 7. 解析循环条件
        if (inLoopBlock && !line.startsWith('@endloop')) {
          currentLoop.condition = line;
          continue;
        }
  
        // 8. 解析循环块结束（@endloop）
        if (line === '@endloop') {
          inLoopBlock = false;
          this.loopConfigs[currentStruct] = currentLoop;
          currentLoop = { condition: '', target: '' };
          continue;
        }
  
        // 9. 解析字段定义（核心）
        if (!currentStruct) continue;
        const parts = line.split(/\s+/);
        const size = parts[0];
        let typeAttr = parts[1] || '';
        const nameDescPart = parts.slice(2).join(' ').split(',');
  
        // 9.1 解析skip字段
        if (typeAttr.startsWith('<skip')) {
          let skipDesc = this.defaultSkipDesc;
          const skipMatch = typeAttr.match(/<skip:([^|]+)\|([^>]+)>/);
          if (skipMatch) skipDesc = { en: skipMatch[1], cn: skipMatch[2] };
          
          this.structs[currentStruct].fields.push({
            name: `skip_${Math.random().toString(36).slice(2, 8)}`,
            size: parseInt(size),
            type: 'skip',
            desc: skipDesc,
            isSkip: true,
            lengthField: null,
            numberType: null,
            endian: this.currentConfig.littleEndian ? 'le' : 'be'
          });
          continue;
        }
  
        // 9.2 解析普通字段
        let fieldType = 'unknown';
        let encoding = this.currentConfig.defaultEncoding;
        let lengthField = null;
        let isArray = false;
        let numberType = null;
        let endian = this.currentConfig.littleEndian ? 'le' : 'be';
  
        // 字符串类型（支持长度关联）
        if (typeAttr.startsWith('.str')) {
          fieldType = 'string';
          const strParts = typeAttr.split('.');
          
          // 提取编码
          if (strParts.length > 2 && this.supportedEncodings.includes(strParts[2].split(':')[0])) {
            encoding = strParts[2].split(':')[0];
          }
          
          // 提取长度关联字段
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
          
          // 提取数值类型
          if (this.numberTypes[numParts[0]]) numberType = numParts[0];
          
          // 提取端序
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
  
        // 添加字段到结构
        this.structs[currentStruct].fields.push({
          name: fieldName,
          size: size === '0' ? 0 : parseInt(size),
          type: fieldType,
          encoding: encoding,
          desc: desc,
          isJudge: typeAttr.startsWith('?'),
          isPtr: typeAttr.includes('.ptr'),
          isString: fieldType === 'string',
          isSkip: false,
          lengthField: lengthField,
          isArray: isArray,
          numberType: numberType,
          endian: endian
        });
      }
  
      // 保存最后一个循环配置
      if (inLoopBlock && currentStruct) {
        this.loopConfigs[currentStruct] = currentLoop;
      }
    }
  
    /**
     * 解析指定结构（核心：新增版本路由+局部配置覆盖）
     * @param {string} structName 结构名
     * @param {number} offset 偏移量
     * @returns {ParsedStructData} 解析结果
     */
    parseStruct(structName, offset = 0) {
      // 检查结构是否存在
      if (!this.structs[structName]) return null;
      
      // 应用局部覆盖配置
      this.currentConfig = { ...this.globalConfig };
      if (this.overrideRules[structName]) {
        Object.keys(this.overrideRules[structName]).forEach(key => {
          this.currentConfig[key] = this.overrideRules[structName][key];
        });
      }
  
      // 初始化解析结果
      const parsedData = new ParsedStructData(structName);
      parsedData.rawOffset = offset;
      parsedData.rawSize = 0;
  
      // 填充UI配置
      const uiConfig = this.uiConfigs[structName];
      const componentRule = this.componentRules[uiConfig.root] || this.componentRules.text;
      parsedData.uiConfig.rootComponent = uiConfig.root;
      parsedData.uiConfig.props = componentRule.props || {};
      parsedData.uiConfig.type = componentRule.type || 'default';
  
      // 存储已解析的字段值（用于长度关联/版本判断）
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
        // 数值类型自动匹配位宽
        if (fieldDef.type === 'number' && fieldDef.numberType && this.numberTypes[fieldDef.numberType]) {
          actualSize = this.numberTypes[fieldDef.numberType].bits / 8;
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
          // 替换条件中的字段名为实际值
          let condition = rule.condition;
          Object.keys(fieldValues).forEach(key => {
            const value = fieldValues[key];
            const valueStr = typeof value === 'bigint' ? value.toString() : value;
            condition = condition.replace(new RegExp(`\\b${key}\\b`, 'g'), valueStr);
          });
  
          // 执行条件判断
          try {
            if (eval(condition)) {
              // 跳转到目标结构
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
     * 解析字段值（完善数值类型+边界检查）
     * @param {object} fieldDef 字段定义
     * @param {number} offset 偏移量
     * @param {number} actualSize 实际大小
     * @returns {any} 字段值
     */
    parseFieldValue(fieldDef, offset, actualSize) {
      // 边界检查
      if (fieldDef.isSkip) return '<跳过>';
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
  
      // 默认类型（二进制）
      return this.buffer.slice(offset, offset + actualSize).toString('hex');
    }
  
    /**
     * 解析数值字段（支持u8/u16/u32/u64/i8/i16/i32/i64/float/double）
     * @param {object} fieldDef 字段定义
     * @param {number} offset 偏移量
     * @returns {number|BigInt} 数值
     */
    parseNumberField(fieldDef, offset) {
      const numType = fieldDef.numberType || this.currentConfig.defaultNumberType;
      const endian = fieldDef.endian;
      const typeConfig = this.numberTypes[numType];
  
      if (!typeConfig) {
        return this.buffer.slice(offset, offset + 4).toString('hex');
      }
  
      // 无方法区分端序的类型（u8/i8）
      if (typeConfig.method) {
        return this.buffer[typeConfig.method](offset);
      }
  
      // 区分端序的类型（u16/u32/float/double）
      if (typeConfig.methods && typeConfig.methods[endian]) {
        const value = this.buffer[typeConfig.methods[endian]](offset);
        // 64位整数返回BigInt，其他返回原始值
        return (numType.includes('64') && !numType.includes('float')) ? value : Number(value);
      }
  
      return 0;
    }
  
    /**
     * 执行循环（支持多条件）
     * @param {string} structName 结构名
     * @param {object} loopConfig 循环配置
     * @param {object} context 上下文
     * @returns {ParsedStructData[]} 循环结果
     */
    executeLoop(structName, loopConfig, context) {
      const results = [];
      let count = 0;
      const sectorEnd = Math.floor(context.pos / this.currentConfig.sectorSize) * this.currentConfig.sectorSize + this.currentConfig.sectorSize;
      let currentOffset = context.pos;
  
      while (true) {
        // 构建循环上下文
        const loopContext = {
          count,
          pos: currentOffset,
          sector_end: sectorEnd,
          ...context.fieldValues,
          ...this.extractFieldValues(context.currentStructData)
        };
  
        // 替换条件中的变量
        let condition = loopConfig.condition;
        Object.keys(loopContext).forEach(key => {
          const value = loopContext[key];
          const valueStr = typeof value === 'bigint' ? value.toString() : value;
          condition = condition.replace(new RegExp(`\\b${key}\\b`, 'g'), valueStr);
        });
  
        // 执行条件判断
        let continueLoop = false;
        try {
          continueLoop = eval(condition);
        } catch (e) {
          console.warn(`循环条件执行失败: ${condition}`, e);
          continueLoop = false;
        }
  
        // 退出条件
        if (!continueLoop || count > 10000) break;
  
        // 解析循环目标结构
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
     * @param {string} structName 结构名
     * @param {string} fieldName 字段名
     * @returns {object} 渲染配置
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
     * @param {ParsedStructData} structData 结构数据
     * @returns {object} 字段值映射
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
     * @param {ParsedStructData} parsedData 解析数据
     * @returns {object} UI组件数据
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
   * 解析后的数据结构（带UI元信息）
   */
  class ParsedStructData {
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
  
    // 获取所有字段的键值对
    getFieldMap() {
      const map = {};
      this.fields.forEach(field => {
        map[field.name] = field.value;
      });
      return map;
    }
  }
  
  /**
   * UI组件适配器
   */
  class UIComponentAdapter {
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
  
      // 填充节点属性
      parsedData.fields.forEach(field => {
        if (field.uiProps.type === 'nodeLabel') {
          treeNode.label = field.value || treeNode.label;
        } else if (field.uiProps.type === 'nodeAttr') {
          treeNode.props[field.name] = field.value;
        } else {
          treeNode.props[field.name] = field.value;
        }
      });
  
      // 递归处理子节点
      parsedData.children.forEach(child => {
        treeNode.children.push(this.adaptTree(child));
      });
  
      return treeNode;
    }
  
    adaptTable(parsedData) {
      const tableData = {
        columns: [],
        rows: [],
        children: []
      };
  
      // 构建列定义
      parsedData.fields.forEach(field => {
        tableData.columns.push({
          key: field.name,
          title: field.desc.cn || field.name,
          dataIndex: field.name
        });
      });
  
      // 构建行数据
      const row = {};
      parsedData.fields.forEach(field => {
        row[field.name] = field.value;
      });
      tableData.rows.push(row);
  
      // 处理子表
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
  
      // 填充卡片内容
      parsedData.fields.forEach(field => {
        if (field.uiProps.type === 'cardTitle') {
          cardData.title = field.value || cardData.title;
        } else if (field.uiProps.type === 'cardHighlight') {
          cardData.highlight[field.name] = field.value;
        } else {
          cardData.rows.push({
            label: field.desc.cn || field.name,
            value: field.value
          });
        }
      });
  
      // 处理嵌套卡片
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
  
      // 构建文本行
      parsedData.fields.forEach(field => {
        textData.lines.push({
          label: field.desc.cn || field.name,
          value: field.value
        });
      });
  
      // 处理子文本
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
  
      // 查找内容字段
      const contentField = parsedData.fields.find(f => f.name === 'content' || f.uiProps.type === 'hexView');
      if (contentField) {
        hexData.hex = contentField.value;
        hexData.text = Buffer.from(contentField.value, 'hex').toString('utf8');
      }
  
      // 处理子十六进制数据
      parsedData.children.forEach(child => {
        hexData.children.push(this.adaptHex(child));
      });
  
      return hexData;
    }
  }
  
  // 导出模块（Node.js环境）
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      BinaryTemplateParser,
      ParsedStructData,
      UIComponentAdapter
    };
  }