import { RECORD_SIZE } from './constants.js';

export class KlineRecord {
    /**
     * K线记录
     * @param {number} timestamp - 时间戳（毫秒）
     * @param {number} open - 开盘价
     * @param {number} high - 最高价
     * @param {number} low - 最低价
     * @param {number} close - 收盘价
     * @param {number} volume - 成交量
     * @param {number} amount - 成交额
     */
    constructor(timestamp, open, high, low, close, volume, amount) {
        this.timestamp = timestamp;
        this.open = open;
        this.high = high;
        this.low = low;
        this.close = close;
        this.volume = volume;
        this.amount = amount;
    }
    
    /**
     * 序列化为二进制数据
     * @returns {Buffer} 二进制数据
     */
    pack() {
        const buffer = Buffer.alloc(RECORD_SIZE);
        let offset = 0;
        
        buffer.writeBigUInt64BE(BigInt(this.timestamp), offset); offset += 8;
        buffer.writeDoubleBE(this.open, offset); offset += 8;
        buffer.writeDoubleBE(this.high, offset); offset += 8;
        buffer.writeDoubleBE(this.low, offset); offset += 8;
        buffer.writeDoubleBE(this.close, offset); offset += 8;
        buffer.writeDoubleBE(this.volume, offset); offset += 8;
        buffer.writeDoubleBE(this.amount, offset);
        
        return buffer;
    }
    
    /**
     * 从二进制数据反序列化
     * @param {Buffer} buffer - 二进制数据
     * @returns {KlineRecord} K线记录
     */
    static unpack(buffer) {
        if (buffer.length !== RECORD_SIZE) {
            throw new Error(`Invalid record size: ${buffer.length}`);
        }
        
        let offset = 0;
        const timestamp = Number(buffer.readBigUInt64BE(offset)); offset += 8;
        const open = buffer.readDoubleBE(offset); offset += 8;
        const high = buffer.readDoubleBE(offset); offset += 8;
        const low = buffer.readDoubleBE(offset); offset += 8;
        const close = buffer.readDoubleBE(offset); offset += 8;
        const volume = buffer.readDoubleBE(offset); offset += 8;
        const amount = buffer.readDoubleBE(offset);
        
        return new KlineRecord(timestamp, open, high, low, close, volume, amount);
    }
    
    /**
     * 验证K线数据的合法性
     * @returns {boolean} 是否合法
     */
    validate() {
        // 时间戳校验
        if (this.timestamp < 0 || this.timestamp > Date.now() + 86400000 * 365) {
            return false;
        }
        
        // 价格校验
        if (this.open <= 0 || this.high <= 0 || this.low <= 0 || this.close <= 0) {
            return false;
        }
        
        // OHLC关系校验
        if (this.high < this.low || this.high < this.open || this.high < this.close) {
            return false;
        }
        
        if (this.low > this.open || this.low > this.close) {
            return false;
        }
        
        return true;
    }
    
    /**
     * 转换为JSON对象
     * @returns {object} JSON对象
     */
    toJSON() {
        return {
            timestamp: this.timestamp,
            datetime: new Date(this.timestamp).toISOString(),
            open: this.open,
            high: this.high,
            low: this.low,
            close: this.close,
            volume: this.volume,
            amount: this.amount
        };
    }
}