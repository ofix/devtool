import EMARenderer from './EMARenderer';
import VolumeRenderer from './VolumeRenderer';
import KlineInfoPanel from './KlineInfoPanel';

class KlineRenderer {
    constructor(canvas, config = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.config = {
            theme: 'dark',
            colors: {
                up: '#ef5350',
                down: '#26a69a',
                limitUp: '#ff8c00',
                limitDown: '#00bcd4',
                grid: '#333333',
                text: '#999999',
                background: '#1a1a1a',
                highLight: '#ff6b6b',
                lowLight: '#4ecdc4',
                crosshair: '#ffffff'
            },
            showEMA: [10, 20, 30, 60, 99],
            ...config
        };

        // 业务数据
        this.data = [];
        this.viewRange = { start: 0, end: 0 };

        // 布局尺寸
        this.mainChartHeight = 0;
        this.volumeChartHeight = 0;
        this.chartTop = 20;
        this.chartLeft = 50;
        this.chartRight = 20;
        this.chartWidth = 0;

        // K线核心布局参数（复刻Flutter）
        this.visibleCount = 0;
        this.klineStep = 0;
        this.klineWidth = 0;

        // 价格、成交量计算变量
        this.maxRangePrice = 0;
        this.minRangePrice = 0;
        this.priceRatio = 1;
        this.maxVolume = 0;

        // 鼠标状态
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartViewStart = 0;
        this.selectedIndex = -1;

        // 离屏画布
        this.offscreenCanvas = null;
        this.offscreenCtx = null;
        this.needOffscreenRedraw = true;

        // 子渲染器
        this.emaRenderer = new EMARenderer(this.ctx, this.config);
        this.infoPanel = new KlineInfoPanel(this.ctx, {
            colors: this.config.colors,
            width: 220
        });

        this.initOffscreenCanvas();
        this.setupCanvas();
        this.bindEvents();
    }

    initOffscreenCanvas () {
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d');
    }

    syncOffscreenSize () {
        this.offscreenCanvas.width = this.canvas.width;
        this.offscreenCanvas.height = this.canvas.height;
    }

    setupCanvas () {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;

        this.mainChartHeight = rect.height * 0.7;
        this.volumeChartHeight = rect.height * 0.2;
        this.chartWidth = rect.width - this.chartLeft - this.chartRight;
    }

