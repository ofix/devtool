import Shape from "./Shape.js"
// 椭圆形标注类
export default class Ellipse extends Shape {
    constructor(x, y, options = {}) {
        super(x, y);
        this.type = 'ellipse';
        this.strokeStyle = options.strokeStyle || '#ff9900';
        this.fillStyle = options.fillStyle || 'rgba(255, 153, 0, 0.1)';
        this.backgroundColor = options.backgroundColor || this.fillStyle;
        this.foregroundColor = options.foregroundColor || '#000000';
        this.lineWidth = options.lineWidth || 2;
        this.dashed = options.dashed || false;
    }

    draw(ctx) {
        const transformedCtx = this.applyTransform(ctx);
        
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const radiusX = this.width / 2;
        const radiusY = this.height / 2;
        
        // 绘制背景/填充
        if (this.backgroundColor) {
            transformedCtx.fillStyle = this.selected ? 
                this.applyAlpha('#ff0000', 0.3) : this.backgroundColor;
            transformedCtx.beginPath();
            transformedCtx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
            transformedCtx.fill();
        }
        
        // 绘制边框
        transformedCtx.strokeStyle = this.selected ? '#ff0000' : this.strokeStyle;
        transformedCtx.lineWidth = this.lineWidth;
        
        if (this.dashed) {
            transformedCtx.setLineDash([5, 5]);
        } else {
            transformedCtx.setLineDash([]);
        }
        
        transformedCtx.beginPath();
        transformedCtx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
        transformedCtx.stroke();
        
        // 绘制旋转中心点
        if (this.selected) {
            this.drawRotationHandle(transformedCtx);
        }
        
        this.restoreTransform(transformedCtx);
    }

    drawRotationHandle(ctx) {
        const centerX = this.x + this.width / 2;
        const centerY = this.y - 20; // 在椭圆上方绘制旋转手柄
        
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
        if (this.rotate === 0) {
            const centerX = this.x + this.width / 2;
            const centerY = this.y + this.height / 2;
            const radiusX = this.width / 2;
            const radiusY = this.height / 2;
            
            const normalizedX = (x - centerX) / radiusX;
            const normalizedY = (y - centerY) / radiusY;
            return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
        }
        
        // 计算旋转后的点相对于椭圆的坐标
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        
        // 将点转换到椭圆坐标系
        const cos = Math.cos(-this.rotate);
        const sin = Math.sin(-this.rotate);
        
        const tx = x - centerX;
        const ty = y - centerY;
        
        const rotatedX = tx * cos - ty * sin;
        const rotatedY = tx * sin + ty * cos;
        
        const radiusX = this.width / 2;
        const radiusY = this.height / 2;
        
        const normalizedX = rotatedX / radiusX;
        const normalizedY = rotatedY / radiusY;
        
        return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
    }

    static fromJSON(json) {
        const ellipse = new Ellipse(json.x, json.y, {
            strokeStyle: json.strokeStyle,
            fillStyle: json.fillStyle,
            backgroundColor: json.backgroundColor,
            foregroundColor: json.foregroundColor,
            lineWidth: json.lineWidth,
            dashed: json.dashed
        });
        ellipse.id = json.id;
        ellipse.width = json.width;
        ellipse.height = json.height;
        ellipse.rotate = json.rotate || 0;
        ellipse.scale = json.scale || 1;
        ellipse.opacity = json.opacity || 1;
        return ellipse;
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