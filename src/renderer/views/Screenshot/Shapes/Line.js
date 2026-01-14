import Shape from "./Shape.js"

// 线条标注类（带箭头）- 旋转不适用于线条
export default class Line extends Shape {
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