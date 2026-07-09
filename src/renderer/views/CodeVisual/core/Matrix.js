class Matrix {
    constructor(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
      this.a = a;
      this.b = b;
      this.c = c;
      this.d = d;
      this.e = e;
      this.f = f;
    }
  
    // 应用变换到点
    apply(x, y) {
      return {
        x: this.a * x + this.c * y + this.e,
        y: this.b * x + this.d * y + this.f
      };
    }
  
    // 应用变换到多个点
    applyToPoints(points) {
      return points.map(p => this.apply(p.x, p.y));
    }
  
    // 逆矩阵
    inverse() {
      const det = this.a * this.d - this.b * this.c;
      if (Math.abs(det) < 1e-10) {
        throw new Error('Matrix is singular');
      }
      return new TransformMatrix(
        this.d / det,
        -this.b / det,
        -this.c / det,
        this.a / det,
        (this.c * this.f - this.d * this.e) / det,
        (this.b * this.e - this.a * this.f) / det
      );
    }
  
    // 矩阵乘法
    multiply(matrix) {
      return new TransformMatrix(
        this.a * matrix.a + this.c * matrix.b,
        this.b * matrix.a + this.d * matrix.b,
        this.a * matrix.c + this.c * matrix.d,
        this.b * matrix.c + this.d * matrix.d,
        this.a * matrix.e + this.c * matrix.f + this.e,
        this.b * matrix.e + this.d * matrix.f + this.f
      );
    }
  
    translate(x, y) {
      return this.multiply(new TransformMatrix(1, 0, 0, 1, x, y));
    }
  
    scale(sx, sy) {
      return this.multiply(new TransformMatrix(sx, 0, 0, sy, 0, 0));
    }
  
    rotate(angle) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return this.multiply(new TransformMatrix(cos, sin, -sin, cos, 0, 0));
    }
  
    // 获取变换后的点（从本地坐标到世界坐标）
    transformPoint(x, y) {
      return this.apply(x, y);
    }
  
    // 获取逆变换后的点（从世界坐标到本地坐标）
    inverseTransformPoint(x, y) {
      return this.inverse().apply(x, y);
    }
  
    // 克隆
    clone() {
      return new TransformMatrix(this.a, this.b, this.c, this.d, this.e, this.f);
    }
  
    // 是否为单位矩阵
    isIdentity() {
      return this.a === 1 && this.b === 0 && 
             this.c === 0 && this.d === 1 && 
             this.e === 0 && this.f === 0;
    }
  
    toArray() {
      return [this.a, this.b, this.c, this.d, this.e, this.f];
    }
  
    toCSS() {
      return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
    }
  
    toString() {
      return `TransformMatrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
    }
  }

  export default Matrix;