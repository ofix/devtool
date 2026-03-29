class VolumeRenderer {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    this.showAmount = true; // true: 成交额, false: 成交量
  }

  render (data, viewRange, chartArea) {
    const visibleData = data.slice(viewRange.start, viewRange.end);
    if (!visibleData.length) return;

    const values = visibleData.map(d => this.showAmount ? d.amount : d.volume);
    const maxValue = Math.max(...values);

    const startX = chartArea.startX || 50;
    const candleWidth = 8;
    const candleSpacing = 2;
    const volumeChartBottom = (chartArea.chartTop || 20) + (chartArea.mainChartHeight || 400) + 10;
    const volumeChartHeight = this.ctx.canvas.height * 0.2;

    visibleData.forEach((candle, index) => {
      const value = this.showAmount ? candle.amount : candle.volume;
      const x = startX + index * (candleWidth + candleSpacing);
      const volumeHeight = (value / maxValue) * volumeChartHeight;
      const y = volumeChartBottom + volumeChartHeight - volumeHeight;

      const isUp = candle.close >= candle.open;
      this.ctx.fillStyle = isUp ? this.config.colors.up : this.config.colors.down;
      this.ctx.fillRect(x, y, candleWidth, Math.max(1, volumeHeight));
    });
  }

  toggleDisplay () {
    this.showAmount = !this.showAmount;
  }

  setDisplayMode (mode) {
    this.showAmount = mode === 'amount';
  }
}

export default VolumeRenderer;