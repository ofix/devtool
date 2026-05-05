class EMARenderer {
    constructor(ctx, klineRender) {
        this.ctx = ctx;
        this.klineRender = klineRender;
        this.emaCurves =
            klineRender.emaCurves ??
            new Map([
                [10, { period: 10, show: true, color: '#FF9900', lineWidth: 1.5, data: null }],
                [20, { period: 20, show: true, color: '#0099FF', lineWidth: 1.5, data: null }],
                [30, { period: 30, show: true, color: '#FF00FF', lineWidth: 1.5, data: null }],
                [60, { period: 60, show: true, color: '#00FF00', lineWidth: 1.5, data: null }],
                [99, { period: 99, show: true, color: '#FFFFFF', lineWidth: 1.5, data: null }],
                [255, { period: 255, show: true, color: '#FF3333', lineWidth: 1.5, data: null }],
                [905, { period: 905, show: true, color: '#3333FF', lineWidth: 1.5, data: null }],
            ]);
    }

    // 更新K线数据
    updateKlineData () {
        this.emaCurves.forEach(curve => {
            curve.data = this.#calcEMA(curve.period);
        });
    }

    // EMA 计算
    #calcEMA (period) {
        const data = this.klineRender.data;
        if (data.length < period) return [];

        const ema = [];
        const k = 2 / (period + 1);
        for (let i = 0; i < data.length; i++) {
            ema[i] = i === 0
                ? data[i].close
                : data[i].close * k + ema[i - 1] * (1 - k);
        }
        return ema;
    }

    // 增删改查全是 O(1)
    addEMA (emaCurve) {
        if (this.emaCurves.has(emaCurve.period)) return;
        const newCurve = { ...emaCurve, data: this.#calcEMA(emaCurve.period) };
        this.emaCurves.set(newCurve.period, newCurve);
    }

    delEMA (period) {
        this.emaCurves.delete(period); // 🔥 超快
    }

    toggleEMA (period, show) {
        const curve = this.emaCurves.get(period);
        if (curve) curve.show = show;
    }

    setMAStyle (period, style) {
        const curve = this.emaCurves.get(period);
        if (curve) Object.assign(curve, style);
    }

    // 渲染
    render () {
        const viewRange = this.klineRender.viewRange;
        for (const curve of this.emaCurves.values()) {
            if (curve.show && curve.data?.length) {
                this.#drawEMA(curve, viewRange);
            }
        }
    }

    // 绘制
    #drawEMA (emaCurve, viewRange) {
        const data = emaCurve.data;
        const start = viewRange.start;
        const end = viewRange.end;
        const count = end - start;

        if (count < 2 || !data) return;

        const kline = this.klineRender;
        const max = kline.maxRangePrice;
        const min = kline.minRangePrice;
        const tx = kline.chartLeft;
        const ty = kline.chartTop;
        const height = kline.mainChartHeight;
        const step = kline.klineStep;
        const range = max - min || 1;
        const invRange = 1 / range;

        const ctx = this.ctx;
        ctx.save();
        ctx.translate(tx, ty);
        ctx.beginPath();
        ctx.strokeStyle = emaCurve.color;
        ctx.lineWidth = kline.klineWidth;


        // 先找到第一个有效点，执行 moveTo
        let x = 0;
        let y = height * (1 - (data[start] - min) * invRange);
        ctx.moveTo(x, y);
        // 然后依次 lineTo 后续点
        for (let i = start + 1; i < end; i++) {
            x += step;
            y = height * (1 - (data[i] - min) * invRange);
            ctx.lineTo(x, y);
        }

        ctx.stroke();
        ctx.restore();
    }
}

export default EMARenderer;