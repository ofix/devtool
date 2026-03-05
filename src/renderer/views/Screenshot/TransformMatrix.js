class TransformMatrix {
    constructor() {
        // 初始化单位矩阵
        this.matrix = [1, 0, 0, 1, 0, 0]; // [a, b, c, d, e, f]
        // 对应变换公式：x' = a*x + c*y + e, y' = b*x + d*y + f
    }
    
    // 重置为单位矩阵
    identity() {
        this.matrix = [1, 0, 0, 1, 0, 0];
    }
    
    // 复制矩阵
    clone() {
        return [...this.matrix];
    }
    
    // 矩阵乘法：this = this × m2
    multiply(m2) {
        const m1 = this.matrix;
        // m1 × m2
        this.matrix = [
            m1[0] * m2[0] + m1[2] * m2[1],
            m1[1] * m2[0] + m1[3] * m2[1],
            m1[0] * m2[2] + m1[2] * m2[3],
            m1[1] * m2[2] + m1[3] * m2[3],
            m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
            m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
        ];
    }
    
    // 平移
    translate(tx, ty) {
        this.multiply([1, 0, 0, 1, tx, ty]);
    }
    
    // 缩放（以原点为中心）
    scale(sx, sy = sx) {
        this.multiply([sx, 0, 0, sy, 0, 0]);
    }
    
    // 旋转（弧度）
    rotate(angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        this.multiply([cos, sin, -sin, cos, 0, 0]);
    }
    
    // 应用变换到Canvas上下文
    applyToContext(ctx) {
        const [a, b, c, d, e, f] = this.matrix;
        ctx.transform(a, b, c, d, e, f);
    }
    
    // 设置到Canvas上下文（替换当前变换）
    setToContext(ctx) {
        const [a, b, c, d, e, f] = this.matrix;
        ctx.setTransform(a, b, c, d, e, f);
    }
    
    // 变换点坐标
    transformPoint(x, y) {
        const [a, b, c, d, e, f] = this.matrix;
        return {
            x: a * x + c * y + e,
            y: b * x + d * y + f
        };
    }
    
    // 逆变换点坐标（用于将屏幕坐标转回图像坐标）
    inverseTransformPoint(x, y) {
        const [a, b, c, d, e, f] = this.matrix;
        
        // 计算行列式
        const det = a * d - b * c;
        if (Math.abs(det) < 1e-10) return null;
        
        // 逆矩阵
        const invA = d / det;
        const invB = -b / det;
        const invC = -c / det;
        const invD = a / det;
        const invE = (c * f - d * e) / det;
        const invF = (b * e - a * f) / det;
        
        return {
            x: invA * x + invC * y + invE,
            y: invB * x + invD * y + invF
        };
    }
    
    // 获取缩放因子
    getScale() {
        const [a, b, c, d] = this.matrix;
        // 近似计算：取x轴和y轴缩放的平均
        const scaleX = Math.sqrt(a * a + b * b);
        const scaleY = Math.sqrt(c * c + d * d);
        return { x: scaleX, y: scaleY };
    }
    
    // 获取平移量
    getTranslation() {
        return { x: this.matrix[4], y: this.matrix[5] };
    }
}

export default TransformMatrix;