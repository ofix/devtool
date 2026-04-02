// DataProviderManager.js
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import LRUCache from '../../../core/LRUCache.js';
import EastMoneyProvider from './EastMoneyProvider.js';
import TencentProvider from './TencentProvider.js';
import YahooProvider from './YahooProvider.js';
import BaiduFinanceProvider from './BaiduFinanceProvider.js';
import TushareProvider from './TushareProvider.js';
import Trie from "../../../core/Trie.js";
import csv from 'csv-parser';
import { KlineStorage } from '../storage/KlineStorage.js';
import { KlineRecord } from '../storage/KlineRecord.js';

class DataProviderManager {
    constructor() {
        this.providers = {
            eastmoney: new EastMoneyProvider(),
            tencent: new TencentProvider(),
            yahoo: new YahooProvider(),
            baidu: new BaiduFinanceProvider(),
            tushare: new TushareProvider(),
        };
        this.activeProvider = 'eastmoney';

        // 统一缓存结构
        this.cache = {
            daily: new LRUCache(500),      // 日K缓存
            weekly: new LRUCache(300),     // 周K缓存
            monthly: new LRUCache(300),    // 月K缓存
            yearly: new LRUCache(200),     // 年K缓存
            minute: new LRUCache(100),     // 分时缓存
            stock: new LRUCache(1)         // 股票列表缓存
        };

        // 除权信息缓存
        this.adjustCache = new LRUCache(1000);

        // 搜索索引
        this.trie = new Trie();
        this.loaded = false;

        // 存储实例
        this.storage = null;
        this.diskKlineDir = '';
        this.diskEnabled = true;

        // 定时器ID（用于清理）
        this.timers = [];

        // 加载状态
        this.loadingPromises = new Map();

        // 统计信息
        this.stats = {
            cacheHits: 0,
            cacheMisses: 0,
            storageReads: 0,
            storageWrites: 0,
            providerCalls: 0
        };

        this._init();
    }

    async _init() {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        this.diskKlineDir = path.join(__dirname, '../../../data/klines');

        // 初始化存储
        this.storage = new KlineStorage(this.diskKlineDir);
        await this.storage.init();

        // 分时缓存自动清理
        const minuteCleanupTimer = setInterval(() => {
            this._cleanMinuteCache();
        }, 30000);
        this.timers.push(minuteCleanupTimer);

        // 定期刷新统计（可选）
        if (process.env.NODE_ENV === 'development') {
            const statsTimer = setInterval(() => {
                this._logStats();
            }, 60000);
            this.timers.push(statsTimer);
        }
    }

    /**
     * 清理过期的分时缓存
     */
    _cleanMinuteCache() {
        const now = Date.now();
        const expireTime = 5 * 60 * 1000; // 5分钟

        for (const [key, value] of this.cache.minute.cache.entries()) {
            if (now - (value.timestamp || 0) > expireTime) {
                this.cache.minute.delete(key);
            }
        }
    }

    /**
     * 记录统计信息
     */
    _logStats() {
        const totalAccess = this.stats.cacheHits + this.stats.cacheMisses;
        const hitRate = totalAccess > 0 ? (this.stats.cacheHits / totalAccess * 100).toFixed(2) : 0;

        console.log('[DataProviderManager Stats]', {
            cacheHitRate: `${hitRate}%`,
            storageReads: this.stats.storageReads,
            storageWrites: this.stats.storageWrites,
            providerCalls: this.stats.providerCalls,
            cacheSizes: {
                daily: this.cache.daily.size(),
                weekly: this.cache.weekly.size(),
                monthly: this.cache.monthly.size(),
                minute: this.cache.minute.size()
            }
        });
    }

    async closeAll() {
        // 清理所有定时器
        for (const timer of this.timers) {
            clearInterval(timer);
        }
        this.timers = [];

        // 关闭存储
        if (this.storage) {
            await this.storage.close();
        }

        // 清理所有缓存
        Object.values(this.cache).forEach(cache => cache.clear());
        this.adjustCache.clear();
        this.loadingPromises.clear();

        console.log('DataProviderManager closed');
    }

