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

/**
 * 日K线二进制文件存储引擎
 * 特性：
 * 1. 二进制格式存储，读写性能极高
 * 2. 批量写入 + 定时刷盘，减少IO
 * 3. 可选WAL预写日志，保证宕机数据不丢失（默认关闭）
 * 4. 内存时间戳索引，二分查找0磁盘IO（核心优化）
 * 5. LRU缓存 + 批量读取，查询速度极快
 */
export class KlineStorage {
    /**
     * 构造函数
     * @param {string} basePath - 数据文件存储根目录
     * @param {boolean} enableWAL - 是否开启WAL（预写日志），默认关闭
     */
    constructor(basePath, enableWAL = false) {
        this.basePath = basePath;
        this.enableWAL = enableWAL;

        // 文件句柄缓存：shareCode => 文件句柄，避免重复打开文件
        this.handles = new Map();
        // 写入缓冲区：shareCode => 待刷盘数据，实现批量写入
        this.writeBuffer = new Map();
        // 单条K线记录LRU缓存，加速随机读取（二分/查询单条）
        this.CACHE_MAX_SIZE = 5000;
        this.recordCache = new LRUCache(this.CACHE_MAX_SIZE);

        // 核心优化：时间戳内存索引缓存
        // key: shareCode, value: 时间戳数组[]
        // 作用：一次性加载所有时间戳到内存，二分查找完全内存操作，0磁盘IO
        this.timeIndexCache = new Map();

        // 定时刷盘定时器
        this.flushTimer = null;
        // 关闭标记，防止关闭过程中重复操作
        this.isClosing = false;
        // 读写统计信息
        this.stats = new Map();
    }

    /**
     * 初始化存储引擎
     * 创建目录 + 启动刷盘定时器
     */
    async init() {
        await fs.mkdir(this.basePath, { recursive: true });
        this.startFlushTimer();
    }

    /**
     * 获取股票对应的数据文件路径
     * @param {string} shareCode - 股票代码
     * @returns 数据文件(.dat) + WAL文件(.wal)路径
     */
    getFilePaths(shareCode) {
        return {
            dataPath: path.join(this.basePath, `${shareCode}.dat`),
            walPath: path.join(this.basePath, `${shareCode}.wal`)
        };
    }

    /**
     * 打开股票数据文件（复用已打开的句柄）
     * 初始化文件头、WAL、缓冲区、统计信息
     */
    async open(shareCode) {
        // 复用句柄，避免重复打开
        if (this.handles.has(shareCode)) {
            return this.handles.get(shareCode);
        }

        const { dataPath, walPath } = this.getFilePaths(shareCode);
        await fs.mkdir(this.basePath, { recursive: true });
        // 打开数据文件（a+：可读可写，不存在则创建）
        const dataFd = await fs.open(dataPath, 'a+');

        // 仅开启WAL时初始化
        let wal = null;
        if (this.enableWAL) {
            wal = new SimpleWAL(walPath);
            await wal.open();
        }

        // 文件头对象
        const header = new KlineFileHeader();
        const handle = {
            shareCode, dataFd, wal, header,
            lastFlushTime: Date.now() // 最后刷盘时间
        };

        this.handles.set(shareCode, handle);

        // 初始化写入缓冲区
        if (!this.writeBuffer.has(shareCode)) {
            this.writeBuffer.set(shareCode, { records: [], flushing: false });
        }
        // 初始化统计信息
        if (!this.stats.has(shareCode)) {
            this.stats.set(shareCode, {
                writes: 0, flushes: 0,
                cacheHits: 0, cacheMisses: 0
            });
        }

        // 读取/初始化文件头
        await this.initHeader(handle);
        // 校验文件完整性
        await this.verifyFileIntegrity(handle);
        // WAL恢复（仅开启时执行）
        if (this.enableWAL) {
            await this.recovery(handle);
        }

        return handle;
    }

