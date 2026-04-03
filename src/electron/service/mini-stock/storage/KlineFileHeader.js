import { HEADER_SIZE, MAGIC_NUMBER, VERSION } from './Constants.js';
import { crc32 } from './Crc32.js';

export class KlineFileHeader {
    constructor() {
        this.magic = MAGIC_NUMBER;
        this.version = VERSION;
        this.symbol = '';
        this.klineType = 0;
        this.count = 0;
        this.startTime = 0;
        this.endTime = 0;
        this.checksum = 0;
    }

    /**
     * 序列化文件头
     * @returns {Buffer} 二进制数据
     */
    serialize() {
        const buffer = Buffer.alloc(HEADER_SIZE);
        let offset = 0;

        buffer.writeUInt32BE(this.magic, offset); offset += 4;
        buffer.writeUInt32BE(this.version, offset); offset += 4;
        buffer.write(this.symbol.padEnd(32, '\0'), offset, 32, 'utf8'); offset += 32;
        buffer.writeUInt32BE(this.klineType, offset); offset += 4;
        buffer.writeBigUInt64BE(BigInt(this.count), offset); offset += 8;
        buffer.writeBigUInt64BE(BigInt(this.startTime), offset); offset += 8;
        buffer.writeBigUInt64BE(BigInt(this.endTime), offset); offset += 8;

        // 计算CRC（不包括checksum字段本身）
        const crc = crc32(buffer.subarray(0, offset));
        buffer.writeUInt32BE(crc, offset);
        this.checksum = crc;

        return buffer;
    }

    /**
     * 从二进制数据反序列化
     * @param {Buffer} buffer - 二进制数据
     * @returns {KlineFileHeader} 文件头
     */
    static deserialize(buffer) {
        if (buffer.length !== HEADER_SIZE) {
            throw new Error(`Invalid header size: ${buffer.length}`);
        }

        let offset = 0;
        const header = new KlineFileHeader();

        header.magic = buffer.readUInt32BE(offset); offset += 4;

        if (header.magic !== MAGIC_NUMBER) {
            throw new Error(`Invalid magic number: ${header.magic.toString(16)}`);
        }

        header.version = buffer.readUInt32BE(offset); offset += 4;
        header.symbol = buffer.toString('utf8', offset, offset + 32).replace(/\0/g, ''); offset += 32;
        header.klineType = buffer.readUInt32BE(offset); offset += 4;
        header.count = Number(buffer.readBigUInt64BE(offset)); offset += 8;
        header.startTime = Number(buffer.readBigUInt64BE(offset)); offset += 8;
        header.endTime = Number(buffer.readBigUInt64BE(offset)); offset += 8;
        header.checksum = buffer.readUInt32BE(offset);

        // 验证CRC
        const calculatedCrc = crc32(buffer.subarray(0, offset));
        if (calculatedCrc !== header.checksum) {
            throw new Error('Header CRC verification failed');
        }

        return header;
    }

    /**
     * 更新文件头的时间范围
     * @param {KlineRecord} record - K线记录
     */
    updateTimeRange(record) {
        if (this.count === 0) {
            this.startTime = record.timestamp;
            this.endTime = record.timestamp;
        } else {
            if (record.timestamp < this.startTime) this.startTime = record.timestamp;
            if (record.timestamp > this.endTime) this.endTime = record.timestamp;
        }
    }
}