class EMARenderer {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    this.emaData = new Map();
    this.visibleLines = new Map();

    // 默认所有EMA线可见
    [10, 20, 30, 60, 99, 255, 905].forEach(period => {
      this.visibleLines.set(period, true);
    });
  }

  calculateEMA (data, period) {
    if (data.length < period) return;

    const ema = [];
    const k = 2 / (period + 1);

    for (let i = 0; i < data.length; i++) {
      if (i === 0) {
        ema[i] = data[i].close;
      } else {
        ema[i] = data[i].close * k + ema[i - 1] * (1 - k);
      }
    }

    this.emaData.set(period, ema);
  }

  render (data, viewRange) {
    const visiblePeriods = Array.from(this.visibleLines.entries())
      .filter(([_, visible]) => visible)
      .map(([period]) => period);

    for (const period of visiblePeriods) {
      const emaValues = this.emaData.get(period);
      if (emaValues && emaValues.length === data.length) {
        this.drawEMALine(emaValues, viewRange, period);
      }
    }
  }

  drawEMALine (emaValues, viewRange, period) {
    const visibleEma = emaValues.slice(viewRange.start, viewRange.end);
    if (visibleEma.length < 2) return;

    const prices = emaValues.filter(v => v > 0);
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const priceRange = maxPrice - minPrice;

    const startX = 50;
    const candleWidth = 8;
    const candleSpacing = 2;
    const mainChartHeight = this.ctx.canvas.height * 0.7;
    const chartTop = 20;

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.strokeStyle = this.getEMAColor(period);
    this.ctx.lineWidth = 1.5;

    visibleEma.forEach((value, index) => {
      if (value <= 0) return;

      const x = startX + index * (candleWidth + candleSpacing);
      const ratio = (value - minPrice) / priceRange;
      const y = chartTop + mainChartHeight * (1 - ratio);

      if (index === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    });

    this.ctx.stroke();
    this.ctx.restore();
  }

  toggleLine (period, visible) {
    this.visibleLines.set(period, visible);
  }

  getEMAColor (period) {
    const colors = this.config.colors?.ema || {
      10: '#FF6B6B',
      20: '#4ECDC4',
      30: '#45B7D1',
      60: '#96CEB4',
      99: '#FFEAA7',
      255: '#DDA0DD',
      905: '#98D8C8'
    };
    return colors[period] || '#FFFFFF';
  }

  updateConfig (config) {
    this.config = config;
  }
}

export default EMARenderer;