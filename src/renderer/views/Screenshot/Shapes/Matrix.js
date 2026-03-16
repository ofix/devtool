/**
 * 变换矩阵类 - 用于处理图形的平移、旋转、缩放等变换
 * 使用 3x3 矩阵表示仿射变换:
 * [ a, c, e ]
 * [ b, d, f ]
 * [ 0, 0, 1 ]
 */
export default class Matrix {
    constructor() {
        this.matrix = [1, 0, 0, 1, 0, 0]; // [a, b, c, d, e, f] 对应 DOMMatrix 格式
    }

    /**
     * 设置为单位矩阵
     */
    identity() {
        this.matrix = [1, 0, 0, 1, 0, 0];
        return this;
    }

    /**
     * 复制矩阵
     */
    clone() {
        const newMatrix = new Matrix();
        newMatrix.matrix = [...this.matrix];
        return newMatrix;
    }

    /**
     * 平移变换
     */
    translate(tx, ty) {
        this.matrix[4] += tx * this.matrix[0] + ty * this.matrix[2];
        this.matrix[5] += tx * this.matrix[1] + ty * this.matrix[3];
        return this;
    }

    /**
     * 旋转变换（角度制）
     */
    rotate(angle) {
        const rad = (angle * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const [a, b, c, d, e, f] = this.matrix;
        
        this.matrix[0] = a * cos + c * sin;
        this.matrix[1] = b * cos + d * sin;
        this.matrix[2] = -a * sin + c * cos;
        this.matrix[3] = -b * sin + d * cos;
        
        return this;
    }

    /**
     * 缩放变换
     */
    scale(sx, sy = sx) {
        this.matrix[0] *= sx;
        this.matrix[1] *= sx;
        this.matrix[2] *= sy;
        this.matrix[3] *= sy;
        return this;
    }

    /**
     * 应用变换到点
     */
    transformPoint(x, y) {
        const [a, b, c, d, e, f] = this.matrix;
        return {
            x: x * a + y * c + e,
            y: x * b + y * d + f
        };
    }

    /**
     * 逆变换点
     */
    inverseTransformPoint(x, y) {
        const [a, b, c, d, e, f] = this.matrix;
        const det = a * d - b * c;
        if (Math.abs(det) < 1e-10) return { x, y };
        
        const invDet = 1 / det;
        const tx = x - e;
        const ty = y - f;
        
        return {
            x: (d * tx - c * ty) * invDet,
            y: (-b * tx + a * ty) * invDet
        };
    }

    /**
     * 获取逆矩阵
     */
    getInverse() {
        const [a, b, c, d, e, f] = this.matrix;
        const det = a * d - b * c;
        if (Math.abs(det) < 1e-10) return new Matrix();
        
        const invDet = 1 / det;
        const inverse = new Matrix();
        inverse.matrix = [
            d * invDet,
            -b * invDet,
            -c * invDet,
            a * invDet,
            (c * f - d * e) * invDet,
            (b * e - a * f) * invDet
        ];
        return inverse;
    }

    /**
     * 转换为 Canvas 变换参数
     */
    toCanvasTransform() {
        return this.matrix;
    }

    /**
     * 从 DOMMatrix 导入
     */
    fromDOMMatrix(domMatrix) {
        this.matrix = [
            domMatrix.a,
            domMatrix.b,
            domMatrix.c,
            domMatrix.d,
            domMatrix.e,
            domMatrix.f
        ];
        return this;
    }

    /**
     * 导出到 DOMMatrix
     */
    toDOMMatrix() {
        const domMatrix = new DOMMatrix();
        domMatrix.a = this.matrix[0];
        domMatrix.b = this.matrix[1];
        domMatrix.c = this.matrix[2];
        domMatrix.d = this.matrix[3];
        domMatrix.e = this.matrix[4];
        domMatrix.f = this.matrix[5];
        return domMatrix;
    }

    /**
     * 获取缩放比例
     */
    getScale() {
        return Math.sqrt(this.matrix[0] * this.matrix[0] + this.matrix[1] * this.matrix[1]);
    }

    /**
     * 获取旋转角度（度）
     */
    getRotation() {
        return Math.atan2(this.matrix[1], this.matrix[0]) * 180 / Math.PI;
    }
}