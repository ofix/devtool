import Shape from "./Shape.js";

// 荧光笔绘制类
export default class Highlighter extends Shape {
    constructor(x, y, options = {}) {
        super(x, y);
        this.type = 'highlighter';
        this.strokeStyle = options.strokeStyle || '#ffff00'; // 荧光色，默认黄色
        this.fillStyle = options.fillStyle || 'transparent';
        this.lineWidth = options.lineWidth || 15; // 荧光笔通常较粗
        this.dashed = false;
        this.points = [{ x, y }]; // 存储绘制路径的点
        this.isDrawing = false;
        this.smoothness = options.smoothness || 0.8; // 荧光笔需要更高平滑度
        this.opacity = options.opacity || 0.4; // 关键：半透明效果
        this.blendMode = options.blendMode || 'multiply'; // 混合模式
        this.chiselTip = options.chiselTip || true; // 是否启用斜角笔尖效果
        this.tipAngle = options.tipAngle || Math.PI / 4; // 斜角角度
        this.overlapEffect = options.overlapEffect || true; // 重叠区域加深效果
        
        // 荧光笔特有的抖动效果，模拟手绘感
        this.jitter = options.jitter || 0.3;
    }

    draw(ctx) {
        const transformedCtx = this.applyTransform(ctx);
        
        // 如果只有1个点，不绘制
        if (this.points.length <= 1) {
            this.restoreTransform(transformedCtx);
            return;
        }
        
        // 设置荧光笔样式
        transformedCtx.strokeStyle = this.selected ? 
            '#ff0000' : this.strokeStyle;
        transformedCtx.lineWidth = this.lineWidth;
        transformedCtx.lineCap = this.chiselTip ? 'square' : 'round'; // 斜角笔尖用square
        transformedCtx.lineJoin = 'round';
        transformedCtx.globalAlpha = this.opacity;
        
        // 应用混合模式（关键效果！）
        if (this.blendMode) {
            transformedCtx.globalCompositeOperation = this.blendMode;
        }
        
        // 绘制荧光笔路径
        this.drawHighlighterPath(transformedCtx);
        
        // 绘制旋转中心点（用于调试）
        if (this.selected) {
            this.drawRotationHandle(transformedCtx);
        }
        
        this.restoreTransform(transformedCtx);
    }

    /**
     * 绘制荧光笔路径（特殊处理重叠和斜角效果）
     */
    drawHighlighterPath(ctx) {
        if (this.points.length < 2) return;
        
        // 方法1：简单路径（适合快速绘制）
        if (this.points.length <= 3 || !this.chiselTip) {
            this.drawSimplePath(ctx);
        } 
        // 方法2：斜角笔尖效果（更真实的荧光笔效果）
        else {
            this.drawChiselTipPath(ctx);
        }
    }

    /**
     * 简单路径绘制
     */
    drawSimplePath(ctx) {
        ctx.beginPath();
        ctx.moveTo(this.points[0].x, this.points[0].y);
        
        for (let i = 1; i < this.points.length; i++) {
            // 添加轻微抖动，模拟手绘感
            const jitterX = (Math.random() - 0.5) * this.jitter;
            const jitterY = (Math.random() - 0.5) * this.jitter;
            
            ctx.lineTo(this.points[i].x + jitterX, this.points[i].y + jitterY);
        }
        
        ctx.stroke();
    }

    /**
     * 斜角笔尖效果绘制（更真实的荧光笔效果）
     */
    drawChiselTipPath(ctx) {
        // 保存原始样式
        const originalLineWidth = ctx.lineWidth;
        
        for (let i = 0; i < this.points.length - 1; i++) {
            const p1 = this.points[i];
            const p2 = this.points[i + 1];
            
            // 计算线段角度
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            
            // 绘制主线段
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            
            // 根据线段角度调整线宽，模拟斜角笔尖
            if (this.chiselTip) {
                const effectiveWidth = originalLineWidth * Math.abs(Math.cos(angle - this.tipAngle));
                ctx.lineWidth = Math.max(effectiveWidth, originalLineWidth * 0.3);
            }
            
            // 添加重叠效果：每段路径单独绘制，重叠区域会自动加深
            if (this.overlapEffect) {
                // 绘制主路径
                ctx.stroke();
                
                // 绘制辅助路径（轻微偏移，增强重叠效果）
                if (i > 0) {
                    ctx.beginPath();
                    const offsetX = Math.sin(angle) * 1;
                    const offsetY = -Math.cos(angle) * 1;
                    ctx.moveTo(p1.x + offsetX, p1.y + offsetY);
                    ctx.lineTo(p2.x + offsetX, p2.y + offsetY);
                    ctx.stroke();
                }
            } else {
                ctx.stroke();
            }
        }
        
        // 恢复原始线宽
        ctx.lineWidth = originalLineWidth;
    }

    /**
     * 添加绘制点
     */
    addPoint(x, y) {
        // 荧光笔可以添加轻微抖动，模拟手绘不精确性
        const jitterX = (Math.random() - 0.5) * this.jitter;
        const jitterY = (Math.random() - 0.5) * this.jitter;
        
        this.points.push({ 
            x: x + jitterX, 
            y: y + jitterY 
        });
        
        this.updateBoundingBox();
    }

    startDrawing(x, y) {
        this.isDrawing = true;
        this.points = [{ x, y }];
        this.updateBoundingBox();
    }

    continueDrawing(x, y) {
        if (!this.isDrawing) return;
        this.addPoint(x, y);
    }

    endDrawing() {
        this.isDrawing = false;
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
        
        // 考虑线宽扩展边界
        const padding = this.lineWidth / 2;
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
        ctx.globalCompositeOperation = 'source-over'; // 恢复正常混合模式
        
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
        // 荧光笔的点检测阈值更大
        const threshold = this.lineWidth * 1.5;
        
        for (let i = 0; i < this.points.length - 1; i++) {
            const p1 = this.points[i];
            const p2 = this.points[i + 1];
            
            const distance = this.pointToLineDistance(x, y, p1.x, p1.y, p2.x, p2.y);
            if (distance <= threshold) {
                return true;
            }
        }
        
        return false;
    }

    pointToLineDistance(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        
        if (lenSq === 0) return Math.sqrt(A * A + B * B);
        
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
        const highlighter = new Highlighter(json.points[0]?.x || 0, json.points[0]?.y || 0, {
            strokeStyle: json.strokeStyle,
            lineWidth: json.lineWidth,
            smoothness: json.smoothness,
            opacity: json.opacity,
            blendMode: json.blendMode,
            chiselTip: json.chiselTip,
            tipAngle: json.tipAngle,
            overlapEffect: json.overlapEffect,
            jitter: json.jitter
        });
        highlighter.id = json.id;
        highlighter.points = json.points || [];
        highlighter.rotate = json.rotate || 0;
        highlighter.scale = json.scale || 1;
        highlighter.opacity = json.opacity || 0.4;
        highlighter.updateBoundingBox();
        return highlighter;
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