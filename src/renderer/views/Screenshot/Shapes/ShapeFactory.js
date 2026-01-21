import Rect from "./Rect.js";
import Ellipse from "./Ellipse.js";
import Line from "./Line.js";
import Star from "./Star.js";
import Text from "./Text.js";
import IncrementNumber from "./IncrementNumber.js";
import Pencil from "./Pencil.js";
import Mosaic from "./Mosaic.js";
import Hilighter from "./Hilighter.js";
import Eraser from "./Eraser.js";
import GaussianBlur from "./GaussianBlur.js";

/**
 * 形状类型枚举（数字型枚举，替代魔法数字）
 * @readonly
 * @enum {number} // 修正注释：类型为数字
 */
export const ShapeType = Object.freeze({
    NONE: 0,          // 无操作
    SELECT: 1,        // 选择工具（无对应形状类）
    // 基础形状
    RECT: 2,
    ELLIPSE: 3,
    LINE: 4,
    ARROW: 5,         // 箭头（基于Line扩展）
    STAR: 6,
    // 文本/数字
    TEXT: 7,
    NUMBER: 8,        // 数字计数器
    // 绘制工具
    PENCIL: 9,
    HIGHLIGHTER: 10,  // 荧光笔
    ERASER: 11,
    MOSAIC: 12,
    GAUSSIAN_BLUR: 13
});

// 补充：数字枚举 ↔ 字符串的映射（兼容JSON反序列化）
const SHAPE_TYPE_STRING_MAP = {
    2: "rect",
    3: "ellipse",
    4: "line",
    5: "arrow",
    6: "star",
    7: "text",
    8: "number",
    9: "pencil",
    10: "hilighter",
    11: "eraser",
    12: "mosaic",
    13: "gaussian_blur",
    // 反向映射（字符串→数字）
    rect: 2,
    ellipse: 3,
    line: 4,
    arrow: 5,
    star: 6,
    text: 7,
    incrementNumber: 8,
    pencil: 9,
    hilighter: 10,
    eraser: 11,
    mosaic: 12,
    gaussian_blur: 13
};

// 形状类映射表（创建实例用，数字键）
const SHAPE_CLASS_MAP = {
    [ShapeType.RECT]: Rect,
    [ShapeType.ELLIPSE]: Ellipse,
    [ShapeType.LINE]: Line,
    [ShapeType.ARROW]: Line, // 箭头复用Line类
    [ShapeType.STAR]: Star,
    [ShapeType.TEXT]: Text,
    [ShapeType.NUMBER]: IncrementNumber,
    [ShapeType.PENCIL]: Pencil,
    [ShapeType.HIGHLIGHTER]: Hilighter,
    [ShapeType.ERASER]: Eraser,
    [ShapeType.MOSAIC]: Mosaic,
    [ShapeType.GAUSSIAN_BLUR]: GaussianBlur
};

/**
 * 形状工厂类 - 统一创建和反序列化各种形状实例
 * @class ShapeFactory
 */
export default class ShapeFactory {
    /**
     * 生成唯一ID（优化版：时间戳+随机数+8位字符，降低冲突概率）
     * @static
     * @returns {string} 唯一ID
     */
    static generateId() {
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).slice(-8);
        const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
        return `${timestamp}_${randomStr}_${randomNum}`;
    }

    /**
     * 创建形状实例
     * @static
     * @param {ShapeType} type - 形状类型（数字型枚举）
     * @param {number} x - 起始X坐标
     * @param {number} y - 起始Y坐标
     * @param {Object} [options={}] - 形状配置项
     * @returns {Object} 形状实例
     * @throws {Error} 无效类型/无对应类时抛出错误
     */
    static createShape(type, x, y, options = {}) {
        // 校验类型：必须是ShapeType中的有效数字
        if (typeof type !== "number" || !Object.values(ShapeType).includes(type)) {
            throw new Error(`Invalid shape type: ${type}. Valid types: ${Object.values(ShapeType).join(", ")}`);
        }
        // 校验坐标
        if (typeof x !== "number" || typeof y !== "number") {
            throw new Error("X and Y coordinates must be numbers");
        }
        // 排除无对应类的类型（NONE/SELECT）
        if (type === ShapeType.NONE || type === ShapeType.SELECT) {
            throw new Error(`Shape type ${type} (${Object.keys(ShapeType).find(k => ShapeType[k] === type)}) has no corresponding class`);
        }

        // 获取形状类
        const ShapeClass = SHAPE_CLASS_MAP[type];
        if (!ShapeClass) {
            throw new Error(`Unknown shape type for creation: ${type}`);
        }

        // 特殊处理箭头
        const finalOptions = type === ShapeType.ARROW
            ? { ...options, hasArrow: true }
            : { ...options };

        // 自动补全ID
        if (!finalOptions.id) {
            finalOptions.id = this.generateId();
        }

        return new ShapeClass(x, y, finalOptions);
    }

    /**
     * 从JSON数据反序列化形状实例
     * @static
     * @param {Object} json - 形状的JSON数据（type可为字符串/数字）
     * @returns {Object} 形状实例
     * @throws {Error} JSON格式错误/不支持的类型时抛出错误
     */
    static fromJSON(json) {
        if (!json || typeof json !== "object" || !json.type) {
            throw new Error("Invalid JSON: must be an object with a 'type' field");
        }

        // 统一将type转为数字枚举（兼容字符串/数字输入）
        let typeNum;
        if (typeof json.type === "string") {
            typeNum = SHAPE_TYPE_STRING_MAP[json.type];
        } else if (typeof json.type === "number") {
            typeNum = json.type;
        } else {
            throw new Error(`Invalid type format in JSON: ${json.type} (must be string/number)`);
        }

        // 校验类型有效性
        const ShapeClass = SHAPE_CLASS_MAP[typeNum];
        if (!ShapeClass || typeof ShapeClass.fromJSON !== "function") {
            throw new Error(`Unsupported shape type for deserialization: ${json.type} (mapped to ${typeNum})`);
        }

        return ShapeClass.fromJSON(json);
    }

    /**
     * 辅助方法：获取所有支持创建的形状类型（排除NONE/SELECT）
     * @static
     * @returns {number[]} 支持的数字枚举数组
     */
    static getSupportedTypes() {
        return Object.values(ShapeType).filter(type =>
            type !== ShapeType.NONE && type !== ShapeType.SELECT
        );
    }

    /**
     * 辅助方法：将数字枚举转为字符串（用于JSON序列化）
     * @static
     * @param {ShapeType} type - 数字枚举
     * @returns {string|null} 对应的字符串，无则返回null
     */
    static typeToStr(type) {
        return SHAPE_TYPE_STRING_MAP[type] || "";
    }

    /**
     * 辅助方法：将字符串转为数字枚举（用于JSON反序列化）
     * @static
     * @param {string} str - 形状字符串（如"rect"）
     * @returns {ShapeType|null} 对应的数字枚举，无则返回null
     */
    static strToType(str) {
        return SHAPE_TYPE_STRING_MAP[str] || null;
    }
}