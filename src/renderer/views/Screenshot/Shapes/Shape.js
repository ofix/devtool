import Matrix from './Matrix.js'; // 新增
// Shape.js
export default class Shape {
    constructor(x, y) {
        this.id = Date.now() + Math.random().toString(36).substr(2, 9);
        this.x = x;
        this.y = y;
        this.width = 0;
        this.height = 0;
        // 🟩 新增：使用 Matrix 替代单独的 rotate/scale
        this.transform = new Matrix(); // 新增
        this.transform.identity(); // 新增
        // 🟥 删除：this.rotate = 0;
        // 🟥 删除：this.scale = 1;
        this.opacity = 1;
        this.selected = false;
        this.strokeStyle = '#00ff00';
        this.fillStyle = 'rgba(0, 255, 0, 0.1)';
        this.lineWidth = 2;
        // 🟩 新增：组ID，用于框选多个图形
        this.groupId = null; // 新增
    }

    updateEndPos(endX, endY) {
        this.endX = endX;
        this.endY = endY;
        this.width = Math.abs(endX - this.x);
        this.height = Math.abs(endY - this.y);
        this.x = Math.min(this.x, endX);
        this.y = Math.min(this.y, endY);
    }

    // 🟩 新增：设置旋转角度（使用矩阵）
    setRotate(angle) {
        // 获取当前中心点
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        
        // 平移到原点，旋转，再平移回来
        this.transform.identity()
            .translate(centerX, centerY)
            .rotate(angle)
            .translate(-centerX, -centerY);
    }

    // 🟩 新增：设置缩放（使用矩阵）
    setScale(scale) {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        
        this.transform.identity()
            .translate(centerX, centerY)
            .scale(scale)
            .translate(-centerX, -centerY);
    }

    setOpacity(opacity) {
        this.opacity = Math.max(0, Math.min(1, opacity));
    }

    // 应用变换（使用矩阵）
    applyTransform(ctx) {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        
        // 应用变换矩阵
        const [a, b, c, d, e, f] = this.transform.matrix;
        ctx.transform(a, b, c, d, e, f);
        
        return ctx;
    }

    restoreTransform(ctx) {
        ctx.restore();
    }

    // 平移图形
    translate(dx, dy) {
        this.transform.translate(dx, dy);
        
        // 更新 x,y 坐标（用于边界框）
        const [a, b, c, d, e, f] = this.transform.matrix;
        this.x = e;
        this.y = f;
    }

    // 获取变换后的边界框
    getBoundingBox() {
        const corners = [
            { x: this.x, y: this.y },
            { x: this.x + this.width, y: this.y },
            { x: this.x + this.width, y: this.y + this.height },
            { x: this.x, y: this.y + this.height }
        ];
        
        const transformed = corners.map(p => this.transform.transformPoint(p.x, p.y));
        
        const minX = Math.min(...transformed.map(p => p.x));
        const minY = Math.min(...transformed.map(p => p.y));
        const maxX = Math.max(...transformed.map(p => p.x));
        const maxY = Math.max(...transformed.map(p => p.y));
        
        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    draw(ctx) {
        throw new Error('子类必须实现 draw 方法');
    }

    containsPoint(x, y) {
        throw new Error('子类必须实现 containsPoint 方法');
    }

    // toJSON 使用矩阵
    toJSON() {
        return {
            type: this.constructor.name,
            id: this.id,
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height,
            transform: this.transform.matrix, // 新增
            opacity: this.opacity,
            strokeStyle: this.strokeStyle,
            fillStyle: this.fillStyle,
            lineWidth: this.lineWidth,
            groupId: this.groupId // 新增
        };
    }

    static fromJSON(json) {
        throw new Error('子类必须实现 fromJSON 方法');
    }
}