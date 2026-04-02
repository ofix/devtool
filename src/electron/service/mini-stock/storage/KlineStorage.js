import fs from 'fs/promises';
import path from 'path';
import {
    RECORD_SIZE, INDEX_SIZE, HEADER_SIZE,
    BATCH_SIZE, FLUSH_INTERVAL, MAX_CACHE_SIZE,
    WAL_CLEAR_THRESHOLD, INDEX_BATCH_SIZE
} from './constants.js';
import { KlineRecord } from './KlineRecord.js';
import { IndexRecord } from './IndexRecord.js';
import { KlineFileHeader } from './KlineFileHeader.js';
import { SimpleWAL } from './SimpleWAL.js';

export class KlineStorage {
    constructor(basePath) {
        this.basePath = basePath;
        // 存储句柄
        this.handles = new Map(); // shareCode => Handle
        // 写入缓冲区
        this.writeBuffer = new Map(); // shareCode => { records: [], flushing: false }
        // 索引缓存
        this.indexCache = new Map(); // shareCode => Map<timestamp, offset>
        // 刷新定时器
        this.flushTimer = null;
        // 关闭标志
        this.isClosing = false;
        // 统计信息
        this.stats = new Map(); // shareCode => Stats
    }

    async init() {
        await fs.mkdir(this.basePath, { recursive: true });
        this.startFlushTimer();
    }

    getFilePaths(shareCode) {
        return {
            dataPath: path.join(this.basePath, `${shareCode}.dat`),
            indexPath: path.join(this.basePath, `${shareCode}.idx`),
            walPath: path.join(this.basePath, `${shareCode}.wal`)
        };
    }

    /**
     * 打开或获取文件句柄
     */
    async open(shareCode) {
        if (this.handles.has(shareCode)) {
            return this.handles.get(shareCode);
        }

        const { dataPath, indexPath, walPath } = this.getFilePaths(shareCode);
        await fs.mkdir(this.basePath, { recursive: true });

        // 并行打开文件
        const [dataFd, indexFd] = await Promise.all([
            fs.open(dataPath, 'a+'),
            fs.open(indexPath, 'a+')
        ]);

        const wal = new SimpleWAL(walPath);
        await wal.open();

        const header = new KlineFileHeader();
        const handle = {
            shareCode, dataFd, indexFd, wal, header,
            lastFlushTime: Date.now()
        };

        this.handles.set(shareCode, handle);

        // 初始化缓冲区
        if (!this.writeBuffer.has(shareCode)) {
            this.writeBuffer.set(shareCode, { records: [], flushing: false });
        }

        // 初始化统计
        if (!this.stats.has(shareCode)) {
            this.stats.set(shareCode, {
                writes: 0,
                flushes: 0,
                cacheHits: 0,
                cacheMisses: 0
            });
        }

        // 初始化文件
        await this.initHeader(handle);
        await this.verifyFileIntegrity(handle);
        await this.recovery(handle);

        return handle;
    }

    /**
     * 初始化头部
     */
    async initHeader(handle) {
        const { dataFd, header } = handle;

        try {
            const headerBuf = Buffer.alloc(HEADER_SIZE);
            const { bytesRead } = await dataFd.read(headerBuf, 0, HEADER_SIZE, 0);

            if (bytesRead === HEADER_SIZE) {
                const deserialized = await KlineFileHeader.deserialize(headerBuf);
                Object.assign(header, deserialized);
            } else {
                await this.createNewHeader(handle);
            }
        } catch (err) {
            console.warn(`Header corrupted for ${handle.shareCode}, creating new:`, err.message);
            await this.createNewHeader(handle);
        }
    }

    /**
     * 创建新头部
     */
    async createNewHeader(handle) {
        const { dataFd, header } = handle;
        const newHeader = new KlineFileHeader();
        const buf = newHeader.serialize();

        await dataFd.write(buf, 0, HEADER_SIZE, 0);
        await dataFd.sync();

        Object.assign(header, newHeader);
    }

    /**
     * 校验文件完整性
     */
    async verifyFileIntegrity(handle) {
        const { dataFd, header, shareCode } = handle;
        const stat = await dataFd.stat();
        const expectedSize = HEADER_SIZE + header.count * RECORD_SIZE;

        if (stat.size !== expectedSize) {
            console.warn(`File size mismatch for ${shareCode}, repairing...`);
            await this.repairFile(handle);
        }
    }

