export default class Share {
    constructor() {
        this.code = '';
        this.name = '';
        this.close = 0;
        this.open = 0;
        this.high = 0
        this.low = 0;
        this.preClose = 0;
        this.volume = 0;
        this.amount = 0
        this.change = 0;
        this.changePercent = 0;
    }

    toJSON() {
        return {
            code: this.code,
            name: this.name,
            close: this.close,
            open: this.open,
            high: this.high,
            low: this.low,
            preClose: this.preClose,
            volume: this.volume,
            amount: this.amount,
            change: this.change,
            changePercent: this.changePercent,
        };
    }
}