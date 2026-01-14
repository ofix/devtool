
import Shape from "./Shape.js";
// 矩形标注类
export default class Rect extends Shape {
    constructor(x, y, options = {}) {
        super(x, y);
        this.type = 'rect';
        this.strokeStyle = options.strokeStyle || '#00ff00'; // 边框色
        this.fillStyle = options.fillStyle || 'rgba(0, 255, 0, 0.1)'; // 填充色/背景色
        this.lineWidth = options.lineWidth || 2;
        this.dashed = options.dashed || false;
        this.cornerRadius = options.cornerRadius || 0;
        this.backgroundColor = options.backgroundColor || this.fillStyle; // 背景色
        this.foregroundColor = options.foregroundColor || '#ffffff'; // 前景色（用于文字等）
    }

    draw(ctx) {
        const transformedCtx = this.applyTransform(ctx);
        
        // 绘制背景/填充
        if (this.backgroundColor) {
            transformedCtx.fillStyle = this.selected ? 
                this.applyAlpha('#ff0000', 0.3) : this.backgroundColor;
            
            if (this.cornerRadius > 0) {
                this.drawRoundedRect(transformedCtx, this.x, this.y, this.width, this.height, 
                    this.cornerRadius, true);
            } else {
                transformedCtx.fillRect(this.x, this.y, this.width, this.height);
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
            this.drawRoundedRect(transformedCtx, this.x, this.y, this.width, this.height, 
                this.cornerRadius, false);
        } else {
            transformedCtx.strokeRect(this.x, this.y, this.width, this.height);
        }
        
        // 绘制旋转中心点（用于调试）
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
        const centerX = this.x + this.width / 2;
        const centerY = this.y - 20; // 在矩形上方绘制旋转手柄
        
        ctx.save();
        ctx.fillStyle = '#ff0000';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // 绘制连接线
        ctx.beginPath();
        ctx.moveTo(centerX, this.y);
        ctx.lineTo(centerX, centerY);
        ctx.strokeStyle = '#ff0000';
        ctx.stroke();
        
        ctx.restore();
    }

    containsPoint(x, y) {
        // 考虑旋转后的点检测
        if (this.rotate === 0) {
            return x >= this.x && x <= this.x + this.width &&
                   y >= this.y && y <= this.y + this.height;
        }
        
        // 计算旋转后的点相对于矩形的坐标
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        
        // 将点转换到矩形坐标系
        const cos = Math.cos(-this.rotate);
        const sin = Math.sin(-this.rotate);
        
        const tx = x - centerX;
        const ty = y - centerY;
        
        const rotatedX = tx * cos - ty * sin;
        const rotatedY = tx * sin + ty * cos;
        
        const rectX = rotatedX + this.width / 2;
        const rectY = rotatedY + this.height / 2;
        
        return rectX >= 0 && rectX <= this.width && 
               rectY >= 0 && rectY <= this.height;
    }

    static fromJSON(json) {
        const rect = new Rect(json.x, json.y, {
            strokeStyle: json.strokeStyle,
            fillStyle: json.fillStyle,
            backgroundColor: json.backgroundColor,
            foregroundColor: json.foregroundColor,
            lineWidth: json.lineWidth,
            dashed: json.dashed,
            cornerRadius: json.cornerRadius
        });
        rect.id = json.id;
        rect.width = json.width;
        rect.height = json.height;
        rect.rotate = json.rotate || 0;
        rect.scale = json.scale || 1;
        rect.opacity = json.opacity || 1;
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