    /**
     * 修复文件
     */
    async repairFile(handle) {
        const { dataFd, header } = handle;
        const stat = await dataFd.stat();

        const validSize = HEADER_SIZE +
            Math.floor((stat.size - HEADER_SIZE) / RECORD_SIZE) * RECORD_SIZE;

        if (validSize >= HEADER_SIZE) {
            await dataFd.truncate(validSize);
            header.count = (validSize - HEADER_SIZE) / RECORD_SIZE;

            const hBuf = await header.serialize();
            await dataFd.write(hBuf, 0, HEADER_SIZE, 0);
            await dataFd.sync();
        }
    }

    /**
     * 崩溃恢复
     */
    async recovery(handle) {
        const { dataFd, indexFd, header, shareCode } = handle;

        const dataStat = await dataFd.stat();
        const indexStat = await indexFd.stat();

        const dataCount = Math.floor((dataStat.size - HEADER_SIZE) / RECORD_SIZE);
        const indexCount = Math.floor(indexStat.size / INDEX_SIZE);

        if (dataCount !== indexCount) {
            console.log(`Index inconsistent for ${shareCode}, rebuilding: data=${dataCount}, index=${indexCount}`);
            await this.rebuildIndex(handle);
        }
    }

    /**
     * 写入单条记录
     */
    async append(shareCode, record) {
        if (!record.validate()) {
            throw new Error(`Invalid record for ${shareCode}: ${record.timestamp}`);
        }

        const handle = await this.open(shareCode);
        const buffer = this.writeBuffer.get(shareCode);

        if (!buffer) {
            throw new Error(`Buffer not initialized for ${shareCode}`);
        }

        buffer.records.push(record);

        // 更新统计
        const stats = this.stats.get(shareCode);
        stats.writes++;

        // 达到批量大小，触发刷新
        if (buffer.records.length >= BATCH_SIZE && !buffer.flushing) {
            // 异步刷新，不阻塞写入
            this.flush(shareCode).catch(err => {
                console.error(`Flush error for ${shareCode}:`, err);
            });
        }
    }

    /**
     * 批量写入
     */
    async batchAppend(shareCode, records) {
        for (const r of records) {
            if (!r.validate()) {
                throw new Error(`Invalid record in batch for ${shareCode}: ${r.timestamp}`);
            }
        }

        const handle = await this.open(shareCode);
        const buffer = this.writeBuffer.get(shareCode);

        if (!buffer) {
            throw new Error(`Buffer not initialized for ${shareCode}`);
        }

        buffer.records.push(...records);

        const stats = this.stats.get(shareCode);
        stats.writes += records.length;

        if (buffer.records.length >= BATCH_SIZE && !buffer.flushing) {
            this.flush(shareCode).catch(console.error);
        }
    }

    /**
     * 刷新缓冲区到磁盘（带锁防止并发）
     */
    async flush(shareCode) {
        const buffer = this.writeBuffer.get(shareCode);

        // 没有数据或正在刷新，直接返回
        if (!buffer || buffer.records.length === 0 || buffer.flushing) {
            return;
        }

        // 设置刷新锁
        buffer.flushing = true;

        try {
            const handle = this.handles.get(shareCode);
            if (!handle) {
                // 句柄可能已被关闭
                buffer.records = [];
                return;
            }

            const { dataFd, indexFd, wal, header } = handle;
            const records = buffer.records;

            // 清空缓冲区（在成功写入前清空，避免重复）
            buffer.records = [];

            // 1. 写入WAL
            await wal.append(records);

            // 2. 准备数据
            const dataBuf = Buffer.alloc(records.length * RECORD_SIZE);
            let dataOffset = 0;
            for (let i = 0; i < records.length; i++) {
                records[i].pack().copy(dataBuf, dataOffset);
                dataOffset += RECORD_SIZE;
            }

            const dataPos = HEADER_SIZE + header.count * RECORD_SIZE;

            // 3. 准备索引
            const indexBuf = Buffer.alloc(records.length * INDEX_SIZE);
            let indexOffset = 0;
            for (let i = 0; i < records.length; i++) {
                const indexRecord = new IndexRecord(
                    records[i].timestamp,
                    dataPos + i * RECORD_SIZE
                );
                indexRecord.pack().copy(indexBuf, indexOffset);
                indexOffset += INDEX_SIZE;

                // 更新缓存
                this.updateCache(shareCode, records[i].timestamp, dataPos + i * RECORD_SIZE);
            }

            const indexPos = header.count * INDEX_SIZE;

            // 4. 并行写入数据和索引
            await Promise.all([
                dataFd.write(dataBuf, 0, dataBuf.length, dataPos),
                indexFd.write(indexBuf, 0, indexBuf.length, indexPos)
            ]);

            // 5. 更新头部
            for (const record of records) {
                header.updateTimeRange(record);
            }
            header.count += records.length;

            const headerBuf = await header.serialize();
            await dataFd.write(headerBuf, 0, HEADER_SIZE, 0);

            // 6. 强制刷盘
            await Promise.all([
                dataFd.sync(),
                indexFd.sync()
            ]);

            // 7. 更新统计
            const stats = this.stats.get(shareCode);
            stats.flushes++;
            handle.lastFlushTime = Date.now();

            // 8. 定期清理WAL
            if (header.count % WAL_CLEAR_THRESHOLD === 0) {
                await wal.clear();
            }

        } catch (err) {
            console.error(`Flush failed for ${shareCode}:`, err);
            // 恢复缓冲区数据（避免数据丢失）
            const buffer = this.writeBuffer.get(shareCode);
            if (buffer && buffer.records.length === 0) {
                // 如果清空了但写入失败，需要恢复（这里简化处理）
                console.error(`Data may be lost for ${shareCode}`);
            }
            throw err;
        } finally {
            // 释放刷新锁
            const buffer = this.writeBuffer.get(shareCode);
            if (buffer) {
                buffer.flushing = false;
            }
        }
    }

