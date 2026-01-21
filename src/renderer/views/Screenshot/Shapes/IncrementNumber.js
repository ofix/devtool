
import Shape from "./Shape.js"
// 递增数字标注类
export default class IncrementNumber extends Shape {
    constructor(x, y, options = {}) {
        super(x, y);
        this.type = 'incrementNumber';
        this.number = options.number || 1;
        this.color = options.color || '#ffffff'; // 数字颜色（前景色）
        this.bgColor = options.bgColor || 'transparent'; // 背景色
        this.backgroundColor = options.backgroundColor || options.bgColor || '#ff5722'; // 背景色别名
        this.foregroundColor = options.foregroundColor || options.color || '#ffffff'; // 前景色
        this.font = options.font || 'bold 16px Arial';
        this.padding = options.padding || 8;
        this.minSize = options.minSize || 20;
        
        this.updateSize();
    }

    updateSize() {
        const numDigits = this.number.toString().length;
        
        if (numDigits === 1) {
            // 一位数字：圆形
            this.width = this.height = this.minSize;
        } else if (numDigits === 2) {
            // 两位数字：椭圆形
            this.width = this.minSize * 1.5;
            this.height = this.minSize;
        } else {
            // 三位及以上数字：圆角长方形
            this.width = this.minSize + (numDigits - 1) * 8;
            this.height = this.minSize;
        }
    }

    increment() {
        this.number++;
        this.updateSize();
    }

    draw(ctx) {
        const transformedCtx = this.applyTransform(ctx);
        
        const radius = Math.min(this.width, this.height) / 2;
        
        // 绘制背景
        transformedCtx.fillStyle = this.selected ? 
            this.applyAlpha('#ff0000', 0.8) : this.backgroundColor;
        
        if (this.number.toString().length === 1) {
            // 圆形
            transformedCtx.beginPath();
            transformedCtx.arc(this.x + radius, this.y + radius, radius, 0, Math.PI * 2);
            transformedCtx.fill();
        } else {
            // 圆角矩形
            this.drawRoundedRect(transformedCtx, this.x, this.y, this.width, this.height, 
                radius, true);
        }
        
        // 绘制数字
        transformedCtx.fillStyle = this.selected ? '#ffffff' : this.foregroundColor;
        transformedCtx.font = this.font;
        transformedCtx.textAlign = 'center';
        transformedCtx.textBaseline = 'middle';
        transformedCtx.fillText(
            this.number.toString(),
            this.x + this.width / 2,
            this.y + this.height / 2
        );
        
        // 如果选中，绘制边框和旋转手柄
        if (this.selected) {
            transformedCtx.strokeStyle = '#ff0000';
            transformedCtx.lineWidth = 2;
            
            if (this.number.toString().length === 1) {
                transformedCtx.beginPath();
                transformedCtx.arc(this.x + radius, this.y + radius, radius + 2, 0, Math.PI * 2);
                transformedCtx.stroke();
            } else {
                this.drawRoundedRect(transformedCtx, this.x - 2, this.y - 2, 
                    this.width + 4, this.height + 4, radius + 2, false);
            }
            
            this.drawRotationHandle(transformedCtx);
        }
        
        this.restoreTransform(transformedCtx);
    }

    drawRoundedRect(ctx, x, y, width, height, radius, fill = true) {
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
        const centerY = this.y - 20; // 在数字上方绘制旋转手柄
        
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
            
            if (this.number.toString().length === 1) {
                // 圆形检测
                const radius = this.width / 2;
                const dx = x - centerX;
                const dy = y - centerY;
                return dx * dx + dy * dy <= radius * radius;
            } else {
                // 圆角矩形检测
                return x >= this.x && x <= this.x + this.width &&
                       y >= this.y && y <= this.y + this.height;
            }
        }
        
        // 计算旋转后的点
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        
        // 将点转换到形状坐标系
        const cos = Math.cos(-this.rotate);
        const sin = Math.sin(-this.rotate);
        
        const tx = x - centerX;
        const ty = y - centerY;
        
        const rotatedX = tx * cos - ty * sin;
        const rotatedY = tx * sin + ty * cos;
        
        const shapeX = rotatedX + this.width / 2;
        const shapeY = rotatedY + this.height / 2;
        
        if (this.number.toString().length === 1) {
            // 圆形检测
            const radius = this.width / 2;
            return shapeX >= 0 && shapeX <= this.width &&
                   shapeY >= 0 && shapeY <= this.height &&
                   Math.pow(shapeX - radius, 2) + Math.pow(shapeY - radius, 2) <= radius * radius;
        } else {
            // 矩形检测
            return shapeX >= 0 && shapeX <= this.width && 
                   shapeY >= 0 && shapeY <= this.height;
        }
    }

    toJSON() {
        const base = super.toJSON();
        return {
            ...base,
            number: this.number,
            color: this.color,
            foregroundColor: this.foregroundColor,
            bgColor: this.bgColor,
            backgroundColor: this.backgroundColor,
            font: this.font,
            padding: this.padding,
            minSize: this.minSize
        };
    }

    static fromJSON(json) {
        const incNum = new IncrementNumber(json.x, json.y, {
            number: json.number,
            color: json.color,
            foregroundColor: json.foregroundColor,
            bgColor: json.bgColor || json.backgroundColor,
            backgroundColor: json.backgroundColor || json.bgColor,
            font: json.font,
            padding: json.padding,
            minSize: json.minSize || 20
        });
        incNum.id = json.id;
        incNum.width = json.width;
        incNum.height = json.height;
        incNum.rotate = json.rotate || 0;
        incNum.scale = json.scale || 1;
        incNum.opacity = json.opacity || 1;
        return incNum;
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