// 图形基类（BaseShape.js）
class BaseShape {
    constructor(x, y) {
        this.id = Date.now() + Math.random().toString(36).substr(2, 9); // 唯一ID
        this.x = x; // 横坐标
        this.y = y; // 纵坐标
        this.width = 0; // 宽度
        this.height = 0; // 高度
        this.rotate = 0; // 旋转角度
        this.scale = 1; // 缩放比例
        this.opacity = 1; // 透明度
    }

    // 更新尺寸
    updateSize(startX, startY, endX, endY) {
        this.width = Math.abs(endX - startX);
        this.height = Math.abs(endY - startY);
        this.x = Math.min(startX, endX);
        this.y = Math.min(startY, endY);
    }

    // 旋转
    rotate(angle) {
        this.rotate = angle;
    }

    // 缩放
    scale(scale) {
        this.scale = scale;
    }

    // 绘制（子类实现）
    draw(ctx) {
        throw new Error('子类必须实现 draw 方法');
    }
}

export default BaseShape;