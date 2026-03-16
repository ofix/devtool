// Rect.js
import Shape from "./Shape.js";
import Matrix from "./Matrix.js"; // 新增

export default class Rect extends Shape {
    constructor(x, y, options = {}) {
        super(x, y);
        this.type = 'rect';
        this.strokeStyle = options.strokeStyle || '#00ff00';
        this.fillStyle = options.fillStyle || 'transparent';
        this.lineWidth = options.lineWidth || 2;
        this.dashed = options.dashed || false;
        this.cornerRadius = options.cornerRadius || 0;
        this.backgroundColor = options.backgroundColor || this.fillStyle;
        this.foregroundColor = options.foregroundColor || '#ffffff';
        
        if (options.transform) {
            this.transform = new Matrix();
            this.transform.matrix = [...options.transform];
        }
    }

    draw(ctx) {
        // 应用变换矩阵
        const transformedCtx = this.applyTransform(ctx);
        
        // 绘制背景
        if (this.backgroundColor && this.backgroundColor !== 'transparent') {
            transformedCtx.fillStyle = this.selected ? 
                this.applyAlpha('#ff0000', 0.3) : this.backgroundColor;
            
            if (this.cornerRadius > 0) {
                this.drawRoundedRect(transformedCtx, 0, 0, this.width, this.height, 
                    this.cornerRadius, true);
            } else {
                transformedCtx.fillRect(0, 0, this.width, this.height);
            }
        }
        
        // 绘制边框
        transformedCtx.strokeStyle = this.selected ? '#ff0000' : this.strokeStyle;
        transformedCtx.lineWidth = this.lineWidth;
        
        if (this.dashed) {
            transformedCtx.setLineDash([5, 5]);
        } else {
            transformedCtx.setLineDash([]);
        }
        
        if (this.cornerRadius > 0) {
            this.drawRoundedRect(transformedCtx, 0, 0, this.width, this.height, 
                this.cornerRadius, false);
        } else {
            transformedCtx.strokeRect(0, 0, this.width, this.height);
        }
        
        // 绘制旋转中心点
        if (this.selected) {
            this.drawRotationHandle(transformedCtx);
        }
        
        this.restoreTransform(transformedCtx);
    }

    drawRoundedRect(ctx, x, y, width, height, radius, fill = false) {
        const r = Math.min(radius, Math.min(width, height) / 2);
        
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + width - r, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + r);
        ctx.lineTo(x + width, y + height - r);
        ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
        ctx.lineTo(x + r, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        
        if (fill) {
            ctx.fill();
        } else {
            ctx.stroke();
        }
    }

    drawRotationHandle(ctx) {
        // 🟩 修改：使用变换后的坐标
        const bbox = this.getBoundingBox();
        const centerX = bbox.x + bbox.width / 2;
        const centerY = bbox.y - 20;
        
        ctx.save();
        ctx.fillStyle = '#ff0000';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(centerX, bbox.y);
        ctx.lineTo(centerX, centerY);
        ctx.strokeStyle = '#ff0000';
        ctx.stroke();
        
        ctx.restore();
    }

    // 🟩 修改：点检测考虑矩阵变换
    containsPoint(x, y) {
        // 将世界坐标转换到局部坐标
        const invTransform = this.transform.getInverse();
        const local = invTransform.transformPoint(x, y);
        
        return local.x >= 0 && local.x <= this.width &&
               local.y >= 0 && local.y <= this.height;
    }

    // 🟩 新增：获取边界框
    getBoundingBox() {
        return super.getBoundingBox();
    }

    // 🟩 修改：平移
    translate(dx, dy) {
        super.translate(dx, dy);
    }

    static fromJSON(json) {
        const rect = new Rect(json.x, json.y, {
            strokeStyle: json.strokeStyle,
            fillStyle: json.fillStyle,
            backgroundColor: json.backgroundColor,
            foregroundColor: json.foregroundColor,
            lineWidth: json.lineWidth,
            dashed: json.dashed,
            cornerRadius: json.cornerRadius,
            // 🟩 新增：从JSON恢复变换矩阵
            transform: json.transform
        });
        rect.id = json.id;
        rect.width = json.width;
        rect.height = json.height;
        // 🟩 新增：恢复矩阵
        if (json.transform) {
            rect.transform.matrix = [...json.transform];
        }
        rect.opacity = json.opacity || 1;
        rect.groupId = json.groupId || null;
        return rect;
    }

    applyAlpha(color, alpha) {
        if (color.startsWith('rgba')) return color;
        if (color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        return color;
    }
}