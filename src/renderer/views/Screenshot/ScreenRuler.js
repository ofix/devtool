export default class ScreenRuler {
    // 静态常量配置（完全对齐FastStone物理像素标准，无变更）
    static get FIXED_EDGE_SIZE() { return 100 * (window.devicePixelRatio || 1); }
    static get RULER_CONFIG() {
        return {
            // 三层刻度间隔（物理像素）
            MAJOR_TICK_INTERVAL: 50,
            MINOR_TICK_INTERVAL: 10,
            FINE_TICK_INTERVAL: 2,
            // 三层刻度长度（物理像素）
            MAJOR_TICK_LENGTH: 14,
            MINOR_TICK_LENGTH: 9,
            FINE_TICK_LENGTH: 5,
            // 基础配置（物理像素）
            CONTROL_AREA_SIZE: 80,
            TEXT_FONT_BASE: "Arial, Helvetica, sans-serif",
            TEXT_FONT_SIZE: 14 * (window.devicePixelRatio || 1),
            TEXT_OFFSET: 22 * (window.devicePixelRatio || 1),
            DEFAULT_SIZE: { width: 800 * (window.devicePixelRatio || 1), height: 100 * (window.devicePixelRatio || 1) },
            // 中心尺寸文本配置（无变更，物理像素）
            CENTER_TEXT_FONT_SIZE: 16 * (window.devicePixelRatio || 1),
            CENTER_TEXT_COLOR: "#000",
            CENTER_TEXT_BG_COLOR: "rgba(255, 255, 255, 0.8)",
            CENTER_TEXT_PADDING: 0 * (window.devicePixelRatio || 1),
            CENTER_TEXT_BORDER_RADIUS: 4 * (window.devicePixelRatio || 1)
        };
    }
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.dpr = window.devicePixelRatio || 1;
        this.type = options.type || "horizontal";
        this.winPos = options.winPos || { x: 0, y: 0 };
        this.mousePos = { x: 0, y: 0 };
        this.physicalSize = {
            width: options.width || ScreenRuler.RULER_CONFIG.DEFAULT_SIZE.width,
            height: options.height || ScreenRuler.RULER_CONFIG.DEFAULT_SIZE.height
        };
        this.cssSize = {
            width: Math.floor(this.physicalSize.width / this.dpr),
            height: Math.floor(this.physicalSize.height / this.dpr)
        };
        this._initContext();
        this.redraw();
    }

    _initContext() {
        if (!this.ctx) return;
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.webkitImageSmoothingEnabled = false;
        this.ctx.msImageSmoothingEnabled = false;
        this.ctx.lineCap = 'butt';
        this.ctx.lineJoin = 'miter';
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.canvas.width = this.physicalSize.width;
        this.canvas.height = this.physicalSize.height;
        this.canvas.style.width = `${this.cssSize.width}px`;
        this.canvas.style.height = `${this.cssSize.height}px`;
    }

    getCanvasPhysicalSize() {
        const physicalFixed = this.type === "horizontal"
            ? this.physicalSize.width
            : ScreenRuler.FIXED_EDGE_SIZE;
        const physicalDynamic = this.type === "horizontal"
            ? ScreenRuler.FIXED_EDGE_SIZE
            : this.physicalSize.height;
        return {
            fixed: Math.floor(physicalFixed),
            dynamic: Math.floor(physicalDynamic)
        };
    }

    updateType(newType) {
        if (!["horizontal", "vertical"].includes(newType)) return;
        this.type = newType;
        const { fixed, dynamic } = this.getCanvasPhysicalSize();
        this.physicalSize = {
            width: this.type === "horizontal" ? fixed : dynamic,
            height: this.type === "horizontal" ? dynamic : fixed
        };
        this.cssSize = {
            width: Math.floor(this.physicalSize.width / this.dpr),
            height: Math.floor(this.physicalSize.height / this.dpr)
        };
        this._initContext();
        this.redraw();
    }

    updateSize(width, height) {
        if (!width || !height || width <= 0 || height <= 0) return;
        this.physicalSize = {
            width: Math.floor(width * this.dpr),
            height: Math.floor(height * this.dpr)
        };
        this.cssSize = { width, height };
        this._initContext();
        this.redraw();
    }

    updateWinPos(pos) {
        if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return;
        this.winPos = pos;
        this.redraw();
    }

    updateMousePos(pos) {
        if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return;
        this.mousePos = pos;
        this.redraw();
    }

    // 核心绘制逻辑【仅新增了_centerSizeText调用，其余不变】
    redraw() {
        if (!this.ctx || !this.canvas) return;
        this.ctx.save();
        const isHorizontal = this.type === "horizontal";
        const { fixed: w, dynamic: h } = this.getCanvasPhysicalSize();
        const [floorW, floorH] = [Math.floor(w), Math.floor(h)];

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = "rgba(220, 250, 245, 0.9)";
        this.ctx.fillRect(0, 0, floorW, floorH);

        const center = Math.floor((isHorizontal ? ScreenRuler.FIXED_EDGE_SIZE : ScreenRuler.FIXED_EDGE_SIZE) / 2);
        this.ctx.strokeStyle = "#000";
        this.ctx.fillStyle = "#000";
        this.ctx.lineWidth = 1;
        this.ctx.font = `bold ${ScreenRuler.RULER_CONFIG.TEXT_FONT_SIZE}px ${ScreenRuler.RULER_CONFIG.TEXT_FONT_BASE}`;

        this._drawThreeLevelTicks(isHorizontal, floorW, floorH, center);
        this._drawTickText(isHorizontal, floorW, floorH, center);
        // 绘制中心物理像素尺寸【核心保留】
        this._drawCenterSizeText(isHorizontal, floorW, floorH);
        this._drawBorder(floorW, floorH);

        this.ctx.restore();
    }

    // 三层刻度绘制
    _drawThreeLevelTicks(isHorizontal, w, h) {
        const config = ScreenRuler.RULER_CONFIG;
        const physicalMaxLength = isHorizontal ? this.physicalSize.width : this.physicalSize.height;
        if (physicalMaxLength <= 0) return;

        this.ctx.save();
        this.ctx.translate(0.5, 0.5);
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.webkitImageSmoothingEnabled = false;
        this.ctx.msImageSmoothingEnabled = false;
        this.ctx.lineCap = 'butt';
        this.ctx.lineJoin = 'miter';

        // 主刻度
        this.ctx.beginPath();
        this.ctx.strokeStyle = "#000";
        this.ctx.lineWidth = 1;
        for (let i = 0; i <= physicalMaxLength; i += config.MAJOR_TICK_INTERVAL) {
            if (i === 0) continue;
            const pos = Math.floor(i);
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

        // 次刻度
        this.ctx.beginPath();
        for (let i = 0; i <= physicalMaxLength; i += config.MINOR_TICK_INTERVAL) {
            if (i % config.MAJOR_TICK_INTERVAL === 0) continue;
            const pos = Math.floor(i);
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
        for (let i = 0; i <= physicalMaxLength; i += config.FINE_TICK_INTERVAL) {
            if (i % config.MAJOR_TICK_INTERVAL === 0 || i % config.MINOR_TICK_INTERVAL === 0) continue;
            const pos = Math.floor(i);
            if (isHorizontal) {
                this.ctx.moveTo(pos, 0);
                this.ctx.lineTo(pos, config.FINE_TICK_LENGTH);
                this.ctx.moveTo(pos, h);
                this.ctx.lineTo(pos, h - config.FINE_TICK_LENGTH);
            } else {
                this.ctx.moveTo(0, pos);
                this.ctx.lineTo(config.FINE_TICK_LENGTH, pos);
                this.ctx.moveTo(w, pos);
                this.ctx.lineTo(w - config.FINE_TICK_LENGTH, pos);
            }
        }
        this.ctx.stroke();
        this.ctx.closePath();
        this.ctx.restore();
    }

    // 刻度文本绘制
    _drawTickText(isHorizontal, w, h, center) {
        const config = ScreenRuler.RULER_CONFIG;
        const physicalMaxLength = isHorizontal ? this.physicalSize.width : this.physicalSize.height;
        if (physicalMaxLength <= 0) return;

        this.ctx.fillStyle = "#000";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fontSmoothingEnabled = true;
        this.ctx.webkitFontSmoothing = "antialiased";
        this.ctx.font = `${config.TEXT_FONT_SIZE}px ${config.TEXT_FONT_BASE}`;

        for (let i = 0; i <= physicalMaxLength; i += config.MAJOR_TICK_INTERVAL) {
            if (i === 0) continue;
            const pos = Math.floor(i);
            if (isHorizontal) {
                this.ctx.fillText(i.toString(), pos, config.TEXT_OFFSET);
                this.ctx.fillText(i.toString(), pos, h - config.TEXT_OFFSET);
            } else {
                this.ctx.save();
                this.ctx.translate(config.TEXT_OFFSET, pos);
                this.ctx.fillText(i.toString(), 0, 0);
                this.ctx.restore();
                this.ctx.save();
                this.ctx.translate(w - config.TEXT_OFFSET, pos);
                this.ctx.fillText(i.toString(), 0, 0);
                this.ctx.restore();
            }
        }
    }

    // ==============================================
    // 绘制中心物理像素尺寸（直接显示真实物理像素）
    // ==============================================
    _drawCenterSizeText(isHorizontal, w, h) {
        const config = ScreenRuler.RULER_CONFIG;
        // 直接使用物理像素值，不做任何转换！和标尺刻度完全一致
        const displayValue = isHorizontal
            ? Math.floor(this.physicalSize.width)  // 横向=物理宽度
            : Math.floor(this.physicalSize.height); // 纵向=物理高度
        let displayText = "";
        if (this.type === "horizontal") {
            displayText = `W=${displayValue} px`;
        } else {
            displayText = `H=${displayValue} px`;
        }

        // 中心坐标（物理像素，整数对齐，避免模糊）
        let centerX = Math.floor(w / 2);
        let centerY = Math.floor(h / 2);
        if (this.type == "vertical") {
            //  计算主刻度间隔（物理像素，和标尺刻度完全一致）
            const majorTickInterval = config.MAJOR_TICK_INTERVAL;
            // 找到中心位置最近的下方主刻度
            const nearestMajorTick = Math.floor(centerY / majorTickInterval) * majorTickInterval;
            // 计算两个主刻度的中间间隙（安全位置）
            // 规则：放在「中心下方刻度」和「下一个刻度」的正中间
            const safeY = nearestMajorTick + Math.floor(majorTickInterval / 2);

            // 确保安全Y坐标在有效范围内（避免超出标尺）
            const minY = majorTickInterval; // 避开顶部第一个刻度
            const maxY = h - majorTickInterval; // 避开底部最后一个刻度
            centerY = Math.max(minY, Math.min(maxY, safeY));
        }

        // 文本样式（不变，物理像素配置）
        this.ctx.font = `bold ${config.CENTER_TEXT_FONT_SIZE}px ${config.TEXT_FONT_BASE}`;
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fontSmoothingEnabled = true;
        this.ctx.webkitFontSmoothing = "antialiased";

        // 绘制醒目物理像素数值（不变）
        this.ctx.fillStyle = config.CENTER_TEXT_COLOR;
        this.ctx.fillText(displayText, centerX, centerY);
    }

    // 圆角矩形辅助方法
    _drawRoundedRect(x, y, width, height, radius) {
        this.ctx.beginPath();
        this.ctx.moveTo(x + radius, y);
        this.ctx.lineTo(x + width - radius, y);
        this.ctx.arcTo(x + width, y, x + width, y + radius, radius);
        this.ctx.lineTo(x + width, y + height - radius);
        this.ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
        this.ctx.lineTo(x + radius, y + height);
        this.ctx.arcTo(x, y + height, x, y + height - radius, radius);
        this.ctx.lineTo(x, y + radius);
        this.ctx.arcTo(x, y, x + radius, y, radius);
        this.ctx.closePath();
    }

    // 边框绘制
    _drawBorder(w, h) {
        this.ctx.strokeStyle = "#000";
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(0, h);
        this.ctx.moveTo(w, 0);
        this.ctx.lineTo(w, h);
        this.ctx.stroke();
        this.ctx.closePath();
    }

    // 剩余方法
    calculateNewSize() {
        const newPhysicalWidth = this.type === "horizontal"
            ? ScreenRuler.FIXED_EDGE_SIZE
            : this.physicalSize.height;
        const newPhysicalHeight = this.type === "horizontal"
            ? this.physicalSize.width
            : ScreenRuler.FIXED_EDGE_SIZE;
        return {
            width: Math.floor(newPhysicalWidth / this.dpr),
            height: Math.floor(newPhysicalHeight / this.dpr)
        };
    }

    getCssSize() { return { ...this.cssSize }; }
    getPhysicalSize() { return { ...this.physicalSize }; }
    getCanvasSize() { return this.getCanvasPhysicalSize(); }
}