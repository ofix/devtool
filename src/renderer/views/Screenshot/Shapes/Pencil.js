import Shape from "./Shape.js";

// 铅笔绘制类
export default class Pencil extends Shape {
    constructor(x, y, options = {}) {
        super(x, y);
        this.type = 'pencil';
        this.strokeStyle = options.strokeStyle || '#000000'; // 铅笔颜色
        this.fillStyle = options.fillStyle || 'transparent'; // 铅笔通常不填充
        this.lineWidth = options.lineWidth || 3; // 铅笔粗细
        this.dashed = false; // 铅笔通常不使用虚线
        this.points = [{ x, y }]; // 存储绘制路径的点
        this.isDrawing = false; // 是否正在绘制
        this.smoothness = options.smoothness || 0.5; // 路径平滑度
        this.pressure = options.pressure || 1; // 模拟铅笔压力效果
        this.opacity = options.opacity || 1;
        
        // 铅笔特有的纹理效果
        this.texture = options.texture || false; // 是否启用铅笔纹理效果
        this.texturePattern = null; // 铅笔纹理图案
    }

    draw(ctx) {
        const transformedCtx = this.applyTransform(ctx);
        
        // 如果只有1个点，不绘制
        if (this.points.length <= 1) {
            this.restoreTransform(transformedCtx);
            return;
        }
        
        // 设置铅笔样式
        transformedCtx.strokeStyle = this.selected ? 
            '#ff0000' : this.strokeStyle;
        transformedCtx.lineWidth = this.lineWidth * this.pressure;
        transformedCtx.lineCap = 'round'; // 铅笔笔触圆头
        transformedCtx.lineJoin = 'round'; // 铅笔转角圆滑
        transformedCtx.globalAlpha = this.opacity;
        
        // 应用铅笔纹理效果
        if (this.texture && !this.texturePattern) {
            this.createPencilTexture(transformedCtx);
        }
        
        if (this.texture && this.texturePattern) {
            transformedCtx.strokeStyle = this.texturePattern;
        }
        
        // 绘制铅笔路径
        this.drawPencilPath(transformedCtx);
        
        // 绘制旋转中心点（用于调试）
        if (this.selected) {
            this.drawRotationHandle(transformedCtx);
        }
        
        this.restoreTransform(transformedCtx);
    }

    /**
     * 绘制铅笔路径（使用贝塞尔曲线平滑路径）
     */
    drawPencilPath(ctx) {
        if (this.points.length < 2) return;
        
        ctx.beginPath();
        
        if (this.points.length === 2) {
            // 只有两个点时直接画直线
            ctx.moveTo(this.points[0].x, this.points[0].y);
            ctx.lineTo(this.points[1].x, this.points[1].y);
        } else {
            // 多个点时使用贝塞尔曲线平滑路径
            ctx.moveTo(this.points[0].x, this.points[0].y);
            
            for (let i = 1; i < this.points.length - 2; i++) {
                const p1 = this.points[i];
                const p2 = this.points[i + 1];
                
                // 计算控制点，实现平滑过渡
                const controlX = (p1.x + p2.x) / 2;
                const controlY = (p1.y + p2.y) / 2;
                
                ctx.quadraticCurveTo(p1.x, p1.y, controlX, controlY);
            }
            
            // 处理最后两个点
            const lastPoint = this.points[this.points.length - 1];
            const secondLastPoint = this.points[this.points.length - 2];
            ctx.quadraticCurveTo(
                secondLastPoint.x, secondLastPoint.y,
                lastPoint.x, lastPoint.y
            );
        }
        
        ctx.stroke();
    }

    /**
     * 添加绘制点
     */
    addPoint(x, y) {
        this.points.push({ x, y });
        
        // 自动更新边界框
        this.updateBoundingBox();
    }

    /**
     * 开始绘制
     */
    startDrawing(x, y) {
        this.isDrawing = true;
        this.points = [{ x, y }]; // 重置点数组
        this.updateBoundingBox();
    }

    /**
     * 继续绘制
     */
    continueDrawing(x, y) {
        if (!this.isDrawing) return;
        this.addPoint(x, y);
    }

    /**
     * 结束绘制
     */
    endDrawing() {
        this.isDrawing = false;
    }

    /**
     * 更新边界框（用于点检测和选择）
     */
    updateBoundingBox() {
        if (this.points.length === 0) return;
        
        // 计算所有点的最小/最大坐标
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        for (const point of this.points) {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
        }
        
        // 设置边界框
        this.x = minX;
        this.y = minY;
        this.width = maxX - minX;
        this.height = maxY - minY;
    }

    /**
     * 创建铅笔纹理效果
     */
    createPencilTexture(ctx) {
        // 创建离屏canvas生成铅笔纹理
        const textureCanvas = document.createElement('canvas');
        textureCanvas.width = 20;
        textureCanvas.height = 20;
        const textureCtx = textureCanvas.getContext('2d');
        
        // 绘制铅笔颗粒纹理
        textureCtx.fillStyle = this.strokeStyle;
        for (let i = 0; i < 20; i++) {
            const x = Math.random() * 20;
            const y = Math.random() * 20;
            const size = Math.random() * 2 + 0.5;
            textureCtx.beginPath();
            textureCtx.arc(x, y, size, 0, Math.PI * 2);
            textureCtx.fill();
        }
        
        this.texturePattern = ctx.createPattern(textureCanvas, 'repeat');
    }

    drawRotationHandle(ctx) {
        const centerX = this.x + this.width / 2;
        const centerY = this.y - 20; // 在铅笔路径上方绘制旋转手柄
        
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
        // 铅笔路径的点检测：检查点是否在路径附近
        const threshold = this.lineWidth * 2; // 检测阈值
        
        for (let i = 0; i < this.points.length - 1; i++) {
            const p1 = this.points[i];
            const p2 = this.points[i + 1];
            
            // 计算点到线段的距离
            const distance = this.pointToLineDistance(x, y, p1.x, p1.y, p2.x, p2.y);
            if (distance <= threshold) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * 计算点到线段的距离
     */
    pointToLineDistance(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        
        if (lenSq === 0) {
            return Math.sqrt(A * A + B * B);
        }
        
        const param = dot / lenSq;
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

    static fromJSON(json) {
        const pencil = new Pencil(json.points[0]?.x || 0, json.points[0]?.y || 0, {
            strokeStyle: json.strokeStyle,
            fillStyle: json.fillStyle,
            lineWidth: json.lineWidth,
            smoothness: json.smoothness,
            pressure: json.pressure,
            texture: json.texture,
            opacity: json.opacity
        });
        pencil.id = json.id;
        pencil.points = json.points || [];
        pencil.rotate = json.rotate || 0;
        pencil.scale = json.scale || 1;
        pencil.opacity = json.opacity || 1;
        pencil.updateBoundingBox();
        return pencil;
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