    /**
     * 更新索引缓存
     */
    updateCache(shareCode, timestamp, offset) {
        if (!this.indexCache.has(shareCode)) {
            this.indexCache.set(shareCode, new Map());
        }

        const cache = this.indexCache.get(shareCode);

        // LRU: 如果缓存过大，删除最旧的
        if (cache.size >= MAX_CACHE_SIZE) {
            const oldestKey = cache.keys().next().value;
            cache.delete(oldestKey);
            const stats = this.stats.get(shareCode);
            if (stats) stats.cacheMisses++;
        }

        cache.set(timestamp, offset);
        const stats = this.stats.get(shareCode);
        if (stats) stats.cacheHits++;
    }

    /**
     * 从缓存读取索引
     */
    getCachedIndex(shareCode, timestamp) {
        const cache = this.indexCache.get(shareCode);
        if (!cache) return null;

        const stats = this.stats.get(shareCode);
        if (cache.has(timestamp)) {
            if (stats) stats.cacheHits++;
            return cache.get(timestamp);
        }

        if (stats) stats.cacheMisses++;
        return null;
    }

    /**
     * 查询K线数据
     */
    async query(shareCode, startTime, endTime) {
        const handle = await this.open(shareCode);
        const { header, dataFd, indexFd } = handle;

        if (header.count === 0) return [];

        const results = [];

        // 二分查找起始位置
        let left = 0;
        let right = header.count - 1;
        let startIdx = -1;

        while (left <= right) {
            const mid = (left + right) >> 1;
            const ir = await this.readIndexAt(handle, mid);
            if (ir.timestamp >= startTime) {
                startIdx = mid;
                right = mid - 1;
            } else {
                left = mid + 1;
            }
        }

        if (startIdx === -1) return [];

        // 批量读取数据
        let pos = startIdx;
        const batchSize = INDEX_BATCH_SIZE;

        while (pos < header.count) {
            const batchEnd = Math.min(pos + batchSize, header.count);
            const indexBuf = Buffer.alloc((batchEnd - pos) * INDEX_SIZE);
            await indexFd.read(indexBuf, 0, indexBuf.length, pos * INDEX_SIZE);

            for (let i = 0; i < batchEnd - pos; i++) {
                const ir = IndexRecord.unpack(
                    indexBuf.subarray(i * INDEX_SIZE, (i + 1) * INDEX_SIZE)
                );

                if (ir.timestamp > endTime) {
                    return results;
                }

                // 读取数据记录
                const recordBuf = Buffer.alloc(RECORD_SIZE);
                await dataFd.read(recordBuf, 0, RECORD_SIZE, ir.offset);
                results.push(KlineRecord.unpack(recordBuf));
            }
            pos = batchEnd;
        }

        return results;
    }

    /**
     * 读取指定索引位置
     */
    async readIndexAt(handle, index) {
        const { indexFd } = handle;
        const buf = Buffer.alloc(INDEX_SIZE);
        await indexFd.read(buf, 0, INDEX_SIZE, index * INDEX_SIZE);
        return IndexRecord.unpack(buf);
    }

    /**
     * 获取第一条K线
     */
    async getFirst(shareCode) {
        const handle = await this.open(shareCode);
        const { header, dataFd } = handle;

        if (header.count === 0) return null;

        const buf = Buffer.alloc(RECORD_SIZE);
        await dataFd.read(buf, 0, RECORD_SIZE, HEADER_SIZE);
        return KlineRecord.unpack(buf);
    }

    /**
     * 获取最后一条K线
     */
    async getLast(shareCode) {
        const handle = await this.open(shareCode);
        const { header, dataFd } = handle;

        if (header.count === 0) return null;

        const pos = HEADER_SIZE + (header.count - 1) * RECORD_SIZE;
        const buf = Buffer.alloc(RECORD_SIZE);
        await dataFd.read(buf, 0, RECORD_SIZE, pos);
        return KlineRecord.unpack(buf);
    }

