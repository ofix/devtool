import Shape from "./Shape.js";
class Rect extends Shape {
    constructor(options = {}) {
        super(options);
        this.type = 'rectangle';
    }

    render(ctx) {
        // 自定义绘制
        if (this.fill && this.fill !== 'transparent') {
            ctx.fillStyle = this.fill;
            ctx.fillRect(0, 0, this.width, this.height);
        }

        if (this.stroke && this.stroke !== 'transparent' && this.strokeWidth > 0) {
            ctx.strokeStyle = this.stroke;
            ctx.lineWidth = this.strokeWidth;
            ctx.strokeRect(0, 0, this.width, this.height);
        }
    }
}

export default Rect;