    // ==================== 统一 K线入口 ====================
    async getKLineData(code, market, period, startDate, endDate, options = {}) {
        const {
            forceRefresh = false,
            adjustType = 'forward',
            checkAdjustment = true
        } = options;

        // 参数验证
        if (!code || !market) {
            throw new Error(`Invalid parameters: code=${code}, market=${market}`);
        }

        const periodKey = this._getPeriodKey(period);
        const cacheKey = this._getCacheKey(code, adjustType, period);

        // 起始时间戳（用于存储查询）
        const startTimestamp = startDate ? new Date(startDate).getTime() : 0;
        const endTimestamp = endDate ? new Date(endDate).getTime() : Date.now();

        // 除权检查
        let needRefresh = false;
        if (checkAdjustment && adjustType !== 'none') {
            needRefresh = await this._checkAndUpdateAdjustment(code, market);
            if (needRefresh) {
                // 清除所有周期的缓存
                this._clearCodeCache(code);
            }
        }

        // 内存缓存检查
        if (!forceRefresh && !needRefresh) {
            const cached = this.cache[periodKey]?.get(cacheKey);
            if (cached) {
                this.stats.cacheHits++;
                const filtered = this._filterByDate(cached, startDate, endDate);
                if (filtered.length > 0 || cached.length === 0) {
                    return filtered;
                }
                // 缓存数据不足，继续从存储读取
            }
        }

        this.stats.cacheMisses++;

        // 获取日K数据（唯一数据源）
        const dailyList = await this._getDailyKLine(
            code, market, startTimestamp, endTimestamp, forceRefresh || needRefresh
        );

        if (!dailyList?.length) return [];

        // 周期聚合
        let result = dailyList;
        switch (periodKey) {
            case 'weekly':
                result = this._aggregateWeekly(dailyList);
                break;
            case 'monthly':
                result = this._aggregateMonthly(dailyList);
                break;
            case 'yearly':
                result = this._aggregateYearly(dailyList);
                break;
        }

        // 缓存结果
        this.cache[periodKey].set(cacheKey, result);

        return this._filterByDate(result, startDate, endDate);
    }

    /**
     * 获取缓存键
     */
    _getCacheKey(code, adjustType, period) {
        return `${code}_${adjustType}_${period}`;
    }

    /**
     * 清除指定代码的所有缓存
     */
    _clearCodeCache(code) {
        const patterns = ['daily', 'weekly', 'monthly', 'yearly'];
        for (const pattern of patterns) {
            const cache = this.cache[pattern];
            for (const [key] of cache.cache.entries()) {
                if (key.startsWith(code)) {
                    cache.delete(key);
                }
            }
        }
    }

    // ==================== 日K读取逻辑（优化版） ====================
    async _getDailyKLine(code, market, startTimestamp, endTimestamp, forceRefresh) {
        const cacheKey = `${code}_forward_daily`;

        // 检查内存缓存
        if (!forceRefresh) {
            const cached = this.cache.daily.get(cacheKey);
            if (cached) {
                // 检查缓存是否覆盖所需范围
                if (this._isCacheSufficient(cached, startTimestamp, endTimestamp)) {
                    this.stats.cacheHits++;
                    return this._filterByTimestamp(cached, startTimestamp, endTimestamp);
                }
            }
        }

        this.stats.cacheMisses++;

        // 从存储读取（使用时间范围，提高效率）
        let records = [];
        try {
            this.stats.storageReads++;
            records = await this.storage.query(code, startTimestamp, endTimestamp);

            if (records && records.length > 0) {
                const list = this._recordsToKlineList(records);
                this.cache.daily.set(cacheKey, list);
                return this._filterByTimestamp(list, startTimestamp, endTimestamp);
            }
        } catch (e) {
            console.warn(`读取 ${code} 日K失败:`, e.message);
        }

        // 从网络拉取
        return this._fetchAndSaveDaily(code, market, startTimestamp, endTimestamp);
    }

