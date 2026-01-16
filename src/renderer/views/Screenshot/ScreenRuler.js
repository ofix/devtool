export default class ScreenRuler {
    // 静态常量配置
    static get FIXED_EDGE_SIZE() { return 30; }
    static get RULER_CONFIG() {
      return {
        MAJOR_TICK_INTERVAL: 50,
        MINOR_TICK_INTERVAL: 10,
        FINE_TICK_INTERVAL: 1,
        CONTROL_AREA_SIZE: 80,
        TEXT_FONT: "11px Arial, Helvetica, sans-serif",
        DEFAULT_SIZE: { width: 800, height: 30 }
      };
    }
  
    /**
     * 构造函数
     * @param {HTMLCanvasElement} canvas - 画布元素
     * @param {Object} options - 初始化选项
     */
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas?.getContext("2d") || null;
      this.type = options.type || "horizontal"; // horizontal/vertical
      this.winPos = options.winPos || { x: 0, y: 0 };
      this.mousePos = { x: 0, y: 0 };
      this.size = {
        width: options.width || RulerCore.RULER_CONFIG.DEFAULT_SIZE.width,
        height: options.height || RulerCore.RULER_CONFIG.DEFAULT_SIZE.height
      };
  
      // 初始化画布上下文
      this._initContext();
    }
  
    /**
     * 初始化画布上下文（禁用抗锯齿）
     * @private
     */
    _initContext() {
      if (!this.ctx) return;
      this.ctx.imageSmoothingEnabled = false;
      this.ctx.webkitImageSmoothingEnabled = false;
      this.ctx.msImageSmoothingEnabled = false;
    }
  
    /**
     * 计算画布尺寸
     * @returns {Object} { fixed, dynamic }
     */
    getCanvasSize() {
      return {
        fixed: this.type === "horizontal" 
          ? this.size.width 
          : RulerCore.FIXED_EDGE_SIZE,
        dynamic: this.type === "horizontal" 
          ? RulerCore.FIXED_EDGE_SIZE 
          : this.size.height
      };
    }
  
    /**
     * 更新标尺类型（横/竖）
     * @param {string} newType - horizontal/vertical
     */
    updateType(newType) {
      this.type = newType;
      // 同步更新画布尺寸
      const { width, height } = this.canvas;
      this.canvas.width = this.getCanvasSize().fixed;
      this.canvas.height = this.getCanvasSize().dynamic;
    }
  
    /**
     * 更新标尺尺寸
     * @param {number} width - 宽度
     * @param {number} height - 高度
     */
    updateSize(width, height) {
      this.size = { width, height };
      this.canvas.width = this.getCanvasSize().fixed;
      this.canvas.height = this.getCanvasSize().dynamic;
    }
  
    /**
     * 更新窗口位置
     * @param {Object} pos - { x, y }
     */
    updateWinPos(pos) {
      this.winPos = pos;
    }
  
    /**
     * 更新鼠标位置
     * @param {Object} pos - { x, y }
     */
    updateMousePos(pos) {
      this.mousePos = pos;
    }
  
    /**
     * 核心绘制逻辑
     */
    redraw() {
      if (!this.ctx || !this.canvas) return;
  
      // 保存上下文状态
      this.ctx.save();
      this.ctx.reset();
  
      const isHorizontal = this.type === "horizontal";
      const { fixed: w, dynamic: h } = this.getCanvasSize();
      const [floorW, floorH] = [Math.floor(w), Math.floor(h)];
  
      // 1. 清空画布
      this.ctx.clearRect(0, 0, floorW, floorH);
      this.ctx.fillStyle = "rgba(255, 255, 255, 1)";
      this.ctx.fillRect(0, 0, floorW, floorH);
  
      // 2. 计算控制区域
      const center = Math.floor(isHorizontal ? h / 2 : w / 2);
      const { CONTROL_AREA_SIZE } = RulerCore.RULER_CONFIG;
      const [controlStart, controlEnd] = [
        Math.floor((isHorizontal ? w : h) / 2 - CONTROL_AREA_SIZE / 2),
        Math.floor((isHorizontal ? w : h) / 2 + CONTROL_AREA_SIZE / 2)
      ];
  
      // 3. 设置基础样式
      this.ctx.strokeStyle = "#666";
      this.ctx.fillStyle = "#333";
      this.ctx.lineWidth = 1;
      this.ctx.font = RulerCore.RULER_CONFIG.TEXT_FONT;
      this.ctx.textBaseline = "middle";
      this.ctx.textRendering = "geometricPrecision";
  
      // 4. 绘制刻度
      this._drawTicks(isHorizontal, w, h, floorW, floorH, controlStart, controlEnd, center);
  
      // 5. 绘制主刻度文本
      this._drawTickText(isHorizontal, w, h, controlStart, controlEnd, center);
  
      // 6. 绘制鼠标标线
      this._drawMouseLine(isHorizontal, floorW, floorH, controlStart, controlEnd, center);
  
      // 7. 绘制边框
      this._drawBorder(floorW, floorH);
  
      // 恢复上下文状态
      this.ctx.restore();
    }
  
    /**
     * 绘制刻度
     * @private
     */
    _drawTicks(isHorizontal, w, h, floorW, floorH, controlStart, controlEnd, center) {
      const maxLength = isHorizontal ? w : h;
      const { MAJOR_TICK_INTERVAL, MINOR_TICK_INTERVAL } = RulerCore.RULER_CONFIG;
  
      this.ctx.beginPath();
      for (let i = 0; i <= maxLength; i += 1) {
        if (i >= controlStart && i <= controlEnd) continue;
  
        // 判断刻度类型
        const isMajor = i % MAJOR_TICK_INTERVAL === 0;
        const isMinor = i % MINOR_TICK_INTERVAL === 0;
        const isFine = !isMajor && !isMinor && i % 2 === 0;
  
        if (!isMajor && !isMinor && !isFine) continue;
  
        // 刻度长度
        const tickLength = isMajor ? 10 : isMinor ? 6 : 3;
        const [pos, tickLen] = [Math.floor(i), Math.floor(tickLength)];
  
        // 绘制横/竖刻度
        if (isHorizontal) {
          this.ctx.moveTo(pos, 0);
          this.ctx.lineTo(pos, tickLen);
          this.ctx.moveTo(pos, floorH);
          this.ctx.lineTo(pos, floorH - tickLen);
        } else {
          this.ctx.moveTo(0, pos);
          this.ctx.lineTo(tickLen, pos);
          this.ctx.moveTo(floorW, pos);
          this.ctx.lineTo(floorW - tickLen, pos);
        }
      }
      this.ctx.stroke();
      this.ctx.closePath();
    }
  
    /**
     * 绘制刻度文本
     * @private
     */
    _drawTickText(isHorizontal, w, h, controlStart, controlEnd, center) {
      const maxLength = isHorizontal ? w : h;
      const { MAJOR_TICK_INTERVAL } = RulerCore.RULER_CONFIG;
  
      this.ctx.textAlign = "center";
      for (let i = 0; i <= maxLength; i += MAJOR_TICK_INTERVAL) {
        if (i >= controlStart && i <= controlEnd) continue;
        const pos = Math.floor(i);
        this.ctx.fillText(
          i.toString(),
          isHorizontal ? pos : center,
          isHorizontal ? center : pos
        );
      }
    }
  
    /**
     * 绘制鼠标标线
     * @private
     */
    _drawMouseLine(isHorizontal, floorW, floorH, controlStart, controlEnd, center) {
      if (!this.winPos.x || !this.winPos.y) return;
  
      const [localX, localY] = [
        Math.floor(this.mousePos.x - this.winPos.x),
        Math.floor(this.mousePos.y - this.winPos.y)
      ];
  
      this.ctx.strokeStyle = "#ff4444";
      this.ctx.lineWidth = 1;
      this.ctx.globalAlpha = 0.7;
  
      this.ctx.beginPath();
      if (isHorizontal) {
        if (localX < controlStart || localX > controlEnd) {
          this.ctx.moveTo(localX, 0);
          this.ctx.lineTo(localX, floorH);
        }
      } else {
        if (localY < controlStart || localY > controlEnd) {
          this.ctx.moveTo(0, localY);
          this.ctx.lineTo(floorW, localY);
        }
      }
      this.ctx.stroke();
      this.ctx.closePath();
      this.ctx.globalAlpha = 1;
    }
  
    /**
     * 绘制边框
     * @private
     */
    _drawBorder(floorW, floorH) {
      this.ctx.strokeStyle = "#ccc";
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.rect(0, 0, floorW, floorH);
      this.ctx.stroke();
      this.ctx.closePath();
    }
  
    /**
     * 计算切换类型后的新尺寸
     * @returns {Object} { width, height }
     */
    calculateNewSize() {
      return this.type === "horizontal"
        ? { width: RulerCore.FIXED_EDGE_SIZE, height: this.size.width }
        : { width: this.size.height, height: RulerCore.FIXED_EDGE_SIZE };
    }
  }