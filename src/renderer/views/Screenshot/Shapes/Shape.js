export default class Shape {
    constructor(x, y) {
        this.id = Date.now() + Math.random().toString(36).substr(2, 9);
        this.x = x;
        this.y = y;
        this.width = 0;
        this.height = 0;
        this.rotate = 0; // 旋转角度（弧度）
        this.scale = 1;
        this.opacity = 1;
        this.selected = false;
        this.strokeStyle = '#00ff00';
        this.fillStyle = 'rgba(0, 255, 0, 0.1)';
        this.lineWidth = 2;
    }

    updateEndPos(endX, endY) {
        this.endX = endX;
        this.endY = endY;
        this.width = Math.abs(endX - this.x);
        this.height = Math.abs(endY - this.y);
        this.x = Math.min(this.x, endX);
        this.y = Math.min(this.y, endY);
    }

    setRotate(angle) {
        this.rotate = angle; // angle为弧度
    }

    setScale(scale) {
        this.scale = scale;
    }

    setOpacity(opacity) {
        this.opacity = Math.max(0, Math.min(1, opacity));
    }

    // 应用变换（旋转、缩放、透明度）
    applyTransform(ctx) {
        ctx.save();

        // 设置透明度
        ctx.globalAlpha = this.opacity;

        // 计算中心点
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;

        // 移动到中心点
        ctx.translate(centerX, centerY);

        // 旋转
        if (this.rotate !== 0) {
            ctx.rotate(this.rotate);
        }

        // 缩放
        if (this.scale !== 1) {
            ctx.scale(this.scale, this.scale);
        }

        // 移动回原位置
        ctx.translate(-centerX, -centerY);

        return ctx;
    }

    // 恢复变换
    restoreTransform(ctx) {
        ctx.restore();
    }

    draw(ctx) {
        throw new Error('子类必须实现 draw 方法');
    }

    containsPoint(x, y) {
        throw new Error('子类必须实现 containsPoint 方法');
    }

    toJSON() {
        return {
            type: this.constructor.name,
            id: this.id,
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height,
            rotate: this.rotate,
            scale: this.scale,
            opacity: this.opacity,
            strokeStyle: this.strokeStyle,
            fillStyle: this.fillStyle,
            lineWidth: this.lineWidth
        };
    }

    static fromJSON(json) {
        throw new Error('子类必须实现 fromJSON 方法');
    }
}