    /**
     * 检查缓存是否足够覆盖查询范围
     */
    _isCacheSufficient(cached, startTimestamp, endTimestamp) {
        if (!cached || cached.length === 0) return false;

        const firstDate = new Date(cached[0].date).getTime();
        const lastDate = new Date(cached[cached.length - 1].date).getTime();

        return firstDate <= startTimestamp && lastDate >= endTimestamp;
    }

    /**
     * 将 KlineRecord 数组转换为普通对象数组
     */
    _recordsToKlineList(records) {
        return records.map(record => ({
            date: record.timestamp,
            open: record.open,
            high: record.high,
            low: record.low,
            close: record.close,
            volume: record.volume,
            amount: record.amount
        }));
    }

    /**
     * 按时间戳过滤
     */
    _filterByTimestamp(list, startTimestamp, endTimestamp) {
        if (!list?.length) return [];
        return list.filter(item => {
            const time = item.timestamp || new Date(item.date).getTime();
            return (!startTimestamp || time >= startTimestamp) &&
                (!endTimestamp || time <= endTimestamp);
        });
    }

    // ==================== 拉取 + 写入存储 ====================
    async _fetchAndSaveDaily(code, market, startTimestamp, endTimestamp) {
        // 防止并发拉取同一只股票
        const loadingKey = `${code}_${market}`;
        if (this.loadingPromises.has(loadingKey)) {
            return this.loadingPromises.get(loadingKey);
        }

        const promise = this._doFetchAndSaveDaily(code, market, startTimestamp, endTimestamp);
        this.loadingPromises.set(loadingKey, promise);

        try {
            const result = await promise;
            return result;
        } finally {
            this.loadingPromises.delete(loadingKey);
        }
    }

