// wal/SimpleWAL.js
import fs from 'fs/promises';

export class SimpleWAL {
    /**
     * 简化的预写日志
     * @param {string} walPath - WAL文件路径
     */
    constructor(walPath) {
        this.walPath = walPath;
        this.fd = null;
        this.currentSeq = 0;
        this.buffer = [];
        this.bufferSize = 0;
    }
    
    /**
     * 打开WAL文件
     */
    async open() {
        this.fd = await fs.open(this.walPath, 'a+');
        await this.recover();
    }
    
    /**
     * 追加记录
     * @param {Array} records - K线记录数组
     * @returns {number} 序列号
     */
    async append(records) {
        const seq = ++this.currentSeq;
        const walRecord = {
            seq,
            timestamp: Date.now(),
            count: records.length,
            firstTimestamp: records[0]?.timestamp || 0,
            lastTimestamp: records[records.length - 1]?.timestamp || 0
        };
        
        const recordStr = JSON.stringify(walRecord);
        const recordBuf = Buffer.from(recordStr, 'utf8');
        const lenBuf = Buffer.alloc(4);
        lenBuf.writeUInt32BE(recordBuf.length);
        
        this.buffer.push(lenBuf, recordBuf);
        this.bufferSize += recordBuf.length + 4;
        
        // 批量写入，达到1MB或200条记录时刷新
        if (this.bufferSize >= 1024 * 1024 || this.buffer.length >= 200) {
            await this.flush();
        }
        
        return seq;
    }
    
    /**
     * 刷新缓冲区到磁盘
     */
    async flush() {
        if (this.buffer.length === 0) return;
        
        const writeBuffer = Buffer.concat(this.buffer);
        await this.fd.write(writeBuffer, 0, writeBuffer.length, null);
        await this.fd.sync();  // 确保WAL持久化
        this.buffer = [];
        this.bufferSize = 0;
    }
    
    /**
     * 恢复WAL（读取并验证）
     */
    async recover() {
        const stat = await this.fd.stat();
        if (stat.size === 0) return;
        
        const buffer = Buffer.alloc(stat.size);
        await this.fd.read(buffer, 0, stat.size, 0);
        
        let offset = 0;
        let maxSeq = 0;
        
        while (offset + 4 <= buffer.length) {
            const len = buffer.readUInt32BE(offset);
            offset += 4;
            
            if (offset + len > buffer.length) break;
            
            try {
                const recordStr = buffer.toString('utf8', offset, offset + len);
                const record = JSON.parse(recordStr);
                maxSeq = Math.max(maxSeq, record.seq);
            } catch (err) {
                // 损坏的记录，停止恢复
                break;
            }
            
            offset += len;
        }
        
        this.currentSeq = maxSeq;
        
        // 截断损坏的部分
        if (offset < buffer.length) {
            await this.fd.truncate(offset);
        }
    }
    
    /**
     * 清空WAL文件（checkpoint后调用）
     */
    async clear() {
        await this.flush();
        await this.fd.truncate(0);
        this.currentSeq = 0;
    }
    
    /**
     * 关闭WAL文件
     */
    async close() {
        await this.flush();
        await this.fd.close();
    }
}