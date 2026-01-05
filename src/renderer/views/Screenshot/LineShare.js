
  // 线条图形子类（LineShape.js）
  import BaseShape from './BaseShape';
  
  class LineShape extends BaseShape {
    constructor(x, y, width, height) {
      super(x, y);
      this.width = width;
      this.height = height;
      this.borderWidth = 2; // 线条粗细
      this.color = '#ffffff'; // 线条颜色
    }
  
    // 重写绘制方法
    draw(ctx) {
      if (!ctx) return;
  
      ctx.save();
      // 设置透明度
      ctx.globalAlpha = this.opacity;
      // 设置旋转和缩放
      ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
      ctx.rotate(this.rotate * Math.PI / 180);
      ctx.scale(this.scale, this.scale);
      ctx.translate(-(this.x + this.width / 2), -(this.y + this.height / 2));
  
      // 绘制线条
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + this.width, this.y + this.height);
      ctx.strokeStyle = this.color;
      ctx.lineWidth = this.borderWidth;
      ctx.stroke();
      ctx.restore();
    }
  
    // 扩展：更新线条属性
    updateProps(borderWidth, color, opacity) {
      this.borderWidth = borderWidth || this.borderWidth;
      this.color = color || this.color;
      this.opacity = opacity || this.opacity;
    }
  }
  
  export default LineShape;