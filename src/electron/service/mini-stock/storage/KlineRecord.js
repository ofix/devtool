import { RECORD_SIZE } from './Constants.js';

export class KlineRecord {
    /**
     * K线记录
     * @param {number} timestamp - 秒级时间戳
     * @param {number} open - 开盘
     * @param {number} high - 最高
     * @param {number} low - 最低
     * @param {number} close - 收盘
     * @param {number} turnoverratio - 换手率
     * @param {number} volume - 成交量
     * @param {number} amount - 成交额
     * @param {number|null} preClose - 昨日收盘价（仅运行时使用，不存入文件）
     */
    constructor(
        timestamp,
        open, high, low, close,
        turnoverRatio,
        volume,
        amount,
        preClose = null  // 可选参数，仅用于运行时计算
    ) {
        this.timestamp = timestamp;
        this.open = open;
        this.high = high;
        this.low = low;
        this.close = close;
        this.turnoverRatio = turnoverRatio;
        this.volume = volume;
        this.amount = amount;
        this.preClose = preClose;  // 运行时缓存，不打包到二进制
        // 缓存计算结果
        this._change = null;
        this._changeRatio = null;
    }

    // 获取 2026-04-01 格式
    get time() {
        const date = new Date(this.timestamp * 1000);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * 涨跌额（基于缓存的 preClose）
     * @returns {number|null}
     */
    get change() {
        if (this._change !== null) return this._change;

        if (this.preClose === null || this.preClose === undefined || this.preClose <= 0) {
            this._change = null;
        } else {
            this._change = +(this.close - this.preClose).toFixed(4);
        }
        return this._change;
    }

    /**
     * 涨跌幅（基于缓存的 preClose）
     * @returns {number|null}
     */
    get changeRatio() {
        if (this._changeRatio !== null) return this._changeRatio;

        if (this.preClose === null || this.preClose === undefined || this.preClose <= 0) {
            this._changeRatio = null;
        } else {
            this._changeRatio = +(((this.close - this.preClose) / this.preClose) * 100).toFixed(2);
        }
        return this._changeRatio;
    }

    /**
     * 设置昨日收盘价（用于批量更新）
     * @param {number|null} preClose
     * @returns {this}
     */
    setPreClose(preClose) {
        this.preClose = preClose;
        return this;
    }

    /**
     * 二进制打包（不包含 preClose、change、changeratio）
     */
    pack() {
        const buf = Buffer.alloc(RECORD_SIZE);
        let o = 0;

        buf.writeBigUInt64BE(BigInt(this.timestamp), o); o += 8;
        buf.writeDoubleBE(this.open, o); o += 8;
        buf.writeDoubleBE(this.high, o); o += 8;
        buf.writeDoubleBE(this.low, o); o += 8;
        buf.writeDoubleBE(this.close, o); o += 8;
        buf.writeDoubleBE(this.turnoverRatio, o); o += 8;
        buf.writeDoubleBE(this.volume, o); o += 8;
        buf.writeDoubleBE(this.amount, o); o += 8;

        return buf;
    }

    /**
     * 二进制解包（解包后 preClose 为 null，需要后续设置）
     */
    static unpack(buf) {
        if (buf.length !== RECORD_SIZE) throw new Error('记录长度错误');

        let o = 0;
        const timestamp = Number(buf.readBigUInt64BE(o)); o += 8;
        const open = buf.readDoubleBE(o); o += 8;
        const high = buf.readDoubleBE(o); o += 8;
        const low = buf.readDoubleBE(o); o += 8;
        const close = buf.readDoubleBE(o); o += 8;
        const turnoverRatio = buf.readDoubleBE(o); o += 8;
        const volume = buf.readDoubleBE(o); o += 8;
        const amount = buf.readDoubleBE(o); o += 8;

        // 解包时 preClose 为 null，需要后续调用 setPreClose 设置
        return new KlineRecord(
            timestamp, open, high, low, close,
            turnoverRatio, volume, amount,
            null  // preClose 初始为 null
        );
    }

    validate() {
        if (this.timestamp < 0) return false;
        if (this.open <= 0 || this.high <= 0 || this.low <= 0 || this.close <= 0) return false;
        if (this.high < this.low) return false;
        if (this.high < this.open || this.high < this.close) return false;
        if (this.low > this.open || this.low > this.close) return false;
        return true;
    }

    // 输出 JSON（直接使用缓存的 preClose）
    toJSON() {
        return {
            time: this.time,
            timestamp: this.timestamp,
            open: this.open,
            high: this.high,
            low: this.low,
            close: this.close,
            preClose: this.preClose,
            change: this.change,
            changeRatio: this._changeRatio,
            turnoverRatio: this._turnoverRatio,
            volume: this.volume,
            amount: this.amount
        };
    }

    // 输出 CSV 格式
    toCSV() {
        return `${this.time},${this.timestamp},${this.open},${this.high},${this.low},${this.close},${this.preClose ?? ''},${this.change ?? ''},${this.changeRatio ?? ''},${this.turnoverRatio},${this.volume},${this.amount}`;
    }
}