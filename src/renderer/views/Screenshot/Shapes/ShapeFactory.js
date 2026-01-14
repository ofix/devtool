import Rect from "./Rect.js";
import Ellipse from "./Ellipse.js";
import Line from "./Line.js";
import Text from "./Text.js";
import IncrementNumber from "./IncrementNumber.js";

// 形状工厂类
export default class ShapeFactory {
  // 生成唯一ID
  static generateId() {
    return Date.now() + "_" + Math.random().toString(36).substr(2, 9);
  }

  static createShape(type, x, y, options = {}) {
    // 为每个形状添加唯一ID
    const shape = {
      id: ShapeFactory.generateId(),
      type,
      x,
      y,
      ...options,
    };

    switch (type) {
      case "rect":
        return new Rect(shape);
      case "ellipse":
        return new Ellipse(shape);
      case "line":
        return new Line(shape);
      case "text":
        return new Text(shape);
      case "incrementNumber":
        return new IncrementNumber(shape);
      case "arrow": // 补充箭头类型
        return new Line({ ...shape, isArrow: true });
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