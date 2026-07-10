/**
 * 字段类型枚举 - 完整版
 * 使用字符串实现，兼顾性能与可读性
 */
const FieldType = Object.freeze({
    //  基础类型 
    STRING: 'string',
    NUMBER: 'number',
    BOOLEAN: 'boolean',
    DATE: 'date',
    DATETIME: 'datetime',
    TIME: 'time',
    POINTER: 'pointer',
    REFERENCE: 'reference',
    UNION: 'union',

    //  复合类型 
    ARRAY: 'array',
    CLASS: 'class',
    JSON: 'json',

    //  特殊类型 
    HIDDEN_GROUP: 'hidden_group',
    HIDDEN_FIELD: 'hidden_field',

    /**
     * 判断是否为隐藏类型
     */
    isHidden(type) {
        return type === this.HIDDEN_GROUP ||
            type === this.HIDDEN_FIELD;
    },

    /**
     * 判断是否为基本类型（非复合）
     */
    isPrimitive(type) {
        return [
            this.STRING, this.NUMBER, this.BOOLEAN,
            this.DATE, this.DATETIME, this.TIME,
            this.POINTER, this.REFERENCE,this.UNION
        ].includes(type);
    },

    /**
     * 判断是否为复合类型
     */
    isComposite(type) {
        return [
            this.ARRAY, this.CLASS, this.JSON
        ].includes(type);
    },


    //  获取分类列表 
    getPrimitiveTypes() {
        return [
            this.STRING, this.NUMBER, this.BOOLEAN,
            this.DATE, this.DATETIME, this.TIME
        ];
    },

    getCompositeTypes() {
        return [this.ARRAY, this.CLASS, this.JSON];
    },

    getReferenceTypes() {
        return [this.REFERENCE, this.POINTER];
    },

    getHiddenTypes() {
        return [this.HIDDEN_GROUP, this.HIDDEN_FIELD];
    },

    getVisibleTypes() {
        return [
            this.STRING, this.NUMBER, this.BOOLEAN,
            this.DATE, this.DATETIME, this.TIME,
            this.ARRAY, this.CLASS, this.JSON,
            this.POINTER, this.REFERENCE, this.UNION,
        ];
    },

    /**
     * 获取所有类型
     */
    getAllTypes() {
        return [
            this.STRING, this.NUMBER, this.BOOLEAN,
            this.DATE, this.DATETIME, this.TIME,
            this.ARRAY, this.CLASS, this.JSON,
            this.HIDDEN_GROUP, this.HIDDEN_FIELD,
            this.REFERENCE, this.POINTER, this.UNION,
        ];
    },

    //  显示名称 
    zhName(type) {
        const map = {
            [this.STRING]: '文本',
            [this.NUMBER]: '数字',
            [this.BOOLEAN]: '布尔值',
            [this.DATE]: '日期',
            [this.DATETIME]: '日期时间',
            [this.TIME]: '时间',
            [this.ARRAY]: '数组',
            [this.CLASS]: '对象',
            [this.JSON]: 'JSON',
            [this.HIDDEN_GROUP]: '隐藏组',
            [this.HIDDEN_FIELD]: '隐藏字段',
            [this.POINTER]: '指针',
            [this.REFERENCE]: '引用',
            [this.UNION]:'联合',
        };
        return map[type] || type;
    },

    /**
     * 获取类型图标（用于UI）
     */
    name(type) {
        const map = {
            [this.STRING]: 'string',
            [this.NUMBER]: 'number',
            [this.BOOLEAN]: 'boolean',
            [this.DATE]: 'date',
            [this.DATETIME]: 'datetime',
            [this.TIME]: 'time',
            [this.ARRAY]: 'array',
            [this.CLASS]: 'object',
            [this.JSON]: 'json',
            [this.HIDDEN_GROUP]: 'hidden group',
            [this.HIDDEN_FIELD]: 'hidden field',
            [this.REFERENCE]: 'reference',
            [this.POINTER]: 'pointer',
            [this.UNION]:'union'
        };
        return map[type] || type;
    },

    /**
     * 获取类型的CSS颜色
     */
    getColor(type) {
        const map = {
            [this.STRING]: '#4A90D9',
            [this.NUMBER]: '#F5A623',
            [this.BOOLEAN]: '#7ED321',
            [this.DATE]: '#50E3C2',
            [this.DATETIME]: '#4A90D9',
            [this.TIME]: '#B8E986',
            [this.ARRAY]: '#9B9B9B',
            [this.CLASS]: '#F8E71C',
            [this.JSON]: '#E74C3C',
            [this.HIDDEN_GROUP]: '#BDC3C7',
            [this.HIDDEN_FIELD]: '#95A5A6',
            [this.POINTER]: '#95A5A6',
            [this.REFERENCE]: '#95A5A6'
        };
        return map[type] || '#7F8C8D';
    },

    /**
     * 检查是否为有效的枚举值
     */
    isValid(type) {
        return this.getAllTypes().includes(type);
    },

    /**
     * 检查类型是否匹配（支持数组）
     */
    isType(type, targetTypes) {
        if (!Array.isArray(targetTypes)) {
            targetTypes = [targetTypes];
        }
        return targetTypes.includes(type);
    },

    /**
     * 从字符串转换为枚举（用于反序列化）
     */
    fromString(str) {
        if (this.isValid(str)) {
            return str;
        }
        // 尝试通过显示名称反向查找
        const allTypes = this.getAllTypes();
        for (const type of allTypes) {
            if (this.name(type) === str) {
                return type;
            }
        }
        return null;
    },

    /**
     * 批量转换
     */
    fromStringArray(strs) {
        return strs.map(str => this.fromString(str)).filter(Boolean);
    },

    /**
     * 序列化为字符串（用于存储）
     */
    serialize(type) {
        return type; // 已经是字符串
    },

    /**
     * 反序列化
     */
    deserialize(str) {
        return this.isValid(str) ? str : null;
    }
});

export default FieldType;