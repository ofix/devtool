import EMARenderer from './EMARenderer';
import VolumeRenderer from './VolumeRenderer';

class KLineRenderer {
  constructor(canvas, config = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = {
      theme: 'dark',
      colors: {
        up: '#ef5350',
        down: '#26a69a',
        grid: '#333333',
        text: '#999999',
        background: '#1a1a1a',
        ...config.colors
      },
      ...config
    };

    this.data = [];
    this.viewRange = { start: 0, end: 100 };
    this.zoomLevel = 1;
    this.candleWidth = 8;
    this.candleSpacing = 2;
    this.emaRenderer = new EMARenderer(this.ctx, this.config);
    this.volumeRenderer = new VolumeRenderer(this.ctx, this.config);

    this.setupCanvas();
  }

  setupCanvas () {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.mainChartHeight = rect.height * 0.7;
    this.volumeChartHeight = rect.height * 0.2;
    this.chartTop = 20;
  }

  setData (data) {
    this.data = data;
    this.updateViewRange();
    this.calculateIndicators();
    this.render();
  }

  updateViewRange () {
    const totalCandles = this.data.length;
    const visibleCandles = Math.floor(this.canvas.width / (this.candleWidth + this.candleSpacing));

    let end = this.viewRange.start + visibleCandles;
    if (end > totalCandles) {
      end = totalCandles;
      this.viewRange.start = Math.max(0, end - visibleCandles);
    }

    this.viewRange.end = end;
  }

  calculateIndicators () {
    // 计算EMA
    const emaPeriods = [10, 20, 30, 60, 99, 255, 905];
    emaPeriods.forEach(period => {
      this.emaRenderer.calculateEMA(this.data, period);
    });
  }

  render () {
    if (!this.data.length) return;

    this.clearCanvas();
    this.drawGrid();
    this.drawCandlesticks();
    this.drawEMALines();
    this.drawVolume();
    this.drawAxes();
  }

