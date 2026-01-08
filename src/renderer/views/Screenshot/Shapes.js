// BaseShape类（已有）
class BaseShape {
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

    updateSize(startX, startY, endX, endY) {
        this.width = Math.abs(endX - startX);
        this.height = Math.abs(endY - startY);
        this.x = Math.min(startX, endX);
        this.y = Math.min(startY, endY);
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

// 矩形标注类
class Rect extends BaseShape {
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

// 椭圆形标注类
class Ellipse extends BaseShape {
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

// 线条标注类（带箭头）- 旋转不适用于线条
class Line extends BaseShape {
    constructor(x, y, options = {}) {
        super(x, y);
        this.type = 'line';
        this.endX = x;
        this.endY = y;
        this.strokeStyle = options.strokeStyle || '#ff00ff'; // 线条颜色
        this.lineWidth = options.lineWidth || 2;
        this.dashed = options.dashed || false;
        this.arrowSize = options.arrowSize || 10;
        this.hasArrow = options.hasArrow !== false;
        this.arrowType = options.arrowType || 'triangle';
    }

    updateSize(startX, startY, endX, endY) {
        this.x = startX;
        this.y = startY;
        this.endX = endX;
        this.endY = endY;
        this.width = Math.abs(endX - startX);
        this.height = Math.abs(endY - startY);
    }

    draw(ctx) {
        const transformedCtx = this.applyTransform(ctx);
        
        transformedCtx.strokeStyle = this.selected ? '#ff0000' : this.strokeStyle;
        transformedCtx.lineWidth = this.lineWidth;
        transformedCtx.lineCap = 'round';
        transformedCtx.lineJoin = 'round';
        
        if (this.dashed) {
            transformedCtx.setLineDash([5, 5]);
        } else {
            transformedCtx.setLineDash([]);
        }
        
        // 绘制线条
        transformedCtx.beginPath();
        transformedCtx.moveTo(this.x, this.y);
        transformedCtx.lineTo(this.endX, this.endY);
        transformedCtx.stroke();
        
        // 绘制箭头
        if (this.hasArrow && (this.width > 5 || this.height > 5)) {
            this.drawArrow(transformedCtx);
        }
        
        this.restoreTransform(transformedCtx);
    }

    drawArrow(ctx) {
        const angle = Math.atan2(this.endY - this.y, this.endX - this.x);
        
        if (this.arrowType === 'circle') {
            // 圆形箭头
            ctx.beginPath();
            ctx.arc(this.endX, this.endY, this.arrowSize / 2, 0, Math.PI * 2);
            ctx.fillStyle = this.selected ? '#ff0000' : this.strokeStyle;
            ctx.fill();
        } else {
            // 三角形箭头
            const arrowLength = this.arrowSize;
            const arrowAngle = Math.PI / 6; // 30度
            
            ctx.beginPath();
            
            // 箭头顶点
            const tipX = this.endX;
            const tipY = this.endY;
            
            // 计算箭头两个点
            const x1 = tipX - arrowLength * Math.cos(angle - arrowAngle);
            const y1 = tipY - arrowLength * Math.sin(angle - arrowAngle);
            const x2 = tipX - arrowLength * Math.cos(angle + arrowAngle);
            const y2 = tipY - arrowLength * Math.sin(angle + arrowAngle);
            
            // 绘制箭头
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(x1, y1);
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(x2, y2);
            
            ctx.stroke();
        }
    }

    containsPoint(x, y) {
        // 计算点到直线的距离
        const distance = this.pointToLineDistance(x, y, this.x, this.y, this.endX, this.endY);
        return distance <= Math.max(this.lineWidth, 5);
    }

    pointToLineDistance(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        
        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        let xx, yy;

        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = px - xx;
        const dy = py - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    toJSON() {
        const base = super.toJSON();
        return {
            ...base,
            endX: this.endX,
            endY: this.endY,
            arrowSize: this.arrowSize,
            hasArrow: this.hasArrow,
            arrowType: this.arrowType
        };
    }

    static fromJSON(json) {
        const line = new Line(json.x, json.y, {
            strokeStyle: json.strokeStyle,
            lineWidth: json.lineWidth,
            dashed: json.dashed,
            arrowSize: json.arrowSize,
            hasArrow: json.hasArrow,
            arrowType: json.arrowType
        });
        line.id = json.id;
        line.endX = json.endX;
        line.endY = json.endY;
        line.width = json.width;
        line.height = json.height;
        line.rotate = json.rotate || 0;
        line.scale = json.scale || 1;
        line.opacity = json.opacity || 1;
        return line;
    }
}

// 文字标注类
class Text extends BaseShape {
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

// 递增数字标注类
class IncrementNumber extends BaseShape {
    constructor(x, y, options = {}) {
        super(x, y);
        this.type = 'incrementNumber';
        this.number = options.number || 1;
        this.color = options.color || '#ffffff'; // 数字颜色（前景色）
        this.bgColor = options.bgColor || '#ff5722'; // 背景色
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

// 形状工厂类
class ShapeFactory {
    static createShape(type, x, y, options = {}) {
        switch (type) {
            case 'rect':
                return new Rect(x, y, options);
            case 'ellipse':
                return new Ellipse(x, y, options);
            case 'line':
                return new Line(x, y, options);
            case 'text':
                return new Text(x, y, options);
            case 'incrementNumber':
                return new IncrementNumber(x, y, options);
            default:
                throw new Error(`Unknown shape type: ${type}`);
        }
    }
    
    static fromJSON(json) {
        switch (json.type) {
            case 'rect':
                return Rect.fromJSON(json);
            case 'ellipse':
                return Ellipse.fromJSON(json);
            case 'line':
                return Line.fromJSON(json);
            case 'text':
                return Text.fromJSON(json);
            case 'incrementNumber':
                return IncrementNumber.fromJSON(json);
            default:
                throw new Error(`Unknown shape type: ${json.type}`);
        }
    }
}

// 导出所有类
export { BaseShape, Rect, Ellipse, Line, Text, IncrementNumber, ShapeFactory };