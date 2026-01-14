import Shape from "./Shape.js"

// 文字标注类
export default class Text extends Shape {
    constructor(x, y, options = {}) {
        super(x, y);
        this.type = 'text';
        this.content = options.content || '文本';
        this.font = options.font || '16px Arial';
        this.color = options.color || '#000000'; // 文字颜色（前景色）
        this.backgroundColor = options.backgroundColor || null; // 背景色
        this.foregroundColor = options.color || '#000000'; // 前景色别名
        this.padding = options.padding || 5;
        this.maxWidth = options.maxWidth || 200;
        this.align = options.align || 'left';
        this.baseline = options.baseline || 'top';
        
        this.width = 0;
        this.height = 0;
        this.updateSizeByText();
    }

    updateSizeByText() {
        // 创建临时canvas计算文字尺寸
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.font = this.font;
        
        const lines = this.content.split('\n');
        let maxLineWidth = 0;
        const lineHeight = parseInt(this.font) * 1.2;
        
        lines.forEach(line => {
            const metrics = ctx.measureText(line);
            if (metrics.width > maxLineWidth) {
                maxLineWidth = metrics.width;
            }
        });
        
        this.width = Math.min(maxLineWidth, this.maxWidth) + this.padding * 2;
        this.height = lines.length * lineHeight + this.padding * 2;
    }

    draw(ctx) {
        const transformedCtx = this.applyTransform(ctx);
        
        // 绘制背景
        if (this.backgroundColor) {
            transformedCtx.fillStyle = this.selected ? 
                this.applyAlpha('#ff0000', 0.3) : this.backgroundColor;
            transformedCtx.fillRect(this.x, this.y, this.width, this.height);
        }
        
        // 绘制文字
        transformedCtx.font = this.font;
        transformedCtx.fillStyle = this.selected ? '#ff0000' : this.foregroundColor;
        transformedCtx.textAlign = this.align;
        transformedCtx.textBaseline = this.baseline;
        
        const lines = this.content.split('\n');
        const lineHeight = parseInt(this.font) * 1.2;
        const x = this.x + this.padding;
        const y = this.y + this.padding;
        
        lines.forEach((line, index) => {
            transformedCtx.fillText(line, x, y + index * lineHeight, this.maxWidth);
        });
        
        // 如果选中，绘制边框和旋转手柄
        if (this.selected) {
            transformedCtx.strokeStyle = '#ff0000';
            transformedCtx.lineWidth = 1;
            transformedCtx.strokeRect(this.x, this.y, this.width, this.height);
            
            this.drawRotationHandle(transformedCtx);
        }
        
        this.restoreTransform(transformedCtx);
    }

    drawRotationHandle(ctx) {
        const centerX = this.x + this.width / 2;
        const centerY = this.y - 20; // 在文字框上方绘制旋转手柄
        
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
            return x >= this.x && x <= this.x + this.width &&
                   y >= this.y && y <= this.y + this.height;
        }
        
        // 计算旋转后的点相对于文本框的坐标
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

    toJSON() {
        const base = super.toJSON();
        return {
            ...base,
            content: this.content,
            font: this.font,
            color: this.color,
            foregroundColor: this.foregroundColor,
            backgroundColor: this.backgroundColor,
            padding: this.padding,
            maxWidth: this.maxWidth,
            align: this.align,
            baseline: this.baseline
        };
    }

    static fromJSON(json) {
        const text = new Text(json.x, json.y, {
            content: json.content,
            font: json.font,
            color: json.color || json.foregroundColor,
            foregroundColor: json.foregroundColor || json.color,
            backgroundColor: json.backgroundColor,
            padding: json.padding,
            maxWidth: json.maxWidth,
            align: json.align,
            baseline: json.baseline
        });
        text.id = json.id;
        text.width = json.width;
        text.height = json.height;
        text.rotate = json.rotate || 0;
        text.scale = json.scale || 1;
        text.opacity = json.opacity || 1;
        return text;
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