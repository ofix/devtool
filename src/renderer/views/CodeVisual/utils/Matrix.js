// utils/Matrix.js
export class Matrix {
    constructor(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
        this.a = a; // scale x
        this.b = b; // skew y
        this.c = c; // skew x
        this.d = d; // scale y
        this.e = e; // translate x
        this.f = f; // translate y
    }

    translate(x, y) {
        return new Matrix(
            this.a, this.b,
            this.c, this.d,
            this.e + x, this.f + y
        );
    }

    scale(x, y) {
        return new Matrix(
            this.a * x, this.b * x,
            this.c * y, this.d * y,
            this.e, this.f
        );
    }

    applyToPoint(point) {
        return {
            x: this.a * point.x + this.c * point.y + this.e,
            y: this.b * point.x + this.d * point.y + this.f
        };
    }

    applyToRect(rect) {
        const p1 = this.applyToPoint({ x: rect.x, y: rect.y });
        const p2 = this.applyToPoint({ x: rect.x + rect.width, y: rect.y + rect.height });
        return {
            x: Math.min(p1.x, p2.x),
            y: Math.min(p1.y, p2.y),
            width: Math.abs(p2.x - p1.x),
            height: Math.abs(p2.y - p1.y)
        };
    }

    invert() {
        const det = this.a * this.d - this.b * this.c;
        if (Math.abs(det) < 1e-10) return null;
        return new Matrix(
            this.d / det,
            -this.b / det,
            -this.c / det,
            this.a / det,
            (this.c * this.f - this.d * this.e) / det,
            (this.b * this.e - this.a * this.f) / det
        );
    }

    multiply(other) {
        return new Matrix(
            this.a * other.a + this.c * other.b,
            this.b * other.a + this.d * other.b,
            this.a * other.c + this.c * other.d,
            this.b * other.c + this.d * other.d,
            this.a * other.e + this.c * other.f + this.e,
            this.b * other.e + this.d * other.f + this.f
        );
    }
}