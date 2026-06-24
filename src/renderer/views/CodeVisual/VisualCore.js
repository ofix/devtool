export class VisualCore {
    constructor(canvasEl) {
      this.canvas = canvasEl;
      this.ctx = canvasEl.getContext('2d');
      // 视口参数
      this.scale = 1;
      this.offsetX = 0;
      this.offsetY = 0;
      // 基础样式固定
      this.fontSize = 16;
      this.font = `${this.fontSize}px "Microsoft YaHei", sans-serif`;
      this.lineHeight = this.fontSize + 8;
      this.padding = 12; // 卡片内边距
      this.maxCharLimit = 20; // 单字段最大字符限制
  
      this.bindWheel();
    }
  
    // 重置缩放、偏移到初始状态
    resetTransform() {
      this.scale = 1;
      this.offsetX = 0;
      this.offsetY = 0;
      this.render();
    }
  
    // 滚轮缩放
    bindWheel() {
      this.canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomSpeed = 0.08;
        if (e.deltaY < 0) {
          this.scale += zoomSpeed;
        } else {
          this.scale -= zoomSpeed;
        }
        // 缩放区间限制 0.3 ~ 3
        this.scale = Math.max(0.3, Math.min(3, this.scale));
        this.render();
      });
    }
  
    // 屏幕坐标 → 画布原始坐标（缩放平移转换）
    screenToWorld(x, y) {
      return {
        x: (x - this.offsetX) / this.scale,
        y: (y - this.offsetY) / this.scale
      };
    }
  
    // 画布基础绘制入口，统一应用缩放变换
    startDraw() {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.save();
      this.ctx.translate(this.offsetX, this.offsetY);
      this.ctx.scale(this.scale, this.scale);
      this.ctx.font = this.font;
      this.ctx.fillStyle = '#333';
    }
  
    endDraw() {
      this.ctx.restore();
    }
  
    // 测量单行文本宽度
    measureText(text) {
      return this.ctx.measureText(text).width;
    }
  
    // 绘制圆角矩形卡片
    drawRoundRect(x, y, w, h, radius, fill = '#fff', stroke = '#888') {
      this.ctx.fillStyle = fill;
      this.ctx.strokeStyle = stroke;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.roundRect(x, y, w, h, radius);
      this.ctx.fill();
      this.ctx.stroke();
    }
  
    // 绘制单行文字，超长自动截断
    drawText(x, y, rawText, maxWidth) {
      // 字符截断逻辑
      let text = rawText.slice(0, this.maxCharLimit);
      if (rawText.length > this.maxCharLimit) text += '...';
  
      const width = this.measureText(text);
      if (width > maxWidth) {
        // 再次截断适配单元格宽度
        while (text.length > 3 && this.measureText(text + '...') > maxWidth) {
          text = text.slice(0, -1);
        }
        text += '...';
      }
      this.ctx.fillText(text, x, y + this.fontSize * 0.8);
      return { fullText: rawText, showText: text, width: this.measureText(text) };
    }
  }