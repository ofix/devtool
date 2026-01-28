export default class ScreenRuler {
    // 静态常量配置（适配FastStone刻度标准）
    static get FIXED_EDGE_SIZE() { return 100; }
    static get RULER_CONFIG() {
        return {
            // 三层刻度间隔（FastStone标准）
            MAJOR_TICK_INTERVAL: 50,    // 主刻度：50px
            MINOR_TICK_INTERVAL: 10,    // 次刻度：10px
            FINE_TICK_INTERVAL: 1,      // 微刻度：1px
            // 三层刻度长度（FastStone视觉比例）
            MAJOR_TICK_LENGTH: 14,      // 主刻度长度
            MINOR_TICK_LENGTH: 9,       // 次刻度长度
            FINE_TICK_LENGTH: 7,        // 微刻度长度
            // 其他配置
            CONTROL_AREA_SIZE: 80,
            TEXT_FONT: "11px Arial, Helvetica, sans-serif",
            TEXT_OFFSET: 22,            // 文本距离标尺边缘的偏移
            DEFAULT_SIZE: { width: 800, height: 100 }
        };
    }

    /**
     * 构造函数
     * @param {HTMLCanvasElement} canvas - 画布元素
     * @param {Object} options - 初始化选项
     */
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");

        // 初始化配置
        this.type = options.type || "horizontal"; // horizontal/vertical
        this.winPos = options.winPos || { x: 0, y: 0 };
        this.mousePos = { x: 0, y: 0 };
        this.size = {
            width: options.width || ScreenRuler.RULER_CONFIG.DEFAULT_SIZE.width,
            height: options.height || ScreenRuler.RULER_CONFIG.DEFAULT_SIZE.height
        };

        // 初始化画布上下文和尺寸
        this._initContext();

        // 首次绘制
        this.redraw();
    }

    /**
     * 初始化画布上下文（禁用抗锯齿）
     * @private
     */
    _initContext() {
        if (!this.ctx) return;

        // 禁用抗锯齿，保证刻度清晰
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.webkitImageSmoothingEnabled = false;
        this.ctx.msImageSmoothingEnabled = false;

        // 文本默认对齐方式
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";

        // 设置画布尺寸
        const { fixed, dynamic } = this.getCanvasSize();
        this.canvas.width = fixed;
        this.canvas.height = dynamic;
        this.canvas.style.width = `${fixed}px`;
        this.canvas.style.height = `${dynamic}px`;
    }

    /**
     * 计算画布尺寸
     * @returns {Object} { fixed, dynamic }
     */
    getCanvasSize() {
        return {
            fixed: this.type === "horizontal"
                ? this.size.width
                : ScreenRuler.FIXED_EDGE_SIZE,
            dynamic: this.type === "horizontal"
                ? ScreenRuler.FIXED_EDGE_SIZE
                : this.size.height
        };
    }

    /**
     * 更新标尺类型（横/竖）
     * @param {string} newType - horizontal/vertical
     */
    updateType(newType) {
        if (!["horizontal", "vertical"].includes(newType)) return;

        this.type = newType;
        this._initContext();
        this.redraw();
    }

    /**
     * 更新标尺尺寸
     * @param {number} width - 宽度
     * @param {number} height - 高度
     */
    updateSize(width, height) {
        if (!width || !height || width <= 0 || height <= 0) return;

        this.size = { width, height };
        this._initContext();
        this.redraw();
    }

    /**
     * 更新窗口位置
     * @param {Object} pos - { x, y }
     */
    updateWinPos(pos) {
        if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return;
        this.winPos = pos;
        this.redraw();
    }

    /**
     * 更新鼠标位置
     * @param {Object} pos - { x, y }
     */
    updateMousePos(pos) {
        if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return;
        this.mousePos = pos;
        this.redraw();
    }

    /**
     * 核心绘制逻辑
     */
    redraw() {
        if (!this.ctx || !this.canvas) return;

        this.ctx.save();

        const isHorizontal = this.type === "horizontal";
        const { fixed: w, dynamic: h } = this.getCanvasSize();
        const [floorW, floorH] = [Math.floor(w), Math.floor(h)];

        // 清空画布并绘制背景
        this.ctx.clearRect(0, 0, floorW, floorH);
        this.ctx.fillStyle = "rgba(220, 250, 245, 0.9)";
        this.ctx.fillRect(0, 0, floorW, floorH);

        // 计算控制区域（中间无刻度区域）
        const center = Math.floor(isHorizontal ? h / 2 : w / 2);
        const { CONTROL_AREA_SIZE } = ScreenRuler.RULER_CONFIG;

        // 设置基础样式
        this.ctx.strokeStyle = "#333";
        this.ctx.fillStyle = "#000";
        this.ctx.lineWidth = 1;
        this.ctx.font = ScreenRuler.RULER_CONFIG.TEXT_FONT;

        // 绘制三层刻度（核心优化）
        this._drawThreeLevelTicks(isHorizontal, floorW, floorH, center);

        // 绘制主刻度文本
        this._drawTickText(isHorizontal, floorW, floorH, center);

        // 绘制鼠标标线（取消注释启用）
        // this._drawMouseLine(isHorizontal, floorW, floorH, center - CONTROL_AREA_SIZE/2, center + CONTROL_AREA_SIZE/2, center);

        // 绘制边框
        this._drawBorder(floorW, floorH);

        this.ctx.restore();
    }

    /**
     * 绘制三层刻度（核心修改：微刻度添加1px间距）
     * @private
     */
    _drawThreeLevelTicks(isHorizontal, w, h) {
        const maxLength = isHorizontal ? w : h;
        const config = ScreenRuler.RULER_CONFIG;

        if (maxLength <= 0) return;

        // 强制关闭所有抗锯齿相关设置
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.webkitImageSmoothingEnabled = false;
        this.ctx.msImageSmoothingEnabled = false;
        this.ctx.lineCap = 'butt'; // 线条端点为直角，避免圆角扩散

        // 主刻度（50px间隔)
        this.ctx.beginPath();
        this.ctx.strokeStyle = "#000";
        this.ctx.lineWidth = 1; // 主刻度宽度
        for (let i = 0; i <= maxLength; i += config.MAJOR_TICK_INTERVAL) {
            if (i == 0) continue;
            const pos = i + 0.5;
            if (isHorizontal) {
                this.ctx.moveTo(pos, 0);
                this.ctx.lineTo(pos, config.MAJOR_TICK_LENGTH);
                this.ctx.moveTo(pos, h);
                this.ctx.lineTo(pos, h - config.MAJOR_TICK_LENGTH);
            } else {
                this.ctx.moveTo(0, pos);
                this.ctx.lineTo(config.MAJOR_TICK_LENGTH, pos);
                this.ctx.moveTo(w, pos);
                this.ctx.lineTo(w - config.MAJOR_TICK_LENGTH, pos);
            }
        }
        this.ctx.stroke();
        this.ctx.closePath();

        // 2. 次刻度（10px间隔，中等长度)
        this.ctx.beginPath();
        this.ctx.strokeStyle = "#555"; // 次刻度单独设置颜色，区分微刻度
        this.ctx.lineWidth = 1;
        for (let i = 0; i <= maxLength; i += config.MINOR_TICK_INTERVAL) {
            if (i % config.MAJOR_TICK_INTERVAL === 0) continue;
            const pos = i + 0.5; // 像素对齐
            if (isHorizontal) {
                this.ctx.moveTo(pos, 0);
                this.ctx.lineTo(pos, config.MINOR_TICK_LENGTH);
                this.ctx.moveTo(pos, h);
                this.ctx.lineTo(pos, h - config.MINOR_TICK_LENGTH);
            } else {
                this.ctx.moveTo(0, pos);
                this.ctx.lineTo(config.MINOR_TICK_LENGTH, pos);
                this.ctx.moveTo(w, pos);
                this.ctx.lineTo(w - config.MINOR_TICK_LENGTH, pos);
            }
        }
        this.ctx.stroke();
        this.ctx.closePath();

        // 微刻度
        this.ctx.beginPath();
        this.ctx.strokeStyle = "#000"; // 浅灰色，降低视觉融合度
        this.ctx.lineWidth = 1; // 微刻度用1px宽度，避免细线条模糊
        // 关键：步长改为2px，直接跳过1px，避免抗锯齿融合
        for (let i = 0; i <= maxLength; i += 2) {
            // 跳过主/次刻度（次刻度是10px，2px步长不会冲突）
            if (i % config.MAJOR_TICK_INTERVAL === 0 || i % config.MINOR_TICK_INTERVAL === 0) continue;

            const pos = i + 0.5; // 强制像素对齐
            if (isHorizontal) {
                // 微刻度长度缩短，进一步区分层级
                this.ctx.moveTo(pos, 0);
                this.ctx.lineTo(pos, config.FINE_TICK_LENGTH - 2);
                this.ctx.moveTo(pos, h);
                this.ctx.lineTo(pos, h - (config.FINE_TICK_LENGTH - 2));
            } else {
                this.ctx.moveTo(0, pos);
                this.ctx.lineTo(config.FINE_TICK_LENGTH - 2, pos);
                this.ctx.moveTo(w, pos);
                this.ctx.lineTo(w - (config.FINE_TICK_LENGTH - 2), pos);
            }
        }
        this.ctx.stroke();
        this.ctx.closePath();
    }

    /**
     * 绘制主刻度文本（FastStone风格，上下/左右都有）
     * @private
     */
    _drawTickText(isHorizontal, w, h, center) {
        const maxLength = isHorizontal ? w : h;
        const config = ScreenRuler.RULER_CONFIG;

        if (maxLength <= 0) return;

        this.ctx.fillStyle = "#000";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";

        for (let i = 0; i <= maxLength; i += config.MAJOR_TICK_INTERVAL) {
            const pos = Math.floor(i);
            if (i == 0) continue;
            if (isHorizontal) {
                // 水平标尺：上下都显示文本
                this.ctx.fillText(i.toString(), pos, config.TEXT_OFFSET);       // 上方文本
                this.ctx.fillText(i.toString(), pos, h - config.TEXT_OFFSET);   // 下方文本
            } else {
                // 垂直标尺：左右都显示文本（旋转90度）
                // 左侧文本
                this.ctx.save();
                this.ctx.translate(config.TEXT_OFFSET, pos);
                this.ctx.rotate(-Math.PI / 2);
                this.ctx.fillText(i.toString(), 0, 0);
                this.ctx.restore();

                // 右侧文本
                this.ctx.save();
                this.ctx.translate(w - config.TEXT_OFFSET, pos);
                this.ctx.rotate(-Math.PI / 2);
                this.ctx.fillText(i.toString(), 0, 0);
                this.ctx.restore();
            }
        }
    }

    /**
     * 绘制鼠标标线
     * @private
     */
    _drawMouseLine(isHorizontal, w, h, controlStart, controlEnd, center) {
        if (typeof this.winPos.x !== 'number' || typeof this.winPos.y !== 'number') return;
        if (typeof this.mousePos.x !== 'number' || typeof this.mousePos.y !== 'number') return;

        const [localX, localY] = [
            Math.floor(this.mousePos.x - this.winPos.x),
            Math.floor(this.mousePos.y - this.winPos.y)
        ];

        this.ctx.strokeStyle = "#ff4444";
        this.ctx.lineWidth = 1.5;
        this.ctx.globalAlpha = 0.8;

        this.ctx.beginPath();
        if (isHorizontal) {
            if (localX >= 0 && localX <= w && (localX < controlStart || localX > controlEnd)) {
                this.ctx.moveTo(localX, 0);
                this.ctx.lineTo(localX, h);
            }
        } else {
            if (localY >= 0 && localY <= h && (localY < controlStart || localY > controlEnd)) {
                this.ctx.moveTo(0, localY);
                this.ctx.lineTo(w, localY);
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
    _drawBorder(w, h) {
        this.ctx.strokeStyle = "#000";
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(0, h);
        this.ctx.moveTo(w, 0);
        this.ctx.lineTo(w, h);
        this.ctx.stroke();
        this.ctx.closePath();
    }

    /**
     * 计算切换类型后的新尺寸
     * @returns {Object} { width, height }
     */
    calculateNewSize() {
        return this.type === "horizontal"
            ? { width: ScreenRuler.FIXED_EDGE_SIZE, height: this.size.width }
            : { width: this.size.height, height: ScreenRuler.FIXED_EDGE_SIZE };
    }
}