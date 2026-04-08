import fs from 'fs/promises';
import path from 'path';
import {
    RECORD_SIZE, HEADER_SIZE,
    BATCH_SIZE, FLUSH_INTERVAL,
    WAL_CLEAR_THRESHOLD,
} from './Constants.js';
import { KlineRecord } from './KlineRecord.js';
import { KlineFileHeader } from './KlineFileHeader.js';
import { SimpleWAL } from './SimpleWAL.js';
import LRUCache from '../../../core/LRUCache.js';

export class KlineStorage {
    constructor(basePath) {
        this.basePath = basePath;
        // 存储句柄
        this.handles = new Map(); // shareCode => Handle
        // 写入缓冲区
        this.writeBuffer = new Map(); // shareCode => { records: [], flushing: false }
        // 限制缓存大小，防止内存爆掉
        this.CACHE_MAX_SIZE = 5000;
        // 二分查找位置缓存（LRU 可选，这里先简单缓存）
        this.recordCache = new LRUCache(this.CACHE_MAX_SIZE);

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

        const { dataPath, walPath } = this.getFilePaths(shareCode);
        await fs.mkdir(this.basePath, { recursive: true });

        // 并行打开文件
        const dataFd = await fs.open(dataPath, 'a+');

        const wal = new SimpleWAL(walPath);
        await wal.open();

        const header = new KlineFileHeader();
        const handle = {
            shareCode, dataFd, wal, header,
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
                const deserialized = KlineFileHeader.deserialize(headerBuf);
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
     * 写入单条记录
     */
    async append(shareCode, record) {
        if (!record.validate()) {
            throw new Error(`Invalid record for ${shareCode}: ${record.timestamp}`);
        }

        const handle = await this.open(shareCode);
        const endTime = handle.header.endTime || 0;
        if (record.timestamp <= endTime) {
            throw new Error(`Record timestamp ${record.timestamp} is not greater than current endTime ${endTime} for ${shareCode}`);
        }
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
        if (!records.length) return;
        for (const r of records) {
            if (!r.validate()) {
                throw new Error(`Invalid record in batch for ${shareCode}: ${r.timestamp}`)
            }
        }

        const handle = await this.open(shareCode);
        const endTime = handle.header.endTime || 0;

        // 二分查找：第一个 > endTime 的位置
        let left = 0;
        let right = records.length - 1;
        let firstValid = records.length; // 默认全部无效

        while (left <= right) {
            const mid = (left + right) >> 1;
            const ts = records[mid].timestamp;

            if (ts > endTime) {
                firstValid = mid;
                right = mid - 1;
            } else {
                left = mid + 1;
            }
        }

        // 直接截取有效数据（后面全部是新的）
        const newRecords = records.slice(firstValid);
        if (newRecords.length === 0) return;

        const buffer = this.writeBuffer.get(shareCode);

        if (!buffer) {
            throw new Error(`Buffer not initialized for ${shareCode}`);
        }

        buffer.records.push(...newRecords);

        const stats = this.stats.get(shareCode);
        stats.writes += newRecords.length;

        await this.flush(shareCode).catch(console.error);
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

            const { dataFd, wal, header } = handle;
            const records = buffer.records;

            // 写入WAL
            await wal.append(records);

            // 准备数据
            const dataBuf = Buffer.alloc(records.length * RECORD_SIZE);
            let dataOffset = 0;
            for (let i = 0; i < records.length; i++) {
                records[i].pack().copy(dataBuf, dataOffset);
                dataOffset += RECORD_SIZE;
            }

            const dataPos = HEADER_SIZE + header.count * RECORD_SIZE;
            await dataFd.write(dataBuf, 0, dataBuf.length, dataPos);
            // 更新头部
            if (records.length > 0) {
                header.updateTimeRange(records[0]); // 更新最小时间
                header.updateTimeRange(records[records.length - 1]); // 更新最大时间
            }
            header.count += records.length;

            const headerBuf = await header.serialize();
            await dataFd.write(headerBuf, 0, HEADER_SIZE, 0);

            // 强制刷盘
            await dataFd.sync();

            // 更新统计
            const stats = this.stats.get(shareCode);
            stats.flushes++;
            handle.lastFlushTime = Date.now();

            // 定期清理WAL
            if (header.count % WAL_CLEAR_THRESHOLD === 0) {
                await wal.clear();
            }
            // 刷新成功，清空缓冲区
            buffer.records = [];
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

    // 转秒级时间戳
    toSecTimestamp(time) {
        // 已经是数字时间戳 → 直接返回
        if (typeof time === 'number') {
            return time;
        }

        // 字符串日期 2020-01-02 → 转秒（本地时区 00:00:00）
        if (typeof time === 'string' && time.includes('-')) {
            const date = new Date(`${time} 00:00:00`);
            return Math.floor(date.getTime() / 1000);
        }

        // 字符串数字 "1577836800" → 转数字
        return Number(time);
    }

    /**
     * 查询K线数据（支持【查全部】+【查范围】）
     * @param {string} shareCode - 股票代码
     * @param {number|string} [startTime] - 开始时间（不传=最早）
     * @param {number|string} [endTime] - 结束时间（不传=最晚）
     * @returns {Promise<KlineRecord[]>}
     */
    async query(shareCode, startTime, endTime) {
        const handle = await this.open(shareCode);
        const { header, dataFd } = handle;
        if (header.count === 0) return [];

        // 兼容多种时间格式输入，统一转换为秒级时间戳
        const startTimestamp = startTime ? this.toSecTimestamp(startTime) : header.startTime;
        const endTimestamp = endTime ? this.toSecTimestamp(endTime) : header.endTime;

        // 查询范围完全不交集，直接返回空数组
        if (startTimestamp > header.endTime || endTimestamp < header.startTime) {
            return []
        }

        // 二分查找起始位置
        let left = 0;
        let right = header.count - 1;
        let startIdx = -1;

        // 如果查询范围不等于整个时间范围，才进行二分查找；否则直接从头开始读取
        if (startTimestamp == header.startTime && endTimestamp == header.endTime) {
            startIdx = 0;
        } else {
            while (left <= right) {
                const mid = (left + right) >> 1;
                const midRecord = await this.readCachedRecordAt(shareCode, handle, mid);

                if (midRecord.timestamp >= startTimestamp) {
                    startIdx = mid;
                    right = mid - 1;
                } else {
                    left = mid + 1;
                }
            }
        }


        if (startIdx === -1) return [];

        // 昨日收盘价
        let preClose = 0;
        if (startIdx == 0) {
            preClose = header.issuePrice;// 如果是第一天，获取收盘价
        } else {
            let record = this.readRecordAt(startIdx - 1); // 获取前一天的收盘价
            preClose = record.close;
        }

        // 按块大小批量读取
        const results = [];
        let currentPos = startIdx;
        const BLOCK_SIZE = 64 * 1024; // 64KB 块大小
        const RECORDS_PER_BLOCK = Math.floor(BLOCK_SIZE / RECORD_SIZE); // 64KB / 48B ≈ 1365 条/块

        while (currentPos < header.count) {
            // 计算本批次读取数量（不超过剩余数量）
            const batchCount = Math.min(header.count - currentPos, RECORDS_PER_BLOCK);
            const batchBytes = batchCount * RECORD_SIZE;
            const buffer = Buffer.alloc(batchBytes);
            const offset = HEADER_SIZE + currentPos * RECORD_SIZE;

            const { bytesRead } = await dataFd.read(buffer, 0, batchBytes, offset);
            const actualCount = Math.floor(bytesRead / RECORD_SIZE);

            // 解码并过滤
            let hasExceeded = false;
            for (let i = 0; i < actualCount; i++) {
                const record = KlineRecord.unpack(buffer.subarray(i * RECORD_SIZE, (i + 1) * RECORD_SIZE));
                record.setPreClose(preClose); // 必须设置收盘价，否则无法计算涨跌额和涨跌幅
                preClose = record.close;
                if (record.timestamp > endTimestamp) {
                    hasExceeded = true;
                    break;
                }
                results.push(record);
            }

            if (hasExceeded) break;
            currentPos += batchCount;
        }

        return results;
    }

    /**
     * 带缓存读取指定位置的记录（二分专用！）
     */
    async readCachedRecordAt(shareCode, handle, index) {
        const cacheKey = `${shareCode}:${index}`;
        // 命中缓存：直接内存返回（零IO）
        if (this.recordCache.has(cacheKey)) {
            return this.recordCache.get(cacheKey);
        }
        // 未命中：读磁盘
        const { dataFd } = handle;
        const offset = HEADER_SIZE + index * RECORD_SIZE;
        const buf = Buffer.alloc(RECORD_SIZE);
        await dataFd.read(buf, 0, RECORD_SIZE, offset);
        const record = KlineRecord.unpack(buf);

        // 写入缓存（控制大小，防溢出）
        this.recordCache.set(cacheKey, record);

        return record;
    }

    /**
     * 读取指定位置的记录,无缓存版本
     */
    async readRecordAt(handle, index) {
        const { dataFd } = handle;
        const offset = HEADER_SIZE + index * RECORD_SIZE;
        const buf = Buffer.alloc(RECORD_SIZE);
        await dataFd.read(buf, 0, RECORD_SIZE, offset);
        const record = KlineRecord.unpack(buf);
        return record;
    }

    async getFirst(shareCode) {
        const handle = await this.open(shareCode);
        if (handle.header.count === 0) return null;
        return this.readRecordAt(handle, 0);
    }

    async getLast(shareCode) {
        const handle = await this.open(shareCode);
        const count = handle.header.count;
        if (count === 0) return null;
        return this.readRecordAt(handle, count - 1);
    }

    async getCount(shareCode) {
        const handle = await this.open(shareCode);
        return handle.header.count;
    }

    /**
     * 恢复文件（修复不完整的记录）
     * @param {*} handle 
     */
    async recovery(handle) {
        const { dataFd, header } = handle;
        const stat = await dataFd.stat();

        const expectedSize = HEADER_SIZE + header.count * RECORD_SIZE;
        if (stat.size !== expectedSize) {
            console.warn(`File size mismatch for ${handle.shareCode}, repairing...`);
            const validSize = HEADER_SIZE + Math.floor((stat.size - HEADER_SIZE) / RECORD_SIZE) * RECORD_SIZE;
            if (validSize >= HEADER_SIZE) {
                await dataFd.truncate(validSize);
                header.count = (validSize - HEADER_SIZE) / RECORD_SIZE;
                const headerBuf = await header.serialize();
                await dataFd.write(headerBuf, 0, HEADER_SIZE, 0);
                await dataFd.sync();
            }
        }
    }

    /**
     * 获取统计信息
     */
    async getStats(shareCode) {
        const handle = await this.open(shareCode);
        const { header, dataFd } = handle;

        const [dataStat, storageStats] = await Promise.all([
            dataFd.stat(),
            this.stats.get(shareCode) || {}
        ]);

        return {
            shareCode,
            count: header.count,
            dataSize: dataStat.size,
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
            this.handles.delete(shareCode);
        }

        this.writeBuffer.delete(shareCode);
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
        }

        await Promise.all(closePromises);

        this.handles.clear();
        this.writeBuffer.clear();
        this.stats.clear();

        console.log('KlineStorage closed');
    }
}