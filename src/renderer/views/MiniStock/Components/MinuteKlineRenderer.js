export default class MinuteKlineRenderer {
    constructor(canvas, config = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.config = {
            theme: 'dark',
            colors: {
                priceLine: '#ff6b6b',
                avgPriceLine: '#ffd93d',
                volumeUp: '#ef5350',
                volumeDown: '#26a69a',
                grid: '#333333',
                text: '#ffffff',
                background: '#1a1a1a',
                crosshair: '#ffffff',
                macdUp: '#ef5350',
                macdDown: '#26a69a',
                difLine: '#ffd93d',
                deaLine: '#4ecdc4',
                ...config.colors
            },
            ...config
        };

        this.data = [];           // 分时数据
        this.maxVolume = 0;
        this.maxPrice = 0;
        this.minPrice = Infinity;
        this.preClosePrice = 0;

        // MACD 数据
        this.macdData = [];

        // 十字线
        this.crosshair = {
            visible: false,
            x: 0,
            y: 0,
            index: -1
        };

        // 副图模式: 'volume' | 'macd'
        this.subChartMode = 'volume';

        // 图表区域
        this.chartTop = 0;
        this.chartBottom = 0;
        this.chartLeft = 0;
        this.chartRight = 0;
        this.subChartHeight = 80;
        this.mainChartHeight = 0;
        this.chartWidth = 0;
        this.chartHeight = 0;
        this.totalMinutes = 240;

        this.setupCanvas();
    }

    setupCanvas () {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.chartHeight = rect.height;
        this.chartWidth = rect.width;
        this.mainChartHeight = this.chartHeight - this.chartTop - this.chartBottom - this.subChartHeight;
    }

    setData (data) {
        if (!data || !data.data) return;

        this.data = data.data;
        console.log("分时数据:", this.data);
        this.preClosePrice = data.preClose;
        this.calculateStats();
        this.calculateMACD();
        this.render();
    }

    calculateStats () {
        let maxPrice = -Infinity;
        let minPrice = Infinity;
        let maxVol = 0;

        // 只取真实成交价，不含均价
        for (let i = 0; i < this.data.length; i++) {
            const item = this.data[i];
            maxPrice = Math.max(maxPrice, item.price);
            minPrice = Math.min(minPrice, item.price);
            maxVol = Math.max(maxVol, item.volume);
        }

        const preClose = this.preClosePrice || 0;
        // 无昨收或全天没波动兜底
        if (!preClose || maxPrice === minPrice) {
            this.maxPrice = maxPrice;
            this.minPrice = minPrice;
            this.maxVolume = maxVol;
            return;
        }

        // 相对昨收的上下振幅
        const upDiff = maxPrice - preClose;
        const downDiff = preClose - minPrice;

        // 取最大振幅，上下对称
        const halfRange = Math.max(upDiff, downDiff);

        // 无padding，纯标准边界
        this.maxPrice = preClose + halfRange;
        this.minPrice = preClose - halfRange;
        this.maxVolume = maxVol;
    }

    calculateMACD () {
        const closePrices = this.data.map(d => d.price);
        const ema12 = this.calculateEMA(closePrices, 12);
        const ema26 = this.calculateEMA(closePrices, 26);
        const dif = ema12.map((v, i) => v - ema26[i]);
        const dea = this.calculateEMA(dif, 9);
        const macd = dif.map((v, i) => (v - dea[i]) * 2);

        this.macdData = dif.map((v, i) => ({
            dif: v,
            dea: dea[i],
            macd: macd[i]
        }));
    }

    calculateEMA (data, period) {
        const ema = [];
        const multiplier = 2 / (period + 1);

        for (let i = 0; i < data.length; i++) {
            if (i === 0) {
                ema[i] = data[i];
            } else {
                ema[i] = (data[i] - ema[i - 1]) * multiplier + ema[i - 1];
            }
        }
        return ema;
    }

    setSubChartMode (mode) {
        this.subChartMode = mode;
        if (mode === 'macd' && this.macdData.length === 0) {
            this.calculateMACD();
        }
        this.render();
    }

    setCrosshair (x, y, index) {
        this.crosshair.visible = true;
        this.crosshair.x = x;
        this.crosshair.y = y;
        this.crosshair.index = index;
        this.render();
    }

    hideCrosshair () {
        this.crosshair.visible = false;
        this.crosshair.index = -1;
        this.render();
    }

    render () {
        if (!this.data.length) return;

        this.clearCanvas();
        this.drawGrid();
        this.drawPriceLine();
        this.drawAvgPriceLine();
        this.drawSubChart();
        this.drawAxes();
        if (this.crosshair.visible) {
            this.drawCrosshair();
        }
    }

    clearCanvas () {
        this.ctx.fillStyle = this.config.colors.background;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawGrid () {
        const { ctx, chartTop, mainChartHeight, chartLeft, chartRight, chartWidth, config } = this;

        ctx.save();
        ctx.strokeStyle = config.colors.grid;
        ctx.lineWidth = 0.5;
        ctx.beginPath();

        // 水平网格线
        const horizontalLines = 4;
        for (let i = 0; i <= horizontalLines; i++) {
            const y = chartTop + (mainChartHeight / horizontalLines) * i;
            ctx.moveTo(chartLeft, y);
            ctx.lineTo(chartWidth - chartRight, y);
        }

        // 垂直网格线
        const verticalLines = 6;
        for (let i = 0; i <= verticalLines; i++) {
            const x = chartLeft + ((chartWidth - chartLeft - chartRight) / verticalLines) * i;
            ctx.moveTo(x, chartTop);
            ctx.lineTo(x, chartTop + mainChartHeight);
        }

        ctx.stroke();
        ctx.restore();
    }

    drawPriceLine () {
        if (this.data.length === 0) return;

        const { ctx, chartLeft, chartRight, chartTop, mainChartHeight, config } = this;
        const priceRange = this.maxPrice - this.minPrice;
        if (priceRange === 0) return;

        const step = (this.chartWidth - chartLeft - chartRight) / this.totalMinutes;

        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = config.colors.priceLine;
        ctx.lineWidth = 1.5;

        let isFirst = true;
        for (let i = 0; i < this.data.length; i++) {
            const item = this.data[i];
            const x = chartLeft + i * step;
            const y = this.priceToY(item.price);

            if (isFirst) {
                ctx.moveTo(x, y);
                isFirst = false;
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        // 绘制最新价格点
        const lastItem = this.data[this.data.length - 1];
        const lastX = chartLeft + (this.data.length - 1) * step;
        const lastY = this.priceToY(lastItem.price);
        ctx.fillStyle = config.colors.priceLine;
        ctx.beginPath();
        ctx.arc(lastX, lastY, 3, 0, 2 * Math.PI);
        ctx.fill();

        ctx.restore();
    }

    drawAvgPriceLine () {
        if (this.data.length === 0) return;

        const { ctx, chartLeft, chartRight, chartTop, mainChartHeight, config } = this;
        const priceRange = this.maxPrice - this.minPrice;
        if (priceRange === 0) return;

        const step = (this.chartWidth - chartLeft - chartRight) / this.totalMinutes;

        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = config.colors.avgPriceLine;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);

        let isFirst = true;
        for (let i = 0; i < this.data.length; i++) {
            const item = this.data[i];
            const avgPrice = item.avgPrice || item.price;
            const x = chartLeft + i * step;
            const y = this.priceToY(avgPrice);

            if (isFirst) {
                ctx.moveTo(x, y);
                isFirst = false;
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.restore();
    }

    drawSubChart () {
        if (this.subChartMode === 'volume') {
            this.drawVolume();
        } else {
            this.drawMACD();
        }
    }

    drawVolume () {
        const { ctx, chartLeft, chartRight, chartTop, mainChartHeight, config } = this;
        const step = (this.chartWidth - chartLeft - chartRight) / this.totalMinutes;
        const volumeChartTop = chartTop + mainChartHeight + 10;
        const volumeChartHeight = this.subChartHeight - 10;

        for (let i = 0; i < this.data.length; i++) {
            const item = this.data[i];
            const x = chartLeft + i * step;
            const barWidth = Math.max(2, step * 0.6);
            const barHeight = (item.volume / this.maxVolume) * volumeChartHeight;
            const y = volumeChartTop + volumeChartHeight - barHeight;

            const isUp = item.price >= this.preClosePrice;
            ctx.fillStyle = isUp ? config.colors.volumeUp : config.colors.volumeDown;
            ctx.fillRect(x, y, barWidth, Math.max(1, barHeight));
        }
    }

    drawMACD () {
        if (this.macdData.length === 0) return;

        const { ctx, chartLeft, chartRight, chartTop, mainChartHeight, config } = this;
        const step = (this.chartWidth - chartLeft - chartRight) / this.totalMinutes;
        const macdChartTop = chartTop + mainChartHeight + 10;
        const macdChartHeight = this.subChartHeight - 10;

        // 计算MACD范围
        let maxMacd = 0;
        for (let i = 0; i < this.macdData.length; i++) {
            maxMacd = Math.max(maxMacd, Math.abs(this.macdData[i].macd));
        }
        if (maxMacd === 0) maxMacd = 1;

        ctx.save();

        // 绘制零轴
        ctx.beginPath();
        ctx.strokeStyle = config.colors.grid;
        ctx.lineWidth = 1;
        const zeroY = macdChartTop + macdChartHeight / 2;
        ctx.moveTo(chartLeft, zeroY);
        ctx.lineTo(this.chartWidth - chartRight, zeroY);
        ctx.stroke();

        // 绘制MACD柱状图
        for (let i = 0; i < this.macdData.length; i++) {
            const item = this.macdData[i];
            const x = chartLeft + i * step;
            const barWidth = Math.max(2, step * 0.6);
            const barHeight = (Math.abs(item.macd) / maxMacd) * macdChartHeight;
            const y = item.macd > 0 ? zeroY - barHeight : zeroY;

            ctx.fillStyle = item.macd > 0 ? config.colors.macdUp : config.colors.macdDown;
            ctx.fillRect(x, y, barWidth, Math.max(1, barHeight));
        }

        // 绘制DIF线
        ctx.beginPath();
        ctx.strokeStyle = config.colors.difLine;
        ctx.lineWidth = 1;
        let isFirst = true;
        for (let i = 0; i < this.macdData.length; i++) {
            const item = this.macdData[i];
            const x = chartLeft + i * step + step / 2;
            const y = macdChartTop + macdChartHeight / 2 - (item.dif / maxMacd) * macdChartHeight;

            if (isFirst) {
                ctx.moveTo(x, y);
                isFirst = false;
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        // 绘制DEA线
        ctx.beginPath();
        ctx.strokeStyle = config.colors.deaLine;
        ctx.lineWidth = 1;
        isFirst = true;
        for (let i = 0; i < this.macdData.length; i++) {
            const item = this.macdData[i];
            const x = chartLeft + i * step + step / 2;
            const y = macdChartTop + macdChartHeight / 2 - (item.dea / maxMacd) * macdChartHeight;

            if (isFirst) {
                ctx.moveTo(x, y);
                isFirst = false;
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        ctx.restore();
    }

    drawAxes () {
        const { ctx, chartTop, mainChartHeight, chartLeft, chartWidth, config } = this;
        const priceRange = this.maxPrice - this.minPrice;
        const font = '10px Arial';
        ctx.font = font;

        // 只保存一次画布状态，包裹所有会改 fillStyle 的绘制
        ctx.save();
        const yRepair = [0, 5, 5, 5, 10]; // 根据序号微调y坐标，避免边框遮挡
        const yColor = ['#00aa00', '#00aa00', config.colors.text, '#ff0000', '#ff0000']; // 根据序号设置颜色
        // 右侧涨幅（可选保留，不想要直接删掉这块）
        const lastClose = this.preClosePrice || 0;
        // 价格刻度 0~4
        for (let i = 0; i <= 4; i++) {
            // 提前计算价格、y 坐标，不重复运算
            const rate = i / 4;
            const price = this.minPrice + priceRange * rate;
            let y = chartTop + mainChartHeight * (1 - rate);
            y = y + yRepair[i]; // 最顶部价格稍微下移，避免被边框遮挡
            ctx.fillStyle = yColor[i];    // 最顶部序号4 红色

            // 左侧价格文字
            ctx.fillText(price.toFixed(2), 2, y);

            if (lastClose > 0) {
                const riseRate = ((price - lastClose) / lastClose) * 100;
                const riseText = riseRate >= 0 ? `+${riseRate.toFixed(2)}%` : `${riseRate.toFixed(2)}%`;
                ctx.fillStyle = yColor[i];
                ctx.fillText(riseText, chartWidth - 45, y + 3);
            }
        }

        // 时间标签：恢复默认文本色
        ctx.fillStyle = config.colors.text;
        const timeLabels = ['9:30', '10:30', '11:30', '13:00', '14:00', '15:00'];
        const step = (chartWidth - chartLeft - this.chartRight) / (timeLabels.length - 1);
        for (let i = 0; i < timeLabels.length; i++) {
            const x = chartLeft + i * step;
            ctx.fillText(timeLabels[i], x - 15, this.chartHeight - 10);
        }

        // 还原画布状态
        ctx.restore();
    }

    drawCrosshair () {
        const { ctx, chartTop, mainChartHeight, chartLeft, chartRight, chartWidth, config, crosshair } = this;

        ctx.save();
        ctx.strokeStyle = config.colors.crosshair;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);

        // 垂直虚线
        ctx.beginPath();
        ctx.moveTo(crosshair.x, chartTop);
        ctx.lineTo(crosshair.x, chartTop + mainChartHeight);
        ctx.stroke();

        // 水平虚线
        ctx.beginPath();
        ctx.moveTo(chartLeft, crosshair.y);
        ctx.lineTo(chartWidth - chartRight, crosshair.y);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.restore();

        // 显示十字线数据
        if (crosshair.index >= 0 && crosshair.index < this.data.length) {
            this.drawCrosshairInfo();
        }
    }

    drawCrosshairInfo () {
        const { ctx, crosshair, config, chartWidth } = this;
        const data = this.data[crosshair.index];
        if (!data) return;

        const info = [
            `时间: ${data.time}`,
            `价格: ${data.price.toFixed(2)}`,
            `均价: ${(data.avgPrice || data.price).toFixed(2)}`,
            `成交量: ${this.formatVolume(data.volume)}`,
            `成交额: ${this.formatVolume(data.amount)}`,
        ];

        ctx.save();
        ctx.font = '11px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 0;

        const x = crosshair.x + 15;
        const y = crosshair.y + 15;
        const lineHeight = 18;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(x - 5, y - 5, 130, info.length * lineHeight + 5);

        ctx.fillStyle = config.colors.crosshair;
        for (let i = 0; i < info.length; i++) {
            ctx.fillText(info[i], x, y + i * lineHeight);
        }

        ctx.restore();
    }

    priceToY (price) {
        const ratio = (price - this.minPrice) / (this.maxPrice - this.minPrice);
        return this.chartTop + this.mainChartHeight * (1 - ratio);
    }

    formatVolume (volume) {
        if (volume >= 100000000) {
            return (volume / 100000000).toFixed(2) + '亿';
        } else if (volume >= 10000) {
            return (volume / 10000).toFixed(2) + '万';
        }
        return volume.toString();
    }

    resize () {
        this.setupCanvas();
        this.render();
    }

    destroy () {
        this.canvas = null;
        this.ctx = null;
    }
}