    bindEvents () {
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleMouseLeave = this.handleMouseLeave.bind(this);
        this.handleMouseWheel = this.handleMouseWheel.bind(this);

        window.addEventListener('keydown', this.handleKeyDown);
        this.canvas.addEventListener('mousemove', this.handleMouseMove);
        this.canvas.addEventListener('mousedown', this.handleMouseDown);
        window.addEventListener('mouseup', this.handleMouseUp);
        this.canvas.addEventListener('mouseleave', this.handleMouseLeave);
        this.canvas.addEventListener('wheel', this.handleMouseWheel, { passive: false });

        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                this.resize();
            }, 100);
        });
    }

    // 计算klineStep、klineWidth 核心布局
    preCalculate () {
        const { start, end } = this.viewRange;
        if (start >= end) return;

        this.visibleCount = end - start;
        const count = Math.max(1, this.visibleCount);

        // 步长 = 图表宽度 / 可见根数
        this.klineStep = this.chartWidth / count;
        // 先算 80% 宽度, 留20%空隙
        let rawWidth = this.klineStep * 0.8;
        // 转整数（四舍五入）
        let width = Math.round(rawWidth);
        // 强制变成奇数
        if (width % 2 === 0) {
            width = width > 0 ? width - 1 : 1;
        }
        // 最小宽度限制（防止太细）
        if (width < 1) width = 1;
        this.klineWidth = width;

        // 计算价格区间
        let maxP = -Infinity, minP = Infinity;
        const hasEMA = this.config.showEMA?.length;

        for (let i = start; i < end; i++) {
            const item = this.data[i];
            maxP = Math.max(maxP, item.high);
            minP = Math.min(minP, item.low);
        }

        if (hasEMA) {
            for (const period of this.config.showEMA) {
                const emaArr = this.emaRenderer.getEMAData(period);
                if (!emaArr) continue;
                for (let i = start; i < end && i < emaArr.length; i++) {
                    const val = emaArr[i];
                    if (val == null) continue;
                    maxP = Math.max(maxP, val);
                    minP = Math.min(minP, val);
                }
            }
        }

        const pad = (maxP - minP) * 0.05;
        this.maxRangePrice = maxP + pad;
        this.minRangePrice = minP - pad;
        this.priceRatio = this.maxRangePrice - this.minRangePrice;

        // 最大成交量
        this.maxVolume = 0;
        for (let i = start; i < end; i++) {
            this.maxVolume = Math.max(this.maxVolume, this.data[i].volume);
        }
    }

    priceToY (price) {
        if (this.priceRatio === 0) return this.chartTop + this.mainChartHeight / 2;
        return this.chartTop + (this.maxRangePrice - price) / this.priceRatio * this.mainChartHeight;
    }

    // ST 判断
    isSTStock (code) {
        return code?.includes('ST') || code?.includes('*ST');
    }

    // 正确涨跌停判断：按股票代码前缀，不依赖全局marketType
    getLimitPercent (candle, prevClose) {
        if (!prevClose || !candle.code) return { isLimit: false };

        const change = ((candle.close - prevClose) / prevClose) * 100;
        const isUp = change > 0;
        let limit = 10;

        // ST优先级最高
        if (this.isSTStock(candle.code)) {
            limit = 5;
        } else if (candle.code.startsWith('300') || candle.code.startsWith('688')) {
            // 创业板、科创板 20%
            limit = 20;
        } else if (candle.code.startsWith('43') || candle.code.startsWith('83') || candle.code.startsWith('87')) {
            // 北交所 30%
            limit = 30;
        }

        // 浮点数容错
        const match = Math.abs(Math.abs(change) - limit) < 0.08;
        return match ? { isLimit: true, type: isUp ? 'up' : 'down' } : { isLimit: false };
    }

    // 离屏绘制底层：网格、K线、成交量、EMA、坐标轴、高低点
    drawOffscreenBase () {
        const ctx = this.offscreenCtx;
        ctx.fillStyle = this.config.colors.background;
        ctx.fillRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);

        this.drawGrid(ctx);
        this.drawCandles(ctx);
        this.drawVolume(ctx);
        this.drawEMALines();
        this.drawAxisText(ctx);
        this.drawHighLowMark(ctx);
    }

    drawGrid (ctx) {
        ctx.save();
        ctx.strokeStyle = this.config.colors.grid;
        ctx.lineWidth = 0.5;
        ctx.beginPath();

        // 横线
        for (let i = 0; i <= 5; i++) {
            const y = this.chartTop + this.mainChartHeight * i / 5;
            ctx.moveTo(this.chartLeft, y);
            ctx.lineTo(this.chartLeft + this.chartWidth, y);
        }
        // 竖线
        for (let i = 0; i <= 10; i++) {
            const x = this.chartLeft + this.chartWidth * i / 10;
            ctx.moveTo(x, this.chartTop);
            ctx.lineTo(x, this.chartTop + this.mainChartHeight);
        }
        ctx.stroke();
        ctx.restore();
    }

    // 完全复刻Flutter K线绘制逻辑
    drawCandles (ctx) {
        const { start, end } = this.viewRange;
        if (start >= end) return;

        let nKline = 0;
        let prevClose = start > 0 ? this.data[start - 1].close : this.data[start].open;

        const penUp = new Paint();
        penUp.color = this.config.colors.up;
        penUp.strokeWidth = 1;
        penUp.style = 'stroke';

        const penDown = new Paint();
        penDown.color = this.config.colors.down;
        penDown.strokeWidth = 1;
        penDown.style = 'stroke';

        const fillUp = new Paint();
        fillUp.color = this.config.colors.up;
        fillUp.style = 'fill';

        const fillDown = new Paint();
        fillDown.color = this.config.colors.down;
        fillDown.style = 'fill';

        for (let i = start; i < end; i++) {
            const item = this.data[i];
            // 复刻Flutter: x = index * step
            const x = this.chartLeft + nKline * this.klineStep;
            // 中心线: x + klineWidth/2
            const centerX = x + this.klineWidth / 2;

            const highY = this.priceToY(item.high);
            const lowY = this.priceToY(item.low);
            const openY = this.priceToY(item.open);
            const closeY = this.priceToY(item.close);

            const isUp = item.close > item.open;
            const isDown = item.close < item.open;
            const limitInfo = this.getLimitPercent(item, prevClose);

            // 绘制上下影线（居中中心线）
            ctx.beginPath();
            ctx.moveTo(centerX, highY);
            ctx.lineTo(centerX, lowY);
            ctx.strokeStyle = isUp ? this.config.colors.up : this.config.colors.down;
            ctx.lineWidth = 1;
            ctx.stroke();

            // 绘制实体
            if (Math.abs(item.close - item.open) > 0.001) {
                const rectTop = isUp ? closeY : openY;
                const rectBot = isUp ? openY : closeY;
                ctx.fillStyle = isUp ? this.config.colors.up : this.config.colors.down;
                ctx.fillRect(x, rectTop, this.klineWidth, rectBot - rectTop);
            } else {
                // 一字板
                ctx.beginPath();
                ctx.moveTo(x, closeY);
                ctx.lineTo(x + this.klineWidth, closeY);
                ctx.stroke();
            }

            nKline++;
        }
    }

    drawVolume (ctx) {
        if (this.maxVolume === 0) return;
        const { start, end } = this.viewRange;
        let nKline = 0;

        const volTop = this.chartTop + this.mainChartHeight + 10;
        const volHeight = this.volumeChartHeight;

        for (let i = start; i < end; i++) {
            const item = this.data[i];
            const x = this.chartLeft + nKline * this.klineStep;
            const h = (item.volume / this.maxVolume) * volHeight;
            const y = volTop + volHeight - h;

            const isUp = item.close >= item.open;
            ctx.fillStyle = isUp ? this.config.colors.up : this.config.colors.down;
            ctx.fillRect(x, y, this.klineWidth, Math.max(1, h));

            nKline++;
        }
    }

    drawEMALines () {
        if (!this.config.showEMA?.length) return;
        this.emaRenderer.renderWithRange(
            this.data,
            this.viewRange,
            this.maxRangePrice,
            this.minRangePrice,
            this.mainChartHeight,
            this.chartTop,
            this.config.showEMA,
            this.offscreenCtx
        );
    }

    drawAxisText (ctx) {
        if (this.priceRatio === 0) return;
        ctx.save();
        ctx.fillStyle = this.config.colors.text;
        ctx.font = '11px Arial';

        for (let i = 0; i <= 5; i++) {
            const p = this.minRangePrice + this.priceRatio * i / 5;
            const y = this.priceToY(p);
            ctx.fillText(p.toFixed(2), 5, y + 4);
        }
        ctx.restore();
    }

    drawHighLowMark (ctx) {
        const { start, end } = this.viewRange;
        let maxP = -Infinity, minP = Infinity;
        let maxIdx = start, minIdx = start;

        for (let i = start; i < end; i++) {
            const item = this.data[i];
            if (item.high > maxP) { maxP = item.high; maxIdx = i; }
            if (item.low < minP) { minP = item.low; minIdx = i; }
        }

        const offsetMax = maxIdx - start;
        const offsetMin = minIdx - start;

        const xMax = this.chartLeft + offsetMax * this.klineStep + this.klineWidth / 2;
        const xMin = this.chartLeft + offsetMin * this.klineStep + this.klineWidth / 2;

        const yMax = this.priceToY(maxP);
        const yMin = this.priceToY(minP);

        // 简易高低点标记
        ctx.fillStyle = this.config.colors.highLight;
        ctx.fillText(maxP.toFixed(2), xMax - 20, yMax - 4);
        ctx.fillStyle = this.config.colors.lowLight;
        ctx.fillText(minP.toFixed(2), xMin - 20, yMin + 12);
    }

    // 绘制十字线、选中叠加层
    drawOverlay () {
        if (this.selectedIndex === -1) return;
        const idx = this.selectedIndex;
        const offset = idx - this.viewRange.start;
        const x = this.chartLeft + offset * this.klineStep + this.klineWidth / 2;

        const item = this.data[idx];
        const y = this.priceToY(item.close);

        this.ctx.save();
        this.ctx.strokeStyle = this.config.colors.crosshair;
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);

        this.ctx.beginPath();
        this.ctx.moveTo(x, this.chartTop);
        this.ctx.lineTo(x, this.chartTop + this.mainChartHeight);
        this.ctx.moveTo(this.chartLeft, y);
        this.ctx.lineTo(this.chartLeft + this.chartWidth, y);
        this.ctx.stroke();

        this.ctx.setLineDash([]);
        this.ctx.fillStyle = this.config.colors.crosshair;
        this.ctx.font = '11px Arial';
        this.ctx.fillText(item.close.toFixed(2), this.chartLeft + this.chartWidth + 4, y + 4);
        this.ctx.restore();
    }

    fullRender () {
        if (!this.data.length) return;
        this.preCalculate();

        if (this.needOffscreenRedraw) {
            this.syncOffscreenSize();
            this.drawOffscreenBase();
            this.needOffscreenRedraw = false;
        }

        this.ctx.drawImage(this.offscreenCanvas, 0, 0);
        this.drawOverlay();
    }

    layerRender () {
        if (!this.data.length) return;
        this.ctx.drawImage(this.offscreenCanvas, 0, 0);
        this.drawOverlay();
    }

    zoom (direction) {
        const total = this.data.length;
        if (total === 0) return;

        const oldStart = this.viewRange.start;
        const oldEnd = this.viewRange.end;
        const oldSize = oldEnd - oldStart;

        // 行业标准缩放系数
        const scale = direction === 'in' ? 0.7 : 1.3;
        let newSize = Math.max(1, Math.min(Math.round(oldSize * scale), total));

        // ==========================================
        // 【核心专业逻辑】
        // 1. 有选中K线 → 取它在屏幕上的百分比位置
        // 2. 无选中 → 取屏幕中心 50%
        // ==========================================
        let screenPercent = 0.5; // 默认居中

        if (this.selectedIndex >= 0 && this.selectedIndex < total) {
            // 计算选中K线在【当前视图】中的百分比位置（0~1）
            // 这个百分比在缩放中【永久保持不变】
            screenPercent = (this.selectedIndex - oldStart) / oldSize;
        }

        // ==========================================
        // 根据固定百分比，计算新的视图范围
        // ==========================================
        const newStart = this.selectedIndex - newSize * screenPercent;
        const newEnd = newStart + newSize;

        this.viewRange.start = Math.round(newStart);
        this.viewRange.end = Math.round(newEnd);

        this.needOffscreenRedraw = true;
        this.fullRender();
    }

    handleMouseWheel (e) {
        e.preventDefault();
        this.zoom(e.deltaY > 0 ? 'out' : 'in');
    }

    handleMouseDown (e) {
        const rect = this.canvas.getBoundingClientRect();
        this.dragStartX = e.clientX - rect.left;
        this.dragStartViewStart = this.viewRange.start;
        this.isDragging = true;
        this.canvas.style.cursor = 'grabbing';
    }

    handleMouseMove (e) {
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        if (this.isDragging) {
            const delta = mx - this.dragStartX;
            const shiftCount = Math.round(-delta / this.klineStep);
            this.viewRange.start = this.dragStartViewStart + shiftCount;

            this.needOffscreenRedraw = true;
            this.fullRender();
            return;
        }

        // 拾取K线下标
        if (mx >= this.chartLeft && mx <= this.chartLeft + this.chartWidth) {
            const relX = mx - this.chartLeft;
            const idxInView = Math.floor(relX / this.klineStep);
            const realIdx = this.viewRange.start + idxInView;
            if (realIdx >= this.viewRange.start && realIdx < this.viewRange.end) {
                if (this.selectedIndex !== realIdx) {
                    this.selectedIndex = realIdx;
                    this.layerRender();
                }
                return;
            }
        }

        if (this.selectedIndex !== -1) {
            this.selectedIndex = -1;
            this.layerRender();
        }
    }

    handleMouseUp () {
        this.isDragging = false;
        this.canvas.style.cursor = 'default';
    }

    handleMouseLeave () {
        this.isDragging = false;
        this.selectedIndex = -1;
        this.layerRender();
    }

    handleKeyDown (e) {
        switch (e.key) {
            case 'ArrowUp':
                e.preventDefault();
                this.zoom('in');
                break;
            case 'ArrowDown':
                e.preventDefault();
                this.zoom('out');
                break;
        }
    }

    setData (list) {
        this.data = list || [];
        this.initViewRange();
        this.needOffscreenRedraw = true;
        this.emaRenderer.updateKlineData(this.data);
        this.fullRender();
    }

    initViewRange () {
        if (this.data.length > 120) {
            this.viewRange.start = this.data.length - 120;
            this.viewRange.end = this.data.length; // 默认显示最近120根
        } else {
            this.viewRange.start = 0;
            this.viewRange.end = this.data.length; // 显示全部
        }
    }

    render () {
        this.fullRender();
    }

    resize () {
        this.setupCanvas();
        this.needOffscreenRedraw = true;
        this.fullRender();
    }

    destroy () {
        window.removeEventListener('keydown', this.handleKeyDown);
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('mousedown', this.handleMouseDown);
        window.removeEventListener('mouseup', this.handleMouseUp);
        this.canvas.removeEventListener('mouseleave', this.handleMouseLeave);
        this.canvas.removeEventListener('wheel', this.handleMouseWheel);
    }
}

export default KlineRenderer;