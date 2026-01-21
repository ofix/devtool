import Shape from "./Shape.js";

// 五角星标注类（基于矩形区域）
export default class Star extends Shape {
    constructor(x, y, options = {}) {
        super(x, y);
        this.type = 'star';
        this.strokeStyle = options.strokeStyle || '#ffa500'; // 边框色，默认橙色
        this.fillStyle = options.fillStyle || 'transparent'; // 填充色，默认黄色
        this.lineWidth = options.lineWidth || 2;
        this.dashed = options.dashed || false;
        this.width = options.width || 100; // 矩形宽度
        this.height = options.height || 100; // 矩形高度
        this.smoothness = options.smoothness || 0.3; // 顶点圆滑度系数 (0-1)
        this.innerRatio = options.innerRatio || 0.4; // 内半径与外半径的比例
        this.backgroundColor = options.backgroundColor || this.fillStyle; // 背景色
        this.foregroundColor = options.foregroundColor || '#ffffff'; // 前景色
    }

    draw(ctx) {
        const transformedCtx = this.applyTransform(ctx);

        // 计算五角星的中心点和半径（基于矩形）
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const radius = Math.min(this.width, this.height) / 2; // 取矩形短边的一半作为最大半径

        // 绘制背景/填充
        if (this.backgroundColor) {
            transformedCtx.fillStyle = this.selected ?
                this.applyAlpha('#ff0000', 0.3) : this.backgroundColor;
            this.drawSmoothStar(transformedCtx, centerX, centerY, radius, true);
        }

        // 绘制边框
        transformedCtx.strokeStyle = this.selected ? '#ff0000' : this.strokeStyle;
        transformedCtx.lineWidth = this.lineWidth;

        if (this.dashed) {
            transformedCtx.setLineDash([5, 5]);
        } else {
            transformedCtx.setLineDash([]);
        }

        this.drawSmoothStar(transformedCtx, centerX, centerY, radius, false);

        // 绘制旋转中心点（用于调试）
        if (this.selected) {
            this.drawRotationHandle(transformedCtx, centerX, centerY);
        }

        this.restoreTransform(transformedCtx);
    }

    /**
     * 绘制圆滑顶点的五角星
     * @param {CanvasRenderingContext2D} ctx - 画布上下文
     * @param {number} centerX - 中心点X坐标
     * @param {number} centerY - 中心点Y坐标
     * @param {number} radius - 外接圆半径
     * @param {boolean} fill - 是否填充
     */
    drawSmoothStar(ctx, centerX, centerY, radius, fill = false) {
        const innerRadius = radius * this.innerRatio; // 内半径

        ctx.beginPath();

        // 五角星有10个关键点（5个外顶点 + 5个内顶点）
        for (let i = 0; i < 5; i++) {
            // 计算外顶点和内顶点的角度（弧度）
            const outerAngle = (i * 2 * Math.PI / 5) - Math.PI / 2; // 从顶部开始
            const innerAngle = outerAngle + Math.PI / 5;

            // 外顶点坐标
            const outerX = centerX + radius * Math.cos(outerAngle);
            const outerY = centerY + radius * Math.sin(outerAngle);

            // 内顶点坐标
            const innerX = centerX + innerRadius * Math.cos(innerAngle);
            const innerY = centerY + innerRadius * Math.sin(innerAngle);

            // 下一个外顶点坐标（用于计算控制点）
            const nextOuterAngle = ((i + 1) * 2 * Math.PI / 5) - Math.PI / 2;
            const nextOuterX = centerX + radius * Math.cos(nextOuterAngle);
            const nextOuterY = centerY + radius * Math.sin(nextOuterAngle);

            if (i === 0) {
                // 移动到第一个外顶点
                ctx.moveTo(outerX, outerY);
            } else {
                // 使用二次贝塞尔曲线平滑连接到外顶点
                const controlX = outerX - (outerX - innerX) * this.smoothness;
                const controlY = outerY - (outerY - innerY) * this.smoothness;
                ctx.quadraticCurveTo(controlX, controlY, outerX, outerY);
            }

            // 使用二次贝塞尔曲线平滑连接到内顶点
            const controlX = innerX - (innerX - nextOuterX) * this.smoothness;
            const controlY = innerY - (innerY - nextOuterY) * this.smoothness;
            ctx.quadraticCurveTo(controlX, controlY, innerX, innerY);
        }

        // 闭合路径，从最后一个内顶点平滑连接到第一个外顶点
        const firstOuterX = centerX + radius * Math.cos(-Math.PI / 2);
        const firstOuterY = centerY + radius * Math.sin(-Math.PI / 2);
        const firstInnerAngle = (-Math.PI / 2) + Math.PI / 5;
        const firstInnerX = centerX + innerRadius * Math.cos(firstInnerAngle);
        const firstInnerY = centerY + innerRadius * Math.sin(firstInnerAngle);

        const controlX = firstOuterX - (firstOuterX - firstInnerX) * this.smoothness;
        const controlY = firstOuterY - (firstOuterY - firstInnerY) * this.smoothness;
        ctx.quadraticCurveTo(controlX, controlY, firstOuterX, firstOuterY);

        ctx.closePath();

        if (fill) {
            ctx.fill();
        } else {
            ctx.stroke();
        }
    }

    drawRotationHandle(ctx, centerX, centerY) {
        const handleY = centerY - Math.min(this.width, this.height) / 2 - 20; // 在五角星上方绘制旋转手柄

        ctx.save();
        ctx.fillStyle = '#ff0000';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.arc(centerX, handleY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 绘制连接线
        ctx.beginPath();
        ctx.moveTo(centerX, centerY - Math.min(this.width, this.height) / 2);
        ctx.lineTo(centerX, handleY);
        ctx.strokeStyle = '#ff0000';
        ctx.stroke();

        ctx.restore();
    }

    containsPoint(x, y) {
        // 考虑旋转后的点检测
        if (this.rotate === 0) {
            // 简化版：检查点是否在矩形区域内
            return x >= this.x && x <= this.x + this.width &&
                y >= this.y && y <= this.y + this.height;
        }

        // 计算旋转后的点相对于五角星的坐标
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;

        // 将点转换到五角星坐标系
        const cos = Math.cos(-this.rotate);
        const sin = Math.sin(-this.rotate);

        const tx = x - centerX;
        const ty = y - centerY;

        const rotatedX = tx * cos - ty * sin;
        const rotatedY = tx * sin + ty * cos;

        const starX = rotatedX + this.width / 2;
        const starY = rotatedY + this.height / 2;

        // 检查是否在矩形边界内（简化检测）
        return starX >= 0 && starX <= this.width &&
            starY >= 0 && starY <= this.height;
    }

    static fromJSON(json) {
        const star = new Star(json.x, json.y, {
            strokeStyle: json.strokeStyle,
            fillStyle: json.fillStyle,
            backgroundColor: json.backgroundColor,
            foregroundColor: json.foregroundColor,
            lineWidth: json.lineWidth,
            dashed: json.dashed,
            width: json.width,
            height: json.height,
            smoothness: json.smoothness,
            innerRatio: json.innerRatio
        });
        star.id = json.id;
        star.rotate = json.rotate || 0;
        star.scale = json.scale || 1;
        star.opacity = json.opacity || 1;
        return star;
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