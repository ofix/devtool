import fs from 'fs/promises';

export class SimpleWAL {
    /**
     * 简化的预写日志（可恢复版）
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
     * 追加一批 KlineRecord 到 WAL（真正存数据！）
     * @param {KlineRecord[]} records
     */
    async append(records) {
        const seq = ++this.currentSeq;

        // 🔥 存储真实数据！
        const entry = {
            seq,
            records: records.map(r => ({
                timestamp: r.timestamp,
                open: r.open,
                high: r.high,
                low: r.low,
                close: r.close,
                volume: r.volume,
                amount: r.amount,
                turnover: r.turnover
            }))
        };

        const json = JSON.stringify(entry);
        const jsonBuf = Buffer.from(json, 'utf8');
        const lenBuf = Buffer.alloc(4);
        lenBuf.writeUInt32BE(jsonBuf.length);

        this.buffer.push(lenBuf, jsonBuf);
        this.bufferSize += 4 + jsonBuf.length;

        if (this.bufferSize >= 1024 * 1024 || this.buffer.length >= 200) {
            await this.flush();
        }

        return seq;
    }

    /**
     * 刷到磁盘
     */
    async flush() {
        if (this.buffer.length === 0) return;
        const buf = Buffer.concat(this.buffer);
        await this.fd.write(buf, 0, buf.length);
        await this.fd.sync();
        this.buffer = [];
        this.bufferSize = 0;
    }

    /**
     * 读取 WAL 中所有记录（给恢复用！）
     * @returns {KlineRecord[]}
     */
    async readAll() {
        await this.flush();
        const stat = await this.fd.stat();
        if (stat.size === 0) return [];

        const buf = Buffer.alloc(stat.size);
        await this.fd.read(buf, 0, stat.size, 0);

        const records = [];
        let offset = 0;

        while (offset + 4 <= buf.length) {
            const len = buf.readUInt32BE(offset);
            offset += 4;

            if (offset + len > buf.length) break;

            try {
                const json = buf.toString('utf8', offset, offset + len);
                const entry = JSON.parse(json);
                records.push(...entry.records);
            } catch (e) {
                break;
            }

            offset += len;
        }

        return records;
    }

    /**
     * 恢复：读取最大 seq
     */
    async recover() {
        const stat = await this.fd.stat();
        if (stat.size === 0) return;

        const buf = Buffer.alloc(stat.size);
        await this.fd.read(buf, 0, stat.size, 0);

        let offset = 0;
        let maxSeq = 0;

        while (offset + 4 <= buf.length) {
            const len = buf.readUInt32BE(offset);
            offset += 4;
            if (offset + len > buf.length) break;

            try {
                const json = buf.toString('utf8', offset, offset + len);
                const entry = JSON.parse(json);
                maxSeq = Math.max(maxSeq, entry.seq);
            } catch (e) {
                break;
            }

            offset += len;
        }

        this.currentSeq = maxSeq;

        // 截断损坏尾部
        if (offset < stat.size) {
            await this.fd.truncate(offset);
        }
    }

    /**
     * 清空 WAL（已写入主文件后调用）
     */
    async clear() {
        await this.flush();
        await this.fd.truncate(0);
        this.currentSeq = 0;
    }

    async close() {
        await this.flush();
        await this.fd.close();
    }
}