  clearCanvas () {
    this.ctx.fillStyle = this.config.colors.background;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawGrid () {
    const { ctx, canvas, mainChartHeight, chartTop, config } = this;

    ctx.save();
    ctx.strokeStyle = config.colors.grid;
    ctx.lineWidth = 0.5;

    // 水平网格线
    const horizontalLines = 5;
    for (let i = 0; i <= horizontalLines; i++) {
      const y = chartTop + (mainChartHeight / horizontalLines) * i;
      ctx.beginPath();
      ctx.moveTo(50, y);
      ctx.lineTo(canvas.width - 20, y);
      ctx.stroke();
    }

    // 垂直网格线
    const visibleCandles = this.viewRange.end - this.viewRange.start;
    for (let i = 0; i <= 10; i++) {
      const x = 50 + ((canvas.width - 70) / 10) * i;
      ctx.beginPath();
      ctx.moveTo(x, chartTop);
      ctx.lineTo(x, chartTop + mainChartHeight);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawCandlesticks () {
    const visibleData = this.data.slice(this.viewRange.start, this.viewRange.end);
    if (!visibleData.length) return;

    const prices = visibleData.flatMap(d => [d.high, d.low]);
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const priceRange = maxPrice - minPrice;

    const startX = 50;
    const chartWidth = this.canvas.width - 70;
    const candleTotalWidth = this.candleWidth + this.candleSpacing;
    const maxCandles = Math.floor(chartWidth / candleTotalWidth);

    // 如果可见蜡烛太多，调整宽度
    let candleWidth = this.candleWidth;
    if (visibleData.length > maxCandles) {
      candleWidth = (chartWidth / visibleData.length) - this.candleSpacing;
    }

    visibleData.forEach((candle, index) => {
      const x = startX + index * (candleWidth + this.candleSpacing);
      const yHigh = this.priceToY(candle.high, maxPrice, minPrice);
      const yLow = this.priceToY(candle.low, maxPrice, minPrice);
      const yOpen = this.priceToY(candle.open, maxPrice, minPrice);
      const yClose = this.priceToY(candle.close, maxPrice, minPrice);

      const isUp = candle.close >= candle.open;
      this.ctx.fillStyle = isUp ? this.config.colors.up : this.config.colors.down;
      this.ctx.strokeStyle = isUp ? this.config.colors.up : this.config.colors.down;

      // 绘制影线
      this.ctx.beginPath();
      this.ctx.moveTo(x + candleWidth / 2, yHigh);
      this.ctx.lineTo(x + candleWidth / 2, yLow);
      this.ctx.stroke();

      // 绘制实体
      const bodyTop = Math.min(yOpen, yClose);
      const bodyHeight = Math.abs(yClose - yOpen);
      this.ctx.fillRect(x, bodyTop, candleWidth, Math.max(1, bodyHeight));
    });
  }

  drawEMALines () {
    this.emaRenderer.render(this.data, this.viewRange);
  }

  drawVolume () {
    const visibleData = this.data.slice(this.viewRange.start, this.viewRange.end);
    if (!visibleData.length) return;

    const volumes = visibleData.map(d => d.volume);
    const maxVolume = Math.max(...volumes);

    const startX = 50;
    const chartWidth = this.canvas.width - 70;
    const volumeChartBottom = this.chartTop + this.mainChartHeight + 10;
    const volumeChartHeight = this.volumeChartHeight;

    visibleData.forEach((candle, index) => {
      const x = startX + index * (this.candleWidth + this.candleSpacing);
      const volumeHeight = (candle.volume / maxVolume) * volumeChartHeight;
      const y = volumeChartBottom + volumeChartHeight - volumeHeight;

      const isUp = candle.close >= candle.open;
      this.ctx.fillStyle = isUp ? this.config.colors.up : this.config.colors.down;
      this.ctx.fillRect(x, y, this.candleWidth, Math.max(1, volumeHeight));
    });
  }

  drawAxes () {
    this.ctx.fillStyle = this.config.colors.text;
    this.ctx.font = '12px Arial';

    // 绘制价格标签
    const visibleData = this.data.slice(this.viewRange.start, this.viewRange.end);
    if (visibleData.length) {
      const prices = visibleData.flatMap(d => [d.high, d.low]);
      const maxPrice = Math.max(...prices);
      const minPrice = Math.min(...prices);

      for (let i = 0; i <= 4; i++) {
        const price = minPrice + (maxPrice - minPrice) * (i / 4);
        const y = this.priceToY(price, maxPrice, minPrice);
        this.ctx.fillText(price.toFixed(2), 5, y + 4);
      }
    }
  }

  priceToY (price, maxPrice, minPrice) {
    const ratio = (price - minPrice) / (maxPrice - minPrice);
    return this.chartTop + this.mainChartHeight * (1 - ratio);
  }

  zoom (direction) {
    const zoomFactor = direction === 'in' ? 0.8 : 1.2;
    const oldWidth = this.viewRange.end - this.viewRange.start;
    const newWidth = Math.floor(oldWidth * zoomFactor);
    const center = this.viewRange.start + oldWidth / 2;

    let newStart = Math.floor(center - newWidth / 2);
    let newEnd = newStart + newWidth;

    newStart = Math.max(0, Math.min(newStart, this.data.length - newWidth));
    newEnd = Math.min(this.data.length, newStart + newWidth);
    newStart = newEnd - newWidth;

    this.viewRange = { start: newStart, end: newEnd };
    this.render();
  }

  pan (direction) {
    const step = Math.floor((this.viewRange.end - this.viewRange.start) * 0.2);
    let newStart, newEnd;

    if (direction === 'left') {
      newStart = Math.max(0, this.viewRange.start - step);
      newEnd = newStart + (this.viewRange.end - this.viewRange.start);
    } else {
      newEnd = Math.min(this.data.length, this.viewRange.end + step);
      newStart = newEnd - (this.viewRange.end - this.viewRange.start);
    }

    if (newStart >= 0 && newEnd <= this.data.length) {
      this.viewRange = { start: newStart, end: newEnd };
      this.render();
    }
  }

  resize () {
    this.setupCanvas();
    this.updateViewRange();
    this.render();
  }
}

export default KLineRenderer;