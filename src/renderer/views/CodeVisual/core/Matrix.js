export default class Matrix {
    constructor(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
        this.a = a; this.b = b; this.c = c;
        this.d = d; this.e = e; this.f = f;
    }

    set(a, b, c, d, e, f) {
        this.a = a; this.b = b; this.c = c;
        this.d = d; this.e = e; this.f = f;
        return this;
    }

    clone() {
        return new Matrix(this.a, this.b, this.c, this.d, this.e, this.f);
    }

    // 乘法：M1.multiply(M2) = M1 × M2
    multiply(other) {
        const a1 = this.a, b1 = this.b, c1 = this.c, d1 = this.d, e1 = this.e, f1 = this.f;
        const a2 = other.a, b2 = other.b, c2 = other.c, d2 = other.d, e2 = other.e, f2 = other.f;
        return new Matrix(
            a1 * a2 + c1 * b2,
            b1 * a2 + d1 * b2,
            a1 * c2 + c1 * d2,
            b1 * c2 + d1 * d2,
            a1 * e2 + c1 * f2 + e1,
            b1 * e2 + d1 * f2 + f1
        );
    }

    translate(dx, dy) {
        return this.multiply(new Matrix(1, 0, 0, 1, dx, dy));
    }

    scale(sx, sy = sx) {
        return this.multiply(new Matrix(sx, 0, 0, sy, 0, 0));
    }

    rotate(deg) {
        const rad = deg * Math.PI / 180;
        const cos = Math.cos(rad), sin = Math.sin(rad);
        return this.multiply(new Matrix(cos, sin, -sin, cos, 0, 0));
    }

    skewX(deg) {
        const tan = Math.tan(deg * Math.PI / 180);
        return this.multiply(new Matrix(1, 0, tan, 1, 0, 0));
    }

    skewY(deg) {
        const tan = Math.tan(deg * Math.PI / 180);
        return this.multiply(new Matrix(1, tan, 0, 1, 0, 0));
    }

    reset() {
        return this.set(1, 0, 0, 1, 0, 0);
    }

    // 点正向变换
    apply(x, y) {
        return {
            x: this.a * x + this.c * y + this.e,
            y: this.b * x + this.d * y + this.f
        };
    }

    // 求逆矩阵
    inverse() {
        const det = this.a * this.d - this.b * this.c;
        if (Math.abs(det) < 1e-12) return null;
        const invDet = 1 / det;
        return new Matrix(
            this.d * invDet,
            -this.b * invDet,
            -this.c * invDet,
            this.a * invDet,
            (this.c * this.f - this.d * this.e) * invDet,
            (this.b * this.e - this.a * this.f) * invDet
        );
    }
}