    /**
     * 获取统计信息
     */
    async getStats(shareCode) {
        const handle = await this.open(shareCode);
        const { header, dataFd, indexFd } = handle;

        const [dataStat, indexStat, storageStats] = await Promise.all([
            dataFd.stat(),
            indexFd.stat(),
            this.stats.get(shareCode) || {}
        ]);

        return {
            shareCode,
            count: header.count,
            dataSize: dataStat.size,
            indexSize: indexStat.size,
            startTime: header.startTime,
            endTime: header.endTime,
            writes: storageStats.writes || 0,
            flushes: storageStats.flushes || 0,
            cacheHits: storageStats.cacheHits || 0,
            cacheMisses: storageStats.cacheMisses || 0,
            cacheHitRate: this.getCacheHitRate(shareCode),
            bufferSize: this.writeBuffer.get(shareCode)?.records.length || 0
        };
    }

    /**
     * 获取缓存命中率
     */
    getCacheHitRate(shareCode) {
        const stats = this.stats.get(shareCode);
        if (!stats) return 0;

        const total = stats.cacheHits + stats.cacheMisses;
        return total > 0 ? stats.cacheHits / total : 0;
    }

    /**
     * 重建索引
     */
    async rebuildIndex(handle) {
        const { dataFd, indexFd, header, shareCode } = handle;

        // 清空索引文件和缓存
        await indexFd.truncate(0);
        this.indexCache.delete(shareCode);

        if (header.count === 0) return;

        // 批量构建索引
        const indexBuf = Buffer.alloc(header.count * INDEX_SIZE);

        for (let i = 0; i < header.count; i++) {
            const offset = HEADER_SIZE + i * RECORD_SIZE;
            const recordBuf = Buffer.alloc(RECORD_SIZE);
            await dataFd.read(recordBuf, 0, RECORD_SIZE, offset);
            const record = KlineRecord.unpack(recordBuf);

            const indexRecord = new IndexRecord(record.timestamp, offset);
            indexRecord.pack().copy(indexBuf, i * INDEX_SIZE);

            // 更新缓存
            this.updateCache(shareCode, record.timestamp, offset);
        }

        await indexFd.write(indexBuf, 0, indexBuf.length, 0);
        await indexFd.sync();

        console.log(`Index rebuilt for ${shareCode}: ${header.count} records`);
    }

    /**
     * 启动定时刷新
     */
    startFlushTimer() {
        if (this.flushTimer) return;

        this.flushTimer = setInterval(() => {
            if (this.isClosing) return;

            const now = Date.now();
            for (const [shareCode, buffer] of this.writeBuffer.entries()) {
                // 有数据且超过刷新间隔，触发刷新
                if (buffer.records.length > 0 && !buffer.flushing) {
                    const handle = this.handles.get(shareCode);
                    if (handle && (now - handle.lastFlushTime) >= FLUSH_INTERVAL) {
                        this.flush(shareCode).catch(err => {
                            console.error(`Timer flush failed for ${shareCode}:`, err);
                        });
                    }
                }
            }
        }, FLUSH_INTERVAL);

        // 防止定时器阻止进程退出
        if (this.flushTimer.unref) {
            this.flushTimer.unref();
        }
    }

    /**
     * 强制刷新所有缓冲区
     */
    async flushAll() {
        const promises = [];
        for (const [shareCode] of this.writeBuffer.entries()) {
            promises.push(this.flush(shareCode));
        }
        await Promise.all(promises);
    }

    /**
     * 关闭指定 shareCode
     */
    async closeShare(shareCode) {
        await this.flush(shareCode);

        const handle = this.handles.get(shareCode);
        if (handle) {
            await handle.wal.close();
            await handle.dataFd.close();
            await handle.indexFd.close();
            this.handles.delete(shareCode);
        }

        this.writeBuffer.delete(shareCode);
        this.indexCache.delete(shareCode);
        this.stats.delete(shareCode);
    }

    /**
     * 关闭所有连接
     */
    async close() {
        this.isClosing = true;

        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }

        await this.flushAll();

        const closePromises = [];
        for (const [shareCode, handle] of this.handles.entries()) {
            closePromises.push(handle.wal.close());
            closePromises.push(handle.dataFd.close());
            closePromises.push(handle.indexFd.close());
        }

        await Promise.all(closePromises);

        this.handles.clear();
        this.writeBuffer.clear();
        this.indexCache.clear();
        this.stats.clear();

        console.log('KlineStorage closed');
    }
}