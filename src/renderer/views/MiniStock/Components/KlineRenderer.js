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
                crosshair: '#ffffff',
                ...config.colors
            },
            showEMA: [10, 20, 30],
            marketType: 'main',
            ...config
        };

        this.data = [];
        this.viewRange = { start: 0, end: 100 };
        this.candleWidth = 8;
        this.candleSpacing = 2;
        this.selectedIndex = -1;

        this.emaRenderer = new EMARenderer(this.ctx, this.config);
        this.volumeRenderer = new VolumeRenderer(this.ctx, this.config);
        this.infoPanel = new KlineInfoPanel(this.ctx, {
            colors: this.config.colors,
            width: 220
        });

        this.setupCanvas();
        this.bindEvents();
    }

    bindEvents() {
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleMouseLeave = this.handleMouseLeave.bind(this);

        window.addEventListener('keydown', this.handleKeyDown);
        this.canvas.addEventListener('mousemove', this.handleMouseMove);
        this.canvas.addEventListener('mousedown', this.handleMouseDown);
        window.addEventListener('mouseup', this.handleMouseUp);
        this.canvas.addEventListener('mouseleave', this.handleMouseLeave);

        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => this.resize(), 100);
        });
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // 检查是否在拖动面板
        if (this.infoPanel.isDragging) {
            this.infoPanel.onDrag(mouseX, mouseY, this.canvas.width, this.canvas.height);
            this.render();
            return;
        }

        // 检查是否点击在信息面板上（用于拖动检测）
        if (this.infoPanel.isPointInside(mouseX, mouseY)) {
            this.canvas.style.cursor = 'move';
            return;
        } else {
            this.canvas.style.cursor = 'default';
        }

        // 检查是否在图表区域内
        if (mouseX >= this.chartLeft && mouseX <= this.chartLeft + this.chartWidth &&
            mouseY >= this.chartTop && mouseY <= this.chartTop + this.mainChartHeight) {
            const selectedIndex = this.getIndexFromX(mouseX);
            if (selectedIndex !== this.selectedIndex) {
                this.selectedIndex = selectedIndex;
                this.updateInfoPanelData();
                this.render();
            }
        } else if (this.selectedIndex !== -1) {
            this.selectedIndex = -1;
            this.infoPanel.reset();
            this.render();
        }
    }

    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // 检查是否点击在信息面板上
        if (this.infoPanel.isPointInside(mouseX, mouseY)) {
            this.infoPanel.startDrag(mouseX, mouseY);
            e.preventDefault();
        }
    }

    handleMouseUp() {
        this.infoPanel.endDrag();
    }

    handleMouseLeave() {
        this.selectedIndex = -1;
        this.infoPanel.reset();
        this.render();
    }

    updateInfoPanelData() {
        if (this.selectedIndex !== -1 && this.data[this.selectedIndex]) {
            const selectedCandle = this.data[this.selectedIndex];
            const prevCandle = this.selectedIndex > 0 ? this.data[this.selectedIndex - 1] : null;

            // 绑定涨跌停判断函数
            const getLimitPercentFn = (candle, prevClose) => {
                return this.getLimitPercent(candle, prevClose);
            };

            this.infoPanel.setData(
                this.selectedIndex,
                selectedCandle,
                prevCandle,
                getLimitPercentFn
            );
        } else {
            this.infoPanel.reset();
        }
    }

    moveSelection(direction) {
        if (this.data.length === 0) return;

        let newIndex = this.selectedIndex;
        if (direction === 'left') {
            newIndex = this.selectedIndex > 0 ? this.selectedIndex - 1 : 0;
        } else {
            newIndex = this.selectedIndex < this.data.length - 1 ? this.selectedIndex + 1 : this.data.length - 1;
        }

        if (newIndex !== this.selectedIndex) {
            this.selectedIndex = newIndex;
            this.updateInfoPanelData();

            // 自动滚动视图
            if (this.selectedIndex < this.viewRange.start) {
                this.viewRange.start = Math.max(0, this.selectedIndex);
                this.viewRange.end = Math.min(this.data.length, this.viewRange.start + (this.viewRange.end - this.viewRange.start));
                this.updateViewRange();
            } else if (this.selectedIndex >= this.viewRange.end) {
                this.viewRange.end = Math.min(this.data.length, this.selectedIndex + 1);
                this.viewRange.start = Math.max(0, this.viewRange.end - (this.viewRange.end - this.viewRange.start));
                this.updateViewRange();
            }

            this.render();
        }
    }

    setData(data) {
        this.data = data;
        this.updateViewRange();
        this.calculateIndicators();
        this.selectedIndex = this.data.length > 0 ? this.data.length - 1 : -1;
        this.updateInfoPanelData();
        this.render();
    }

    setupCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.mainChartHeight = rect.height * 0.7;
        this.volumeChartHeight = rect.height * 0.2;
        this.chartTop = 20;
        this.chartLeft = 50;
        this.chartRight = 20;
        this.chartWidth = rect.width - this.chartLeft - this.chartRight;
    }

    handleKeyDown(e) {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.zoom('in');
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.zoom('out');
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            this.moveSelection('left');
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            this.moveSelection('right');
        }
    }


    getIndexFromX(x) {
        const { start, end } = this.viewRange;
        const visibleCount = end - start;
        const candleTotalWidth = this.candleWidth + this.candleSpacing;
        const maxCandles = Math.floor(this.chartWidth / candleTotalWidth);

        let actualCandleWidth = this.candleWidth;
        if (visibleCount > maxCandles) {
            actualCandleWidth = (this.chartWidth / visibleCount) - this.candleSpacing;
        }

        const relativeX = x - this.chartLeft;
        const index = Math.floor(relativeX / (actualCandleWidth + this.candleSpacing));

        if (index >= 0 && index < visibleCount) {
            return start + index;
        }

        return -1;
    }

    getXFromIndex(index) {
        const { start } = this.viewRange;
        const visibleCount = this.viewRange.end - this.viewRange.start;
        const candleTotalWidth = this.candleWidth + this.candleSpacing;
        const maxCandles = Math.floor(this.chartWidth / candleTotalWidth);

        let actualCandleWidth = this.candleWidth;
        if (visibleCount > maxCandles) {
            actualCandleWidth = (this.chartWidth / visibleCount) - this.candleSpacing;
        }

        const relativeIndex = index - start;
        return this.chartLeft + relativeIndex * (actualCandleWidth + this.candleSpacing) + actualCandleWidth / 2;
    }

    updateViewRange() {
        if (!this.data.length) return;

        const totalCandles = this.data.length;
        const visibleCandles = Math.floor(this.chartWidth / (this.candleWidth + this.candleSpacing));

        let end = this.viewRange.start + visibleCandles;
        if (end > totalCandles) {
            end = totalCandles;
            this.viewRange.start = Math.max(0, end - visibleCandles);
        }

        this.viewRange.end = end;
    }

    calculateIndicators() {
        const emaPeriods = [...new Set([...this.config.showEMA, 10, 20, 30, 60, 99, 255, 905])];
        emaPeriods.forEach(period => {
            this.emaRenderer.calculateEMA(this.data, period);
        });
    }

    isSTStock(stockCode) {
        return stockCode && (stockCode.includes('ST') || stockCode.includes('*ST'));
    }

    getLimitPercent(candle, prevClose) {
        if (!prevClose || prevClose === 0) return null;

        const changePercent = ((candle.close - prevClose) / prevClose) * 100;
        const isUp = candle.close >= prevClose;

        let limitPercent = 10;

        if (this.config.marketType === 'chiNext') {
            limitPercent = 20;
        } else if (this.config.marketType === 'star') {
            limitPercent = 20;
        } else if (this.isSTStock(candle.code)) {
            limitPercent = 5;
        }

        if (isUp && Math.abs(changePercent - limitPercent) < 0.01) {
            return { isLimit: true, type: 'up', percent: limitPercent };
        } else if (!isUp && Math.abs(changePercent + limitPercent) < 0.01) {
            return { isLimit: true, type: 'down', percent: limitPercent };
        }

        return { isLimit: false };
    }

    getPriceRange() {
        const { start, end } = this.viewRange;
        let maxPrice = -Infinity;
        let minPrice = Infinity;

        for (let i = start; i < end; i++) {
            const candle = this.data[i];
            if (candle.high > maxPrice) maxPrice = candle.high;
            if (candle.low < minPrice) minPrice = candle.low;
        }

        if (this.config.showEMA && this.config.showEMA.length > 0) {
            for (let period of this.config.showEMA) {
                const emaData = this.emaRenderer.getEMAData(period);
                if (emaData && emaData.length) {
                    for (let i = start; i < end && i < emaData.length; i++) {
                        const emaValue = emaData[i];
                        if (emaValue !== null && emaValue !== undefined) {
                            if (emaValue > maxPrice) maxPrice = emaValue;
                            if (emaValue < minPrice) minPrice = emaValue;
                        }
                    }
                }
            }
        }

        const padding = (maxPrice - minPrice) * 0.05;
        return {
            max: maxPrice + padding,
            min: minPrice - padding
        };
    }

    getActualHighLow() {
        const { start, end } = this.viewRange;
        let high = -Infinity;
        let low = Infinity;
        let highIndex = start;
        let lowIndex = start;

        for (let i = start; i < end; i++) {
            const candle = this.data[i];
            if (candle.high > high) {
                high = candle.high;
                highIndex = i;
            }
            if (candle.low < low) {
                low = candle.low;
                lowIndex = i;
            }
        }

        return { high, low, highIndex, lowIndex };
    }

    getMaxVolume() {
        const { start, end } = this.viewRange;
        let maxVolume = 0;

        for (let i = start; i < end; i++) {
            const volume = this.data[i].volume;
            if (volume > maxVolume) maxVolume = volume;
        }

        return maxVolume;
    }

    drawGrid() {
        const { ctx, canvas, mainChartHeight, chartTop, config, chartLeft, chartRight, chartWidth } = this;

        ctx.save();
        ctx.strokeStyle = config.colors.grid;
        ctx.lineWidth = 0.5;
        ctx.beginPath();

        const horizontalLines = 5;
        for (let i = 0; i <= horizontalLines; i++) {
            const y = chartTop + (mainChartHeight / horizontalLines) * i;
            ctx.moveTo(chartLeft, y);
            ctx.lineTo(canvas.width - chartRight, y);
        }

        for (let i = 0; i <= 10; i++) {
            const x = chartLeft + (chartWidth / 10) * i;
            ctx.moveTo(x, chartTop);
            ctx.lineTo(x, chartTop + mainChartHeight);
        }

        ctx.stroke();
        ctx.restore();
    }

    drawCandlesticks() {
        const { start, end } = this.viewRange;
        if (start >= end) return;

        const { max: maxPrice, min: minPrice } = this.getPriceRange();
        const priceRange = maxPrice - minPrice;
        if (priceRange === 0) return;

        const { chartLeft, chartWidth, mainChartHeight, chartTop, candleSpacing, ctx, config } = this;
        const visibleCount = end - start;
        const candleTotalWidth = this.candleWidth + candleSpacing;
        const maxCandles = Math.floor(chartWidth / candleTotalWidth);

        let candleWidth = this.candleWidth;
        if (visibleCount > maxCandles) {
            candleWidth = (chartWidth / visibleCount) - candleSpacing;
        }

        ctx.save();

        for (let i = 0; i < visibleCount; i++) {
            const candle = this.data[start + i];
            const x = chartLeft + i * (candleWidth + candleSpacing);

            const yHigh = this.priceToY(candle.high, maxPrice, minPrice, mainChartHeight, chartTop);
            const yLow = this.priceToY(candle.low, maxPrice, minPrice, mainChartHeight, chartTop);
            const yOpen = this.priceToY(candle.open, maxPrice, minPrice, mainChartHeight, chartTop);
            const yClose = this.priceToY(candle.close, maxPrice, minPrice, mainChartHeight, chartTop);

            const isUp = candle.close >= candle.open;

            const prevClose = i > 0 ? this.data[start + i - 1].close : candle.open;
            const limitInfo = this.getLimitPercent(candle, prevClose);

            let color;
            let isLimit = false;

            if (limitInfo.isLimit) {
                isLimit = true;
                color = limitInfo.type === 'up' ? config.colors.limitUp : config.colors.limitDown;
            } else {
                color = isUp ? config.colors.up : config.colors.down;
            }

            ctx.fillStyle = color;
            ctx.strokeStyle = color;

            ctx.beginPath();
            ctx.moveTo(x + candleWidth / 2, yHigh);
            ctx.lineTo(x + candleWidth / 2, yLow);
            ctx.stroke();

            const bodyTop = Math.min(yOpen, yClose);
            const bodyHeight = Math.abs(yClose - yOpen);

            if (bodyHeight > 0) {
                ctx.fillRect(x, bodyTop, candleWidth, Math.max(1, bodyHeight));
            }

            if (isLimit) {
                this.drawLimitLine(x, candleWidth, yHigh, yLow, limitInfo.type);
            }
        }

        ctx.restore();
    }

    drawLimitLine(x, candleWidth, yHigh, yLow, type) {
        const { ctx } = this;
        const centerX = x + candleWidth / 2;
        const lineLength = candleWidth * 0.8;
        const lineWidth = 2;

        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.fillStyle = '#ffffff';
        ctx.lineWidth = lineWidth;

        if (type === 'up') {
            const y = yHigh - 2;
            ctx.beginPath();
            ctx.moveTo(centerX - lineLength / 2, y);
            ctx.lineTo(centerX + lineLength / 2, y);
            ctx.stroke();
        } else {
            const y = yLow + 2;
            ctx.beginPath();
            ctx.moveTo(centerX - lineLength / 2, y);
            ctx.lineTo(centerX + lineLength / 2, y);
            ctx.stroke();
        }

        ctx.restore();
    }

    drawCrosshair() {
        if (this.selectedIndex === -1) return;

        const { max: maxPrice, min: minPrice } = this.getPriceRange();
        const { mainChartHeight, chartTop, chartLeft, chartWidth, ctx, config } = this;

        const x = this.getXFromIndex(this.selectedIndex);
        const selectedCandle = this.data[this.selectedIndex];
        const y = this.priceToY(selectedCandle.close, maxPrice, minPrice, mainChartHeight, chartTop);

        ctx.save();
        ctx.strokeStyle = config.colors.crosshair;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);

        // 垂直十字线
        ctx.beginPath();
        ctx.moveTo(x, chartTop);
        ctx.lineTo(x, chartTop + mainChartHeight);
        ctx.stroke();

        // 水平十字线
        ctx.beginPath();
        ctx.moveTo(chartLeft, y);
        ctx.lineTo(chartLeft + chartWidth, y);
        ctx.stroke();

        // 绘制坐标值
        ctx.setLineDash([]);
        ctx.font = '11px Arial';
        ctx.fillStyle = config.colors.crosshair;
        ctx.fillText(selectedCandle.close.toFixed(2), chartLeft + chartWidth + 5, y + 4);

        // 绘制选中K线的高亮边框
        const visibleCount = this.viewRange.end - this.viewRange.start;
        const candleTotalWidth = this.candleWidth + this.candleSpacing;
        const maxCandles = Math.floor(this.chartWidth / candleTotalWidth);

        let actualCandleWidth = this.candleWidth;
        if (visibleCount > maxCandles) {
            actualCandleWidth = (this.chartWidth / visibleCount) - this.candleSpacing;
        }

        const candleX = this.chartLeft + (this.selectedIndex - this.viewRange.start) * (actualCandleWidth + this.candleSpacing);
        ctx.strokeStyle = config.colors.crosshair;
        ctx.lineWidth = 2;
        ctx.strokeRect(candleX, chartTop, actualCandleWidth, mainChartHeight);

        ctx.restore();
    }

    formatVolume(volume) {
        if (volume >= 100000000) {
            return (volume / 100000000).toFixed(2) + '亿';
        } else if (volume >= 10000) {
            return (volume / 10000).toFixed(2) + '万';
        }
        return volume.toString();
    }

    drawHighLowIndicators() {
        const { high, low, highIndex, lowIndex } = this.getActualHighLow();
        const { max: maxPrice, min: minPrice } = this.getPriceRange();
        const { mainChartHeight, chartTop, chartLeft, candleWidth, candleSpacing, ctx, config } = this;

        const visibleCount = this.viewRange.end - this.viewRange.start;
        const candleTotalWidth = this.candleWidth + candleSpacing;
        const maxCandles = Math.floor(this.chartWidth / candleTotalWidth);

        let actualCandleWidth = this.candleWidth;
        if (visibleCount > maxCandles) {
            actualCandleWidth = (this.chartWidth / visibleCount) - candleSpacing;
        }

        const highX = chartLeft + (highIndex - this.viewRange.start) * (actualCandleWidth + candleSpacing) + actualCandleWidth / 2;
        const highY = this.priceToY(high, maxPrice, minPrice, mainChartHeight, chartTop);

        const lowX = chartLeft + (lowIndex - this.viewRange.start) * (actualCandleWidth + candleSpacing) + actualCandleWidth / 2;
        const lowY = this.priceToY(low, maxPrice, minPrice, mainChartHeight, chartTop);

        ctx.save();
        this.drawPriceIndicator(highX, highY, high, 'high', config.colors.highLight);
        this.drawPriceIndicator(lowX, lowY, low, 'low', config.colors.lowLight);
        ctx.restore();
    }

    drawPriceIndicator(x, y, price, type, color) {
        const { ctx, canvas, chartLeft, chartRight, chartTop, mainChartHeight } = this;
        const arrowSize = 8;
        const textOffset = 5;
        const priceText = price.toFixed(2);

        ctx.font = '11px Arial';
        const textWidth = ctx.measureText(priceText).width;
        const textHeight = 14;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.5;

        let arrowX = x;
        let arrowY = y;
        let textX, textY;
        let isAbove = true;

        if (y - arrowSize < chartTop) {
            isAbove = false;
            arrowY = y + arrowSize;
        } else if (y + arrowSize > chartTop + mainChartHeight) {
            isAbove = true;
            arrowY = y - arrowSize;
        } else {
            isAbove = type === 'high';
            arrowY = isAbove ? y - arrowSize : y + arrowSize;
        }

        if (x + textWidth / 2 + textOffset > canvas.width - chartRight) {
            arrowX = Math.min(x, canvas.width - chartRight - textWidth - textOffset);
        } else if (x - textWidth / 2 - textOffset < chartLeft) {
            arrowX = Math.max(x, chartLeft + textOffset);
        } else {
            arrowX = x;
        }

        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.moveTo(x, y);
        ctx.lineTo(arrowX, arrowY);
        ctx.stroke();

        ctx.setLineDash([]);

        ctx.beginPath();
        if (isAbove) {
            ctx.moveTo(arrowX, arrowY);
            ctx.lineTo(arrowX - arrowSize / 2, arrowY + arrowSize);
            ctx.lineTo(arrowX + arrowSize / 2, arrowY + arrowSize);
        } else {
            ctx.moveTo(arrowX, arrowY);
            ctx.lineTo(arrowX - arrowSize / 2, arrowY - arrowSize);
            ctx.lineTo(arrowX + arrowSize / 2, arrowY - arrowSize);
        }
        ctx.fill();

        if (isAbove) {
            textX = arrowX - textWidth / 2;
            textY = arrowY - textOffset;
        } else {
            textX = arrowX - textWidth / 2;
            textY = arrowY + textOffset + textHeight;
        }

        textX = Math.max(chartLeft, Math.min(textX, canvas.width - chartRight - textWidth));

        ctx.fillStyle = this.config.colors.background;
        ctx.fillRect(textX - 2, textY - textHeight, textWidth + 4, textHeight + 2);

        ctx.fillStyle = color;
        ctx.fillText(priceText, textX, textY);

        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();

        ctx.restore();
    }

    drawEMALines() {
        if (!this.config.showEMA || this.config.showEMA.length === 0) return;

        const { max: maxPrice, min: minPrice } = this.getPriceRange();
        const { mainChartHeight, chartTop } = this;

        this.emaRenderer.renderWithRange(
            this.data,
            this.viewRange,
            maxPrice,
            minPrice,
            mainChartHeight,
            chartTop,
            this.config.showEMA
        );
    }

    drawVolume() {
        const { start, end } = this.viewRange;
        if (start >= end) return;

        const maxVolume = this.getMaxVolume();
        if (maxVolume === 0) return;

        const { chartLeft, candleWidth, candleSpacing, config, ctx } = this;
        const volumeChartBottom = this.chartTop + this.mainChartHeight + 10;
        const volumeChartHeight = this.volumeChartHeight;
        const visibleCount = end - start;

        ctx.save();

        for (let i = 0; i < visibleCount; i++) {
            const candle = this.data[start + i];
            const x = chartLeft + i * (candleWidth + candleSpacing);
            const volumeHeight = (candle.volume / maxVolume) * volumeChartHeight;
            const y = volumeChartBottom + volumeChartHeight - volumeHeight;

            const isUp = candle.close >= candle.open;

            const prevClose = i > 0 ? this.data[start + i - 1].close : candle.open;
            const limitInfo = this.getLimitPercent(candle, prevClose);

            if (limitInfo.isLimit) {
                ctx.fillStyle = limitInfo.type === 'up' ? config.colors.limitUp : config.colors.limitDown;
            } else {
                ctx.fillStyle = isUp ? config.colors.up : config.colors.down;
            }

            ctx.fillRect(x, y, candleWidth, Math.max(1, volumeHeight));
        }

        ctx.restore();
    }

    drawAxes() {
        const { ctx, config, chartTop, mainChartHeight } = this;
        const { max: maxPrice, min: minPrice } = this.getPriceRange();

        if (maxPrice === minPrice) return;

        ctx.fillStyle = config.colors.text;
        ctx.font = '12px Arial';
        ctx.save();

        for (let i = 0; i <= 4; i++) {
            const price = minPrice + (maxPrice - minPrice) * (i / 4);
            const y = this.priceToY(price, maxPrice, minPrice, mainChartHeight, chartTop);
            ctx.fillText(price.toFixed(2), 5, y + 4);
        }

        ctx.font = '10px Arial';
        let marketText = '';
        switch (this.config.marketType) {
            case 'chiNext':
                marketText = '创业板';
                break;
            case 'star':
                marketText = '科创板';
                break;
            default:
                marketText = '主板';
        }
        ctx.fillText(`${marketText} | 涨停板: ${this.getLimitPercentDisplay()}%`, 10, 15);

        ctx.restore();
    }

    getLimitPercentDisplay() {
        if (this.config.marketType === 'chiNext' || this.config.marketType === 'star') {
            return 20;
        }
        return 10;
    }

    priceToY(price, maxPrice, minPrice, mainChartHeight, chartTop) {
        const ratio = (price - minPrice) / (maxPrice - minPrice);
        return chartTop + mainChartHeight * (1 - ratio);
    }

    zoom(direction) {
        const zoomFactor = direction === 'in' ? 0.8 : 1.2;
        const oldWidth = this.viewRange.end - this.viewRange.start;
        let newWidth = Math.floor(oldWidth * zoomFactor);

        newWidth = Math.max(5, Math.min(newWidth, this.data.length));

        const center = this.viewRange.start + oldWidth / 2;
        let newStart = Math.floor(center - newWidth / 2);

        newStart = Math.max(0, Math.min(newStart, this.data.length - newWidth));
        const newEnd = Math.min(this.data.length, newStart + newWidth);

        this.viewRange = { start: newStart, end: newEnd };
        this.render();
    }

    render() {
        if (!this.data.length) return;

        this.clearCanvas();
        this.drawGrid();
        this.drawCandlesticks();
        this.drawHighLowIndicators();
        this.drawEMALines();
        this.drawVolume();
        this.drawCrosshair();
        this.infoPanel.render();  // 渲染信息面板
        this.drawAxes();
    }

    clearCanvas() {
        this.ctx.fillStyle = this.config.colors.background;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    resize() {
        this.setupCanvas();
        this.updateViewRange();
        this.render();
    }

    destroy() {
        window.removeEventListener('keydown', this.handleKeyDown);
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('mousedown', this.handleMouseDown);
        window.removeEventListener('mouseup', this.handleMouseUp);
        this.canvas.removeEventListener('mouseleave', this.handleMouseLeave);
    }
}

export default KlineRenderer;