    /**
     * 初始化文件头
     * 读取文件头，损坏则自动重建
     */
    async initHeader(handle) {
        const { dataFd, header } = handle;
        try {
            const headerBuf = Buffer.alloc(HEADER_SIZE);
            const { bytesRead } = await dataFd.read(headerBuf, 0, HEADER_SIZE, 0);

            // 读取到完整头则反序列化
            if (bytesRead === HEADER_SIZE) {
                const deserialized = KlineFileHeader.deserialize(headerBuf);
                Object.assign(header, deserialized);
            } else {
                // 文件为空，创建新头
                await this.createNewHeader(handle);
            }
        } catch (err) {
            console.warn(`Header corrupted for ${handle.shareCode}, creating new:`, err.message);
            await this.createNewHeader(handle);
        }
    }

    /**
     * 创建并写入新的文件头
     */
    async createNewHeader(handle) {
        const { dataFd, header } = handle;
        const newHeader = new KlineFileHeader();
        const buf = newHeader.serialize();

        await dataFd.write(buf, 0, HEADER_SIZE, 0);
        await dataFd.sync(); // 强制刷盘，保证头不丢失
        Object.assign(header, newHeader);
    }

    /**
     * 校验文件大小是否完整
     * 防止程序崩溃导致文件半截写入
     */
    async verifyFileIntegrity(handle) {
        const { dataFd, header, shareCode } = handle;
        const stat = await dataFd.stat();
        // 期望文件大小 = 头大小 + 记录数 * 单条记录大小
        const expectedSize = HEADER_SIZE + header.count * RECORD_SIZE;

        if (stat.size !== expectedSize) {
            console.warn(`File size mismatch for ${shareCode}, repairing...`);
            await this.repairFile(handle);
        }
    }

    /**
     * 修复损坏的文件：截断到有效记录长度
     */
    async repairFile(handle) {
        const { dataFd, header } = handle;
        const stat = await dataFd.stat();

        // 计算有效数据长度（对齐到整数条记录）
        const validSize = HEADER_SIZE +
            Math.floor((stat.size - HEADER_SIZE) / RECORD_SIZE) * RECORD_SIZE;

        if (validSize >= HEADER_SIZE) {
            await dataFd.truncate(validSize); // 截断无效数据
            header.count = (validSize - HEADER_SIZE) / RECORD_SIZE;

            // 重新写入正确的头
            const hBuf = header.serialize();
            await dataFd.write(hBuf, 0, HEADER_SIZE, 0);
            await dataFd.sync();
        }
    }

    /**
     * 追加单条K线记录
     * 会校验时间顺序：必须严格递增
     */
    async append(shareCode, record) {
        // 数据合法性校验
        if (!record.validate()) {
            throw new Error(`Invalid record for ${shareCode}: ${record.timestamp}`);
        }

        const handle = await this.open(shareCode);
        const endTime = handle.header.endTime || 0;
        // 日K线时间必须严格递增
        if (record.timestamp <= endTime) {
            throw new Error(`Record timestamp ${record.timestamp} <= endTime ${endTime}`);
        }

        // 写入缓冲区
        const buffer = this.writeBuffer.get(shareCode);
        buffer.records.push(record);

        // 更新写入统计
        const stats = this.stats.get(shareCode);
        stats.writes++;

        // 达到批量大小，自动刷盘
        if (buffer.records.length >= BATCH_SIZE && !buffer.flushing) {
            this.flush(shareCode).catch(console.error);
        }
    }

    /**
     * 批量追加K线（高效写入）
     * 自动过滤已存在的历史数据
     */
    async batchAppend(shareCode, records) {
        if (!records.length) return;

        // 校验所有记录合法性
        for (const r of records) {
            if (!r.validate()) throw new Error(`Invalid record in batch ${shareCode}`);
        }

        const handle = await this.open(shareCode);
        const endTime = handle.header.endTime || 0;

        // 二分查找：找到第一个大于当前最后时间的记录位置
        let left = 0, right = records.length - 1, firstValid = records.length;
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

        // 只写入新增数据
        const newRecords = records.slice(firstValid);
        if (newRecords.length === 0) return;

        const buffer = this.writeBuffer.get(shareCode);
        buffer.records.push(...newRecords);

        // 更新统计
        const stats = this.stats.get(shareCode);
        stats.writes += newRecords.length;

        // 立即刷盘
        await this.flush(shareCode).catch(console.error);
    }

    /**
     * 核心优化函数,降低频繁查询IO
     * 获取股票所有时间戳的内存索引
     * 1. 缓存命中：直接返回内存数组
     * 2. 未命中：一次性读取全部数据，提取时间戳存入缓存
     * 二分查找100%内存操作
     */
    async getTimeIndex(shareCode) {
        // 缓存命中，直接返回
        if (this.timeIndexCache.has(shareCode)) {
            return this.timeIndexCache.get(shareCode);
        }

        const handle = await this.open(shareCode);
        const { header, dataFd } = handle;
        const count = header.count;

        // 空数据直接返回空数组
        if (count === 0) {
            this.timeIndexCache.set(shareCode, []);
            return [];
        }

        // 一次性读取所有K线数据（一次IO，性能极高）
        const buf = Buffer.alloc(count * RECORD_SIZE);
        await dataFd.read(buf, 0, buf.length, HEADER_SIZE);

        // 仅提取时间戳，生成索引数组
        const timestamps = new Array(count);
        for (let i = 0; i < count; i++) {
            // 时间戳在每条记录的前4个字节
            timestamps[i] = buf.readUInt32LE(i * RECORD_SIZE);
        }

        // 存入内存缓存
        this.timeIndexCache.set(shareCode, timestamps);
        return timestamps;
    }

    /**
     * 将缓冲区数据刷入磁盘
     * 带并发锁，防止多次同时刷盘
     */
    async flush(shareCode) {
        const buffer = this.writeBuffer.get(shareCode);
        // 无数据 / 正在刷盘：直接返回
        if (!buffer || buffer.records.length === 0 || buffer.flushing) return;

        // 加锁：防止并发刷盘
        buffer.flushing = true;
        try {
            const handle = this.handles.get(shareCode);
            if (!handle) { buffer.records = []; return; }

            const { dataFd, wal, header } = handle;
            const records = buffer.records;

            // WAL写入：仅开启时执行
            if (this.enableWAL && wal) await wal.append(records);

            // 批量序列化数据
            const dataBuf = Buffer.alloc(records.length * RECORD_SIZE);
            let offset = 0;
            for (const r of records) {
                r.pack().copy(dataBuf, offset);
                offset += RECORD_SIZE;
            }

            // 写入数据文件
            const pos = HEADER_SIZE + header.count * RECORD_SIZE;
            await dataFd.write(dataBuf, 0, dataBuf.length, pos);

            // 更新文件头：时间范围 + 记录总数
            if (records.length > 0) {
                header.updateTimeRange(records[0]);
                header.updateTimeRange(records[records.length - 1]);
            }
            header.count += records.length;

            // 写入更新后的文件头
            const headerBuf = header.serialize();
            await dataFd.write(headerBuf, 0, HEADER_SIZE, 0);
            // 强制刷盘，保证数据落地
            await dataFd.sync();

            // 更新统计
            const stats = this.stats.get(shareCode);
            stats.flushes++;
            handle.lastFlushTime = Date.now();

            // 定期清空WAL
            if (this.enableWAL && wal && header.count % WAL_CLEAR_THRESHOLD === 0) {
                await wal.clear();
            }

            // 清空缓冲区
            buffer.records = [];
            // 数据已更新，清空时间索引（下次查询自动重建）
            this.timeIndexCache.delete(shareCode);

        } catch (err) {
            console.error(`Flush failed ${shareCode}:`, err);
            throw err;
        } finally {
            // 释放锁
            const buffer = this.writeBuffer.get(shareCode);
            if (buffer) buffer.flushing = false;
        }
    }

    /**
     * 统一时间格式：转换为秒级时间戳
     * 支持：数字、日期字符串、时间戳字符串
     */
    toSecTimestamp(time) {
        if (typeof time === 'number') return time;
        // 2025-01-01 格式
        if (typeof time === 'string' && time.includes('-')) {
            return Math.floor(new Date(`${time} 00:00:00`).getTime() / 1000);
        }
        // 字符串数字
        return Number(time);
    }

    /**
     * 查询K线数据（支持范围查询 / 全量查询）
     * 优化点：纯内存二分查找起始位置，0磁盘IO
     */
    async query(shareCode, startTime, endTime) {
        const handle = await this.open(shareCode);
        const { header, dataFd } = handle;
        // 空数据直接返回
        if (header.count === 0) return [];

        // 统一转换为秒级时间戳
        const startTs = startTime ? this.toSecTimestamp(startTime) : header.startTime;
        const endTs = endTime ? this.toSecTimestamp(endTime) : header.endTime;

        // 查询范围无交集
        if (startTs > header.endTime || endTs < header.startTime) return [];

        // ====================== 纯内存二分查找（核心优化，0磁盘IO）
        const timestamps = await this.getTimeIndex(shareCode);
        let left = 0, right = timestamps.length - 1;
        let startIdx = 0;

        // 二分查找：第一个 >= 开始时间的索引
        while (left <= right) {
            const mid = (left + right) >> 1;
            const ts = timestamps[mid];
            if (ts >= startTs) {
                startIdx = mid;
                right = mid - 1;
            } else {
                left = mid + 1;
            }
        }

        // 获取昨日收盘价，用于计算涨跌
        let preClose = 0;
        if (startIdx === 0) {
            // 第一条数据：使用发行价
            preClose = header.issuePrice;
        } else {
            // 读取前一条记录的收盘价
            const r = await this.readRecordAt(handle, startIdx - 1);
            preClose = r.close;
        }

        // 批量读取数据（64KB块，减少IO次数）
        const results = [];
        let current = startIdx;
        const BLOCK_SIZE = 64 * 1024;
        const RECORDS_PER_BLOCK = Math.floor(BLOCK_SIZE / RECORD_SIZE);

        while (current < timestamps.length) {
            // 本批次读取数量
            const batch = Math.min(timestamps.length - current, RECORDS_PER_BLOCK);
            const buf = Buffer.alloc(batch * RECORD_SIZE);
            const offset = HEADER_SIZE + current * RECORD_SIZE;

            // 批量读取
            await dataFd.read(buf, 0, buf.length, offset);

            let breakFlag = false;
            for (let i = 0; i < batch; i++) {
                const ts = timestamps[current + i];
                // 超过结束时间，停止读取
                if (ts > endTs) {
                    breakFlag = true;
                    break;
                }
                // 解析记录
                const record = KlineRecord.unpack(buf.subarray(i * RECORD_SIZE, (i + 1) * RECORD_SIZE));
                record.setPreClose(preClose);
                preClose = record.close;
                results.push(record);
            }

            if (breakFlag) break;
            current += batch;
        }

        return results;
    }

    /**
     * 带LRU缓存的单条记录读取（二分查找专用）
     */
    async readCachedRecordAt(shareCode, handle, index) {
        const key = `${shareCode}:${index}`;
        // 缓存命中
        if (this.recordCache.has(key)) {
            this.stats.get(shareCode).cacheHits++;
            return this.recordCache.get(key);
        }

        // 磁盘读取
        const rec = await this.readRecordAt(handle, index);
        this.recordCache.set(key, rec);
        this.stats.get(shareCode).cacheMisses++;
        return rec;
    }

    /**
     * 无缓存读取单条记录
     */
    async readRecordAt(handle, index) {
        const { dataFd } = handle;
        const buf = Buffer.alloc(RECORD_SIZE);
        await dataFd.read(buf, 0, RECORD_SIZE, HEADER_SIZE + index * RECORD_SIZE);
        return KlineRecord.unpack(buf);
    }

    /**
     * 获取第一条K线
     */
    async getFirst(shareCode) {
        const h = await this.open(shareCode);
        return h.header.count ? this.readRecordAt(h, 0) : null;
    }

    /**
     * 获取最后一条K线
     */
    async getLast(shareCode) {
        const h = await this.open(shareCode);
        return h.header.count ? this.readRecordAt(h, h.header.count - 1) : null;
    }

    /**
     * 获取K线总条数
     */
    async getCount(shareCode) {
        const h = await this.open(shareCode);
        return h.header.count;
    }

    /**
     * WAL崩溃恢复：从未提交的WAL日志恢复数据
     * 仅开启WAL时生效
     */
    async recovery(handle) {
        if (!this.enableWAL || !handle.wal) return;

        const { shareCode, wal, header, dataFd } = handle;
        const recs = await wal.readAll();
        if (!recs.length) return;

        // 只恢复比当前最新数据新的记录
        const valid = recs.filter(r => r.timestamp > header.endTime);
        if (!valid.length) { await wal.clear(); return; }

        // 批量写入数据文件
        const buf = Buffer.alloc(valid.length * RECORD_SIZE);
        let off = 0;
        for (const r of valid) {
            r.pack().copy(buf, off); off += RECORD_SIZE;
        }

        await dataFd.write(buf, 0, buf.length, HEADER_SIZE + header.count * RECORD_SIZE);
        // 更新头
        header.count += valid.length;
        header.updateTimeRange(valid.at(-1));
        const hBuf = header.serialize();
        await dataFd.write(hBuf, 0, HEADER_SIZE, 0);
        await dataFd.sync();

        // 恢复完成，清空WAL
        await wal.clear();
    }

    /**
     * 获取存储统计信息（监控/调试用）
     */
    async getStats(shareCode) {
        const h = await this.open(shareCode);
        const [st, stats] = await Promise.all([h.dataFd.stat(), this.stats.get(shareCode) || {}]);
        const total = stats.cacheHits + stats.cacheMisses;
        return {
            shareCode,
            count: h.header.count,
            size: st.size,
            startTime: h.header.startTime,
            endTime: h.header.endTime,
            writes: stats.writes || 0,
            flushes: stats.flushes || 0,
            cacheHitRate: total ? (stats.cacheHits / total).toFixed(2) : 0,
            enableWAL: this.enableWAL
        };
    }

    /**
     * 启动定时刷盘：防止缓冲区数据长时间不落地
     */
    startFlushTimer() {
        if (this.flushTimer) return;

        this.flushTimer = setInterval(() => {
            if (this.isClosing) return;

            const now = Date.now();
            for (const [sc, buf] of this.writeBuffer.entries()) {
                // 有数据且超过刷盘间隔
                if (buf.records.length && !buf.flushing) {
                    const h = this.handles.get(sc);
                    if (h && now - h.lastFlushTime >= FLUSH_INTERVAL) {
                        this.flush(sc).catch(console.error);
                    }
                }
            }
        }, FLUSH_INTERVAL);

        // 允许事件循环退出
        this.flushTimer.unref?.();
    }

    /**
     * 刷盘所有股票的缓冲区
     */
    async flushAll() {
        await Promise.all(Array.from(this.writeBuffer.keys()).map(sc => this.flush(sc)));
    }

    /**
     * 关闭单个股票的文件句柄
     */
    async closeShare(shareCode) {
        await this.flush(shareCode);

        const h = this.handles.get(shareCode);
        if (h) {
            if (this.enableWAL && h.wal) await h.wal.close();
            await h.dataFd.close();
            this.handles.delete(shareCode);
        }

        // 清理缓存
        this.writeBuffer.delete(shareCode);
        this.stats.delete(shareCode);
        this.timeIndexCache.delete(shareCode);
    }

    /**
     * 关闭整个存储引擎
     * 安全刷盘 + 关闭所有文件 + 清理资源
     */
    async close() {
        this.isClosing = true;
        // 清理定时器
        clearInterval(this.flushTimer);
        this.flushTimer = null;

        // 刷盘所有数据
        await this.flushAll();

        // 关闭所有文件
        const tasks = [];
        for (const h of this.handles.values()) {
            if (this.enableWAL && h.wal) tasks.push(h.wal.close());
            tasks.push(h.dataFd.close());
        }
        await Promise.all(tasks);

        // 清空所有缓存
        this.handles.clear();
        this.writeBuffer.clear();
        this.stats.clear();
        this.timeIndexCache.clear();

        console.log('KlineStorage closed successfully');
    }
}