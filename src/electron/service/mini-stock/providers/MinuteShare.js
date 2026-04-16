export default class MinuteShare {
    constructor() {
        this.price = 0;         // 当前股价
        this.amount = 0;        // 分时成交额
        this.time = "";         // 当前时间，第几分钟
        this.volume = 0;        // 分时成交量
        this.change = 0;        // 股价涨跌额
        this.changePercent = 0; // 股价涨跌幅
        this.avgPrice = 0;      // 分时均价线
    }
    toJSON() {
        return {
            time: this.time,
            price: this.price,
            amount: ths.amount,
            volume: this.volume,
            change: this.change,
            changePercent: this.changePercent,
            avgPrice: this.avgPrice,
        }
    }
}