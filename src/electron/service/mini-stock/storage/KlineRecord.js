import { RECORD_SIZE } from './Constants.js';

export class KlineRecord {
    /**
     * K线记录
     * @param {number} timestamp - 秒级时间戳
     * @param {number} open - 开盘
     * @param {number} high - 最高
     * @param {number} low - 最低
     * @param {number} close - 收盘
     * @param {number} preClose - 昨收
     * @param {number} turnoverratio - 换手率
     * @param {number} change - 涨跌额
     * @param {number} changeratio - 涨跌幅(%)
     * @param {number} volume - 成交量
     * @param {number} amount - 成交额
     */
    constructor(
        timestamp,
        open, high, low, close,
        preClose,
        turnoverratio,
        change,
        changeratio,
        volume,
        amount
    ) {
        this.timestamp = timestamp;
        this.open = open;
        this.high = high;
        this.low = low;
        this.close = close;
        this.preClose = preClose;
        this.turnoverratio = turnoverratio;
        this.change = change;
        this.changeratio = changeratio;
        this.volume = volume;
        this.amount = amount;
    }

    // 获取 2026-04-01 格式
    get time () {
        const date = new Date(this.timestamp * 1000); // 秒转毫秒
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * 二进制打包（固定长度，不变）
     */
    pack () {
        const buf = Buffer.alloc(RECORD_SIZE);
        let o = 0;

        buf.writeBigUInt64BE(BigInt(this.timestamp), o); o += 8;
        buf.writeDoubleBE(this.open, o); o += 8;
        buf.writeDoubleBE(this.high, o); o += 8;
        buf.writeDoubleBE(this.low, o); o += 8;
        buf.writeDoubleBE(this.close, o); o += 8;

        buf.writeDoubleBE(this.preClose, o); o += 8;
        buf.writeDoubleBE(this.turnoverratio, o); o += 8;
        buf.writeDoubleBE(this.change, o); o += 8;
        buf.writeDoubleBE(this.changeratio, o); o += 8;

        buf.writeDoubleBE(this.volume, o); o += 8;
        buf.writeDoubleBE(this.amount, o); o += 8;

        return buf;
    }

    /**
     * 二进制解包
     */
    static unpack (buf) {
        if (buf.length !== RECORD_SIZE) throw new Error('记录长度错误');

        let o = 0;
        const timestamp = Number(buf.readBigUInt64BE(o)); o += 8;
        const open = buf.readDoubleBE(o); o += 8;
        const high = buf.readDoubleBE(o); o += 8;
        const low = buf.readDoubleBE(o); o += 8;
        const close = buf.readDoubleBE(o); o += 8;

        const preClose = buf.readDoubleBE(o); o += 8;
        const turnoverratio = buf.readDoubleBE(o); o += 8;
        const change = buf.readDoubleBE(o); o += 8;
        const changeratio = buf.readDoubleBE(o); o += 8;

        const volume = buf.readDoubleBE(o); o += 8;
        const amount = buf.readDoubleBE(o); o += 8;

        return new KlineRecord(
            timestamp, open, high, low, close,
            preClose, turnoverratio, change, changeratio,
            volume, amount
        );
    }

    validate () {
        if (this.timestamp < 0) return false;
        if (this.open <= 0 || this.high <= 0 || this.low <= 0 || this.close <= 0) return false;
        if (this.high < this.low) return false;
        return true;
    }

    // 输出自动带 date:
    toJSON () {
        return {
            time: this.time, // 日期格式 '2026-04-01'
            timestamp: this.timestamp, // 秒级时间戳（10位数字）
            open: this.open,
            high: this.high,
            low: this.low,
            close: this.close,
            preClose: this.preClose,
            change: this.change,
            changeratio: this.changeratio,
            turnoverratio: this.turnoverratio,
            volume: this.volume,
            amount: this.amount
        };
    }
    // 输出 CSV 格式（不带表头）
    toCSV () {
        return `${this.time},${this.timestamp},${this.open},${this.high},${this.low},${this.close},${this.preClose},${this.change},${this.changeratio},${this.turnoverratio},${this.volume},${this.amount}`;
    }
}