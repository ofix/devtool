import Rect from "./Rect.js";
import Ellipse from "./Ellipse.js";
import Line from "./Line.js";
import Star from "./Star.js";
import Text from "./Text.js";
import IncrementNumber from "./IncrementNumber.js";

// 形状工厂类
export default class ShapeFactory {
    // 生成唯一ID
    static generateId() {
        return Date.now() + "_" + Math.random().toString(36).substring(2, 9);
    }

    static createShape(type, x, y, options = {}) {
        switch (type) {
            case "rect":
                return new Rect(x, y, options);
            case "ellipse":
                return new Ellipse(x, y, options);
            case "line":
                return new Line(x, y, options);
            case "text":
                return new Text(x, y, options);
            case "incrementNumber":
                return new IncrementNumber(x, y, options);
            case "arrow": // 补充箭头类型
                return new Line(x, y, { ...options, hasArrow: true });
            case "star":
                return new Star(x, y, options);
            default:
                throw new Error(`Unknown shape type: ${type}`);
        }
    }

    static fromJSON(json) {
        switch (json.type) {
            case "rect":
                return Rect.fromJSON(json);
            case "ellipse":
                return Ellipse.fromJSON(json);
            case "line":
                return Line.fromJSON(json);
            case "text":
                return Text.fromJSON(json);
            case "incrementNumber":
                return IncrementNumber.fromJSON(json);
            default:
                throw new Error(`Unknown shape type: ${json.type}`);
        }
    }
}