    async _doFetchAndSaveDaily(code, market, startTimestamp, endTimestamp) {
        const cacheKey = `${code}_forward_daily`;
        const provider = this._getProvider(market);

        this.stats.providerCalls++;

        // 计算拉取的天数范围
        const startDate = startTimestamp ? new Date(startTimestamp) : new Date(0);
        const endDate = endTimestamp ? new Date(endTimestamp) : new Date();
        const days = Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000));

        let data;
        try {
            data = await provider.getKLineData(code, market, '1d', startTimestamp, endTimestamp);
            if (!data?.length) {
                // 如果指定范围没数据，尝试拉取最近数据
                data = await provider.getKLineData(code, market, '1d', 0, Date.now());
            }
        } catch (err) {
            console.error(`拉取 ${code} 日K失败:`, err.message);
            return [];
        }

        if (!data?.length) return [];

        // 转换并写入存储
        const records = data.map(item => {
            const timestamp = item.date || item.trade_date;
            // 确保有 amount 字段
            const amount = item.amount || (item.volume * (item.open + item.close) / 2);

            return new KlineRecord(
                typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime(),
                item.open,
                item.high,
                item.low,
                item.close,
                item.volume,
                amount
            );
        });

        this.stats.storageWrites++;
        await this.storage.batchAppend(code, records);

        const list = this._recordsToKlineList(records);
        this.cache.daily.set(cacheKey, list);

        return list;
    }

    // ==================== 周期聚合（优化版） ====================
    _aggregateWeekly(daily) {
        const map = new Map();

        for (const k of daily) {
            const date = new Date(k.date);
            const year = date.getFullYear();
            // 更准确的周计算
            const firstDayOfYear = new Date(year, 0, 1);
            const dayOfYear = Math.floor((date - firstDayOfYear) / (24 * 60 * 60 * 1000));
            const weekNum = Math.ceil((dayOfYear + firstDayOfYear.getDay() + 1) / 7);
            const key = `${year}-W${weekNum.toString().padStart(2, '0')}`;

            if (!map.has(key)) {
                map.set(key, { ...k });
            } else {
                const item = map.get(key);
                item.high = Math.max(item.high, k.high);
                item.low = Math.min(item.low, k.low);
                item.close = k.close;
                item.volume += k.volume;
                item.amount = (item.amount || 0) + (k.amount || 0);
            }
        }

        return Array.from(map.values());
    }

    _aggregateMonthly(daily) {
        const map = new Map();

        for (const k of daily) {
            const date = new Date(k.date);
            const key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;

            if (!map.has(key)) {
                map.set(key, { ...k });
            } else {
                const item = map.get(key);
                item.high = Math.max(item.high, k.high);
                item.low = Math.min(item.low, k.low);
                item.close = k.close;
                item.volume += k.volume;
                item.amount = (item.amount || 0) + (k.amount || 0);
            }
        }

        return Array.from(map.values());
    }

    _aggregateYearly(daily) {
        const map = new Map();

        for (const k of daily) {
            const year = new Date(k.date).getFullYear();
            const key = year.toString();

            if (!map.has(key)) {
                map.set(key, { ...k });
            } else {
                const item = map.get(key);
                item.high = Math.max(item.high, k.high);
                item.low = Math.min(item.low, k.low);
                item.close = k.close;
                item.volume += k.volume;
                item.amount = (item.amount || 0) + (k.amount || 0);
            }
        }

        return Array.from(map.values());
    }

    // ==================== 除权检查 ====================
    async _checkAndUpdateAdjustment(code, market) {
        try {
            const cachedInfo = this.adjustCache.get(code);
            const provider = this._getProvider(market);

            let latestInfo = null;
            if (provider.getAdjustFactor) {
                latestInfo = await provider.getAdjustFactor(code);
            }

            if (!latestInfo) return false;

            if (!cachedInfo) {
                this.adjustCache.set(code, latestInfo);
                await this._saveAdjustInfo(code, latestInfo);
                return false;
            }

            const changed =
                cachedInfo.lastAdjustDate !== latestInfo.lastAdjustDate ||
                Math.abs((cachedInfo.adjustFactor || 1) - (latestInfo.adjustFactor || 1)) > 0.0001;

            if (changed) {
                this.adjustCache.set(code, latestInfo);
                await this._saveAdjustInfo(code, latestInfo);
                return true;
            }

            return false;
        } catch (err) {
            console.error(`除权检查失败 ${code}:`, err.message);
            return false;
        }
    }

    async _saveAdjustInfo(code, info) {
        if (!this.diskEnabled) return;

        try {
            const file = path.join(this.diskKlineDir, `${code}_adjust.json`);
            await fs.writeFile(file, JSON.stringify({
                ...info,
                updateTime: Date.now()
            }, null, 2));
        } catch (err) {
            console.error(`保存除权信息失败 ${code}:`, err.message);
        }
    }

    // ==================== 工具函数 ====================
    _getPeriodKey(period) {
        const map = {
            '1d': 'daily',
            '1w': 'weekly',
            '1M': 'monthly',
            '1y': 'yearly'
        };
        return map[period] || 'daily';
    }

    _filterByDate(data, startDate, endDate) {
        if (!data?.length) return [];

        const start = startDate ? new Date(startDate).getTime() : 0;
        const end = endDate ? new Date(endDate).getTime() : Infinity;

        return data.filter(item => {
            const time = item.date ? new Date(item.date).getTime() : item.timestamp;
            return time >= start && time <= end;
        });
    }

    _getProvider(market) {
        // 港股和美股使用腾讯数据源
        if (market === 'hk' || market === 'us') {
            return this.providers.tencent;
        }
        return this.providers[this.activeProvider];
    }

    _parseCode(code) {
        if (code.startsWith('hk')) return { market: 'hk', symbol: code.slice(2) };
        if (code.startsWith('us')) return { market: 'us', symbol: code.slice(2) };
        if (code.startsWith('sh') || code.startsWith('sz')) {
            return { market: 'a', symbol: code };
        }
        return { market: 'a', symbol: code };
    }

    // ==================== 分时、股票列表、搜索 ====================
    async getMinuteData(codes, days = 1) {
        const isSingle = !Array.isArray(codes);
        const list = isSingle ? [codes] : codes;
        const key = list.join(',');

        const cached = this.cache.minute.get(key);
        if (cached && (Date.now() - cached.timestamp) < 30000) {
            this.stats.cacheHits++;
            return isSingle ? cached.data[0] : cached.data;
        }

        this.stats.cacheMisses++;

        const results = await Promise.all(
            list.map(async code => {
                const { market, symbol } = this._parseCode(code);
                const provider = this._getProvider(market);
                try {
                    return await provider.getMinuteData(symbol, market, days);
                } catch (err) {
                    console.error(`获取分时数据失败 ${code}:`, err.message);
                    return null;
                }
            })
        );

        const resultData = isSingle ? results[0] :
            Object.fromEntries(list.map((c, i) => [c, results[i]]));

        this.cache.minute.set(key, {
            data: resultData,
            timestamp: Date.now()
        });

        return resultData;
    }

    async getStockList() {
        const cached = this.cache.stock.get('list');
        if (cached && (Date.now() - cached.timestamp) < 3600000) { // 1小时缓存
            this.stats.cacheHits++;
            return cached.data;
        }

        this.stats.cacheMisses++;

        try {
            const list = await this.providers.eastmoney.getStockList();
            this.cache.stock.set('list', {
                data: list,
                timestamp: Date.now()
            });
            return list;
        } catch (err) {
            console.error('获取股票列表失败:', err.message);
            return cached?.data || [];
        }
    }

    async searchLocalStock(keyword) {
        if (!this.loaded) {
            await this._loadStockIndex();
        }

        if (!keyword) return [];
        return this.trie.search(keyword.toLowerCase());
    }

    async _loadStockIndex() {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const csvPath = path.join(__dirname, '../../../data/stock_list.csv');

        return new Promise((resolve, reject) => {
            const stream = require('fs').createReadStream(csvPath);
            stream.pipe(csv({ headers: false }))
                .on('data', (row) => {
                    const stock = {
                        code: row[0],
                        name: row[1],
                        market: row[3],
                        pinyin: row[5]
                    };
                    this.trie.insert(stock.code, stock);
                    this.trie.insert(stock.name, stock);
                    if (stock.pinyin) {
                        this.trie.insert(stock.pinyin.toLowerCase(), stock);
                    }
                })
                .on('end', () => {
                    this.loaded = true;
                    resolve();
                })
                .on('error', reject);
        });
    }

    /**
     * 获取统计信息
     */
    getStats() {
        const totalAccess = this.stats.cacheHits + this.stats.cacheMisses;
        return {
            ...this.stats,
            hitRate: totalAccess > 0 ? (this.stats.cacheHits / totalAccess * 100).toFixed(2) : 0,
            cacheSizes: {
                daily: this.cache.daily.size(),
                weekly: this.cache.weekly.size(),
                monthly: this.cache.monthly.size(),
                yearly: this.cache.yearly.size(),
                minute: this.cache.minute.size()
            }
        };
    }

    /**
     * 预热缓存（预加载常用股票数据）
     */
    async warmup(codes, market) {
        const promises = codes.map(code =>
            this.getKLineData(code, market, '1d', 0, Date.now(), { forceRefresh: false })
                .catch(err => console.error(`预热失败 ${code}:`, err.message))
        );
        await Promise.all(promises);
        console.log(`预热完成: ${codes.length} 只股票`);
    }
}

// 单例导出
let instance = null;

export default function getDataProviderManager() {
    if (!instance) {
        instance = new DataProviderManager();
    }
    return instance;
}