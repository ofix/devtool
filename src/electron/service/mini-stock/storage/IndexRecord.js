import { INDEX_SIZE } from './constants.js';

export class IndexRecord {
    /**
     * 索引记录
     * @param {number} timestamp - 时间戳
     * @param {number} offset - 数据文件中的偏移量
     */
    constructor(timestamp, offset) {
        this.timestamp = timestamp;
        this.offset = offset;
    }
    
    /**
     * 序列化为二进制数据
     * @returns {Buffer} 二进制数据
     */
    pack() {
        const buffer = Buffer.alloc(INDEX_SIZE);
        buffer.writeBigUInt64BE(BigInt(this.timestamp), 0);
        buffer.writeUInt32BE(this.offset, 8);
        return buffer;
    }
    
    /**
     * 从二进制数据反序列化
     * @param {Buffer} buffer - 二进制数据
     * @returns {IndexRecord} 索引记录
     */
    static unpack(buffer) {
        if (buffer.length !== INDEX_SIZE) {
            throw new Error(`Invalid index size: ${buffer.length}`);
        }
        
        const timestamp = Number(buffer.readBigUInt64BE(0));
        const offset = buffer.readUInt32BE(8);
        return new IndexRecord(timestamp, offset);
    }
}