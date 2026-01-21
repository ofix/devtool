import Shape from "./Shape.js";

// 橡皮擦类
export default class Eraser extends Shape {
    constructor(x, y, options = {}) {
        super(x, y);
        this.type = 'eraser';
        this.strokeStyle = options.strokeStyle || '#ffffff'; // 橡皮擦颜色（通常白色）
        this.fillStyle = options.fillStyle || 'transparent';
        this.lineWidth = options.lineWidth || 20; // 橡皮擦大小
        this.dashed = false;
        this.points = [{ x, y }]; // 存储橡皮擦路径的点
        this.isErasing = false; // 是否正在擦除
        this.smoothness = options.smoothness || 0.7; // 路径平滑度
        this.eraseMode = options.eraseMode || 'destination-out'; // 擦除模式
        this.showCursor = options.showCursor || true; // 是否显示橡皮擦光标
        this.cursorColor = options.cursorColor || '#cccccc'; // 橡皮擦光标颜色
        this.softEdge = options.softEdge || false; // 是否启用柔边效果
        
        // 橡皮擦特有的属性
        this.eraserShape = options.eraserShape || 'circle'; // 橡皮擦形状：circle, square
        this.eraserOpacity = options.eraserOpacity || 1; // 橡皮擦自身透明度
    }

    draw(ctx) {
        const transformedCtx = this.applyTransform(ctx);
        
        // 如果只有1个点，不绘制擦除路径
        if (this.points.length <= 1) {
            // 但可以绘制橡皮擦光标
            if (this.showCursor && this.points.length === 1) {
                this.drawEraserCursor(transformedCtx);
            }
            this.restoreTransform(transformedCtx);
            return;
        }
        
        // 保存当前画布状态
        transformedCtx.save();
        
        // 设置橡皮擦的合成模式（关键！）
        transformedCtx.globalCompositeOperation = this.eraseMode;
        
        // 设置橡皮擦样式
        transformedCtx.strokeStyle = this.strokeStyle;
        transformedCtx.fillStyle = this.strokeStyle;
        transformedCtx.lineWidth = this.lineWidth;
        transformedCtx.lineCap = 'round';
        transformedCtx.lineJoin = 'round';
        transformedCtx.globalAlpha = this.eraserOpacity;
        
        // 柔边效果：使用渐变实现边缘柔化
        if (this.softEdge) {
            this.drawSoftEdgeEraser(transformedCtx);
        } else {
            this.drawHardEdgeEraser(transformedCtx);
        }
        
        // 恢复画布状态
        transformedCtx.restore();
        
        // 绘制橡皮擦光标（在擦除路径上方）
        if (this.showCursor) {
            this.drawEraserCursor(transformedCtx);
        }
        
        // 绘制旋转中心点（用于调试）
        if (this.selected) {
            this.drawRotationHandle(transformedCtx);
        }
        
        this.restoreTransform(transformedCtx);
    }

    /**
     * 绘制硬边橡皮擦（标准擦除效果）
     */
    drawHardEdgeEraser(ctx) {
        if (this.points.length < 2) return;
        
        ctx.beginPath();
        ctx.moveTo(this.points[0].x, this.points[0].y);
        
        for (let i = 1; i < this.points.length; i++) {
            ctx.lineTo(this.points[i].x, this.points[i].y);
        }
        
        ctx.stroke();
        
        // 如果是方形橡皮擦，需要额外处理端点
        if (this.eraserShape === 'square') {
            for (let i = 0; i < this.points.length; i++) {
                this.drawSquareEraserAtPoint(ctx, this.points[i]);
            }
        }
    }

    /**
     * 绘制柔边橡皮擦（边缘渐变效果）
     */
    drawSoftEdgeEraser(ctx) {
        if (this.points.length < 2) return;
        
        // 创建径向渐变实现柔边效果
        for (let i = 0; i < this.points.length; i++) {
            const point = this.points[i];
            const radius = this.lineWidth / 2;
            
            // 创建径向渐变
            const gradient = ctx.createRadialGradient(
                point.x, point.y, 0,
                point.x, point.y, radius
            );
            gradient.addColorStop(0, this.strokeStyle);
            gradient.addColorStop(0.7, this.strokeStyle);
            gradient.addColorStop(1, 'rgba(255,255,255,0)'); // 边缘透明
            
            ctx.fillStyle = gradient;
            
            if (this.eraserShape === 'circle') {
                ctx.beginPath();
                ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
                ctx.fill();
            } else {
                this.drawSquareEraserAtPoint(ctx, point, true);
            }
        }
        
        // 绘制连接路径
        ctx.strokeStyle = this.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(this.points[0].x, this.points[0].y);
        
        for (let i = 1; i < this.points.length; i++) {
            ctx.lineTo(this.points[i].x, this.points[i].y);
        }
        
        ctx.stroke();
    }

    /**
     * 在指定点绘制方形橡皮擦
     */
    drawSquareEraserAtPoint(ctx, point, softEdge = false) {
        const halfSize = this.lineWidth / 2;
        
        if (softEdge) {
            // 柔边方形：使用矩形渐变
            const gradient = ctx.createLinearGradient(
                point.x - halfSize, point.y,
                point.x + halfSize, point.y
            );
            gradient.addColorStop(0, 'rgba(255,255,255,0)');
            gradient.addColorStop(0.3, this.strokeStyle);
            gradient.addColorStop(0.7, this.strokeStyle);
            gradient.addColorStop(1, 'rgba(255,255,255,0)');
            
            ctx.fillStyle = gradient;
        } else {
            ctx.fillStyle = this.strokeStyle;
        }
        
        ctx.fillRect(
            point.x - halfSize, 
            point.y - halfSize, 
            this.lineWidth, 
            this.lineWidth
        );
    }

    /**
     * 绘制橡皮擦光标（显示当前橡皮擦位置和大小）
     */
    drawEraserCursor(ctx) {
        if (this.points.length === 0) return;
        
        const currentPoint = this.points[this.points.length - 1];
        const radius = this.lineWidth / 2;
        
        ctx.save();
        ctx.strokeStyle = this.cursorColor;
        ctx.fillStyle = 'transparent';
        ctx.lineWidth = 1;
        ctx.globalCompositeOperation = 'source-over'; // 恢复正常混合模式
        ctx.globalAlpha = 0.8;
        
        if (this.eraserShape === 'circle') {
            ctx.beginPath();
            ctx.arc(currentPoint.x, currentPoint.y, radius, 0, Math.PI * 2);
            ctx.stroke();
            
            // 绘制十字准星
            ctx.beginPath();
            ctx.moveTo(currentPoint.x - radius, currentPoint.y);
            ctx.lineTo(currentPoint.x + radius, currentPoint.y);
            ctx.moveTo(currentPoint.x, currentPoint.y - radius);
            ctx.lineTo(currentPoint.x, currentPoint.y + radius);
            ctx.stroke();
        } else {
            // 方形光标
            ctx.strokeRect(
                currentPoint.x - radius, 
                currentPoint.y - radius, 
                this.lineWidth, 
                this.lineWidth
            );
        }
        
        ctx.restore();
    }

    /**
     * 开始擦除
     */
    startErasing(x, y) {
        this.isErasing = true;
        this.points = [{ x, y }];
        this.updateBoundingBox();
    }

    /**
     * 继续擦除
     */
    continueErasing(x, y) {
        if (!this.isErasing) return;
        this.addPoint(x, y);
    }

    /**
     * 结束擦除
     */
    endErasing() {
        this.isErasing = false;
    }

    /**
     * 添加擦除点
     */
    addPoint(x, y) {
        this.points.push({ x, y });
        this.updateBoundingBox();
    }

    /**
     * 清除所有擦除路径
     */
    clear() {
        this.points = [];
        this.updateBoundingBox();
    }

    updateBoundingBox() {
        if (this.points.length === 0) return;
        
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        for (const point of this.points) {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
        }
        
        // 考虑橡皮擦大小扩展边界
        const padding = this.lineWidth;
        this.x = minX - padding;
        this.y = minY - padding;
        this.width = (maxX - minX) + padding * 2;
        this.height = (maxY - minY) + padding * 2;
    }

    drawRotationHandle(ctx) {
        const centerX = this.x + this.width / 2;
        const centerY = this.y - 20;
        
        ctx.save();
        ctx.fillStyle = '#ff0000';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.globalCompositeOperation = 'source-over';
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(centerX, this.y);
        ctx.lineTo(centerX, centerY);
        ctx.strokeStyle = '#ff0000';
        ctx.stroke();
        
        ctx.restore();
    }

    containsPoint(x, y) {
        // 橡皮擦的点检测：检查点是否在橡皮擦路径附近
        const threshold = this.lineWidth;
        
        for (let i = 0; i < this.points.length; i++) {
            const point = this.points[i];
            const distance = Math.sqrt((x - point.x) ** 2 + (y - point.y) ** 2);
            
            if (distance <= threshold) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * 获取橡皮擦的擦除区域（用于高级功能）
     */
    getErasureArea() {
        if (this.points.length === 0) return null;
        
        return {
            points: this.points,
            lineWidth: this.lineWidth,
            shape: this.eraserShape
        };
    }

    static fromJSON(json) {
        const eraser = new Eraser(json.points[0]?.x || 0, json.points[0]?.y || 0, {
            strokeStyle: json.strokeStyle,
            lineWidth: json.lineWidth,
            smoothness: json.smoothness,
            eraseMode: json.eraseMode,
            showCursor: json.showCursor,
            cursorColor: json.cursorColor,
            softEdge: json.softEdge,
            eraserShape: json.eraserShape,
            eraserOpacity: json.eraserOpacity
        });
        eraser.id = json.id;
        eraser.points = json.points || [];
        eraser.rotate = json.rotate || 0;
        eraser.scale = json.scale || 1;
        eraser.opacity = json.opacity || 1;
        eraser.updateBoundingBox();
        return eraser;
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