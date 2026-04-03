import path from "path";
import { join, dirname } from 'node:path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import csv from 'csv-parser';
import LRUCache from '../../core/LRUCache.js';
import Trie from "../../core/Trie.js";
import EastMoneyProvider from './providers/EastMoneyProvider.js';
import TencentProvider from './providers/TencentProvider.js';
import YahooProvider from './providers/YahooProvider.js';
import BaiduFinanceProvider from './providers/BaiduFinanceProvider.js';
import SinaProvider from "./providers/SinaProvider.js";
import TushareProvider from './providers/TushareProvider.js';
import { KlineStorage } from './storage/KlineStorage.js';
import { KlineRecord } from './storage/KlineRecord.js';

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default class StockManager {
    constructor() {
        this.providers = {
            eastmoney: new EastMoneyProvider(), // 东方财富
            tencent: new TencentProvider(),     // 腾讯财经
            yahoo: new YahooProvider(),         // 雅虎财经
            baidu: new BaiduFinanceProvider(),  // 百度财经
            tushare: new TushareProvider(),     // Tushare数据
            sina: new SinaProvider(),           // 新浪财经
        };
        this.activeProvider = 'eastmoney';

        // 统一缓存结构
        this.cache = {
            day: new LRUCache(500),        // 日K缓存
            week: new LRUCache(300),       // 周K缓存
            week: new LRUCache(300),       // 月K缓存
            year: new LRUCache(200),       // 年K缓存
            minute: new LRUCache(100),     // 分时缓存
            fiveMinute: new LRUCache(100), // 5日分时
            stock: new LRUCache(1)         // 股票列表缓存
        };

        // 除权信息缓存
        this.adjustCache = new LRUCache(1000);

        // 自选股
        this.favoriteShares = []; // 自选股列表
        this.favoriteFilePath = path.join(__dirname, '../../../data/favorite_shares.json');
        // 股票列表
        this.allShares = []; // A股全市场股票列表
        // 代码=>股票映射
        this.codeShareMap = new Map();

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

    /**
     * 切换财经数据供应商
     */
    setProvider(provider) {
        let providers = {
            "eastmoney": "东方财富",
            "tencent": "腾讯财经",
            "yahoo": "雅虎财经",
            "baidu": "百度财经",
            "tushare": "Tushare数据",
            "sina": "新浪财经",
        }
        if (providers.hasOwnProperty(provider)) {
            this.activeProvider = provider;
        }
    }

    async _init() {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        this.diskKlineDir = path.join(__dirname, '../../../data/day');

        // 初始化存储
        this.storage = new KlineStorage(this.diskKlineDir);
        await this.storage.init();
        await this._loadStockList();
        this._loadFavoriteShares();

        // 分时缓存自动清理
        // const minuteCleanupTimer = setInterval(() => {
        //     this._cleanMinuteCache();
        // }, 30000);
        // this.timers.push(minuteCleanupTimer);
    }

    /**
     * 从文件 favorites.json 中加载自选股
     * 文件格式: ["688203","322001","000001"]
     */
    _loadFavoriteShares() {
        try {
            if (fs.existsSync(this.favoriteFilePath)) {
                const data = fs.readFileSync(this.favoriteFilePath, 'utf8');
                const parsed = JSON.parse(data);
                // 确保是数组格式
                if (Array.isArray(parsed)) {
                    // 去重并过滤无效数据
                    this.favoriteShares = [...new Set(parsed.filter(code => code && typeof code === 'string'))];
                } else {
                    console.warn('自选股文件格式错误，使用空列表');
                    this.favoriteShares = [];
                }
            } else {
                // 文件不存在，创建空数组
                this.favoriteShares = [];
            }
        } catch (err) {
            console.error('加载自选股文件失败:', err);
            this.favoriteShares = [];
        }
    }

    /**
     * 保存自选股到文件
     * @private
     */
    _saveFavoriteShares() {
        try {
            fs.writeFileSync(this.favoriteFilePath, JSON.stringify(this.favoriteShares, null, 2), 'utf8');
        } catch (err) {
            console.error('保存自选股文件失败:', err);
        }
    }

    getFavoriteShares() {
        return this.favoriteShares;
    }

    /**
    * 添加自选股（自动去重）
    * @param {string} code - 股票代码（如 '688203' 或 '322001'）
    * @returns {boolean} 是否添加成功
    */
    addFavoriteShare(code) {
        // 参数校验
        if (!code || typeof code !== 'string') {
            console.error('股票代码不能为空');
            return false;
        }

        // 标准化代码格式：去除空格，统一为字符串
        const normalizedCode = code.trim();

        // 检查是否已存在
        if (this.favoriteShares.includes(normalizedCode)) {
            console.log(`股票 ${normalizedCode} 已在自选股中`);
            return false;
        }

        // 添加并保存
        this.favoriteShares.push(normalizedCode);
        this._saveFavoriteShares();
        console.log(`成功添加自选股: ${normalizedCode}`);
        return true;
    }

    /**
       * 删除自选股
       * @param {string} code - 股票代码
       * @returns {boolean} 是否删除成功
       */
    delFavoriteShare(code) {
        if (!code || typeof code !== 'string') {
            console.error('股票代码不能为空');
            return false;
        }

        const normalizedCode = code.trim();
        const index = this.favoriteShares.indexOf(normalizedCode);

        if (index === -1) {
            console.log(`股票 ${normalizedCode} 不在自选股中`);
            return false;
        }

        // 删除并保存
        this.favoriteShares.splice(index, 1);
        this._saveFavoriteShares();
        console.log(`成功删除自选股: ${normalizedCode}`);
        return true;
    }

    /**
     * 批量删除自选股
     * @param {Array} codes - 股票代码数组
     * @returns {Object} 删除结果统计
     */
    delFavoriteShares(codes) {
        if (!Array.isArray(codes)) {
            console.error('参数必须是数组');
            return { success: 0, failed: 0, notFound: 0 };
        }

        let success = 0;
        let notFound = 0;

        codes.forEach(code => {
            if (!code || typeof code !== 'string') {
                return;
            }

            const normalizedCode = code.trim();
            const index = this.favoriteShares.indexOf(normalizedCode);

            if (index !== -1) {
                this.favoriteShares.splice(index, 1);
                success++;
            } else {
                notFound++;
            }
        });

        if (success > 0) {
            this._saveFavoriteShares();
        }

        console.log(`批量删除完成: 成功${success}个, 未找到${notFound}个`);
        return { success, notFound };
    }

    /**
     * 清空所有自选股
     * @returns {boolean}
     */
    clearAllFavoriteShares() {
        if (this.favoriteShares.length === 0) {
            console.log('自选股列表已为空');
            return false;
        }

        this.favoriteShares = [];
        this._saveFavoriteShares();
        console.log('已清空所有自选股');
        return true;
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

        console.log('[StockManager Stats]', {
            cacheHitRate: `${hitRate}%`,
            storageReads: this.stats.storageReads,
            storageWrites: this.stats.storageWrites,
            providerCalls: this.stats.providerCalls,
            cacheSizes: {
                day: this.cache.day.size(),
                week: this.cache.week.size(),
                month: this.cache.month.size(),
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

        console.log('StockManager closed');
    }

    /**
     * 获取 A股全市场 涨幅榜/跌幅榜 前N只股票
     * @param {number} n - 获取股票数量
     * @param {string} order - top=涨幅榜, bottom=跌幅榜
     * @returns {Promise<Array>} 带实时行情的排行榜数据
     */
    async getShareRankList(n, order = "top") {
        const provider = this._getProvider(market);
        this.stats.providerCalls++;
        if (n > 100) {
            n = 100;
        }
        if (n < 10) {
            n = 10;
        }

        let data;
        try {
            data = await provider.getShareRankList(n, order);
        } catch (err) {
            if (order == "top") {
                console.error(`拉取涨幅榜前${n}只股票失败，`, err.message);
            } else {
                console.error(`拉取跌幅榜前${n}只股票失败，`, err.message);
            }
            return [];
        }

        if (!data?.length) return [];
        return data;
    }

    print(shareList) {
        console.log("+++++++++++++++++++++++++++++++++++++");
        for (let i = 0; i < shareList.length; i++) {
            const share = shareList[i];
            console.log(`代码:${share.code},名称:${share.name},涨幅:${share.changePercent},当前价:${share.price},开盘价:${share.open},最高价:${share.high},最低价:${share.low},成交额:${share.amount},成交量:${share.volume}`);
        }
        console.log("+++++++++++++++++++++++++++++++++++++");
        this.#printProvider();
    }

    #printProvider() {
        let providers = {
            "eastmoney": "东方财富",
            "tencent": "腾讯财经",
            "yahoo": "雅虎财经",
            "baidu": "百度财经",
            "tushare": "Tushare数据",
            "sina": "新浪财经",
        }
        if (providers.hasOwnProperty(this.activeProvider)) {
            console.log(`数据源自 ${providers[this.activeProvider]}`);
        }
    }

    /**
     * 获取 日/周/月/年 K线
     * @param {string} code 股票号码
     * @param {string} market 市场代号,SH-沪市,SZ-深市
     * @param {string} period 周期，day|week|month|year
     * @param {string} startDate 开始时间 日期格式 yyyy-mm-dd
     * @param {string} endDate 结束时间 日期格式 yyyy-mm-dd
     * @param {Object} options 请求选项
     */
    async getKlines(code, market, period, startDate, endDate, options = {}) {
        const {
            forceRefresh = false,
            adjustType = 'forward',
            checkAdjustment = false
        } = options;

        // 参数验证
        if (!code || !market) {
            throw new Error(`Invalid parameters: code=${code}, market=${market}`);
        }

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
            const cached = this.cache[period]?.get(code);
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
        const dailyList = await this._getDayKlines(
            code, market, startTimestamp, endTimestamp, forceRefresh || needRefresh
        );

        if (!dailyList?.length) return [];

        // 周期聚合
        let result = dailyList;
        switch (period) {
            case 'week':
                result = this._getWeekKlines(dailyList);
                break;
            case 'month':
                result = this._getMonthKlines(dailyList);
                break;
            case 'year':
                result = this._getYearKlines(dailyList);
                break;
        }

        // 缓存结果
        this.cache[period].set(code, result);

        return this._filterByDate(result, startDate, endDate);
    }

    /**
     * 输出K线数据
     * @param {Array} data 日/周/月/年股票列表
     */
    printKline(data) {
        if (!data || data.length === 0) {
            console.log('无K线数据');
            return;
        }

        // 标题
        const headers = [
            '日期',
            '开盘',
            '收盘',
            '最高',
            '最低',
            '成交量',
            '成交额',
            '涨跌额',
            '涨跌幅(%)',
            '换手率(%)'
        ];

        // 打印表头
        console.log(headers.join('\t'));
        console.log('-'.repeat(120));

        // 逐行打印
        data.forEach(item => {
            const row = [
                item.date,
                item.open.toFixed(2),
                item.close.toFixed(2),
                item.high.toFixed(2),
                item.low.toFixed(2),
                item.volume.toLocaleString(),
                item.amount.toLocaleString(),
                item.change,
                item.changePercent,
                item.turnover
            ];
            console.log(row.join('\t'));
        });
    }

    /**
     * 清除指定代码的所有缓存
     */
    _clearCodeCache(code) {
        const patterns = ['day', 'week', 'month', 'year'];
        for (const pattern of patterns) {
            const cache = this.cache[pattern];
            for (const [key] of cache.cache.entries()) {
                if (key.startsWith(code)) {
                    cache.delete(key);
                }
            }
        }
    }

    // 日K读取逻辑
    async _getDayKlines(code, market, startTimestamp, endTimestamp, forceRefresh) {
        // 检查内存缓存
        if (!forceRefresh) {
            const cached = this.cache.day.get(code);
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
                this.cache.day.set(code, list);
                return this._filterByTimestamp(list, startTimestamp, endTimestamp);
            }
        } catch (e) {
            console.warn(`读取 ${code} 日K失败:`, e.message);
        }

        // 从网络拉取
        return this._fetchAndSaveDayKlines(code, market, startTimestamp, endTimestamp);
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

    // 拉取 + 写入存储
    async _fetchAndSaveDayKlines(code, market, startTimestamp, endTimestamp) {
        // 防止并发拉取同一只股票
        const loadingKey = `${code}_${market}`;
        if (this.loadingPromises.has(loadingKey)) {
            return this.loadingPromises.get(loadingKey);
        }

        const promise = this._doFetchAndSaveDayKlines(code, market, startTimestamp, endTimestamp);
        this.loadingPromises.set(loadingKey, promise);

        try {
            const result = await promise;
            return result;
        } finally {
            this.loadingPromises.delete(loadingKey);
        }
    }

    async _doFetchAndSaveDayKlines(code, market, startTimestamp, endTimestamp) {
        const provider = this._getProvider(market);
        this.stats.providerCalls++;
        // 计算拉取的天数范围
        const startDate = startTimestamp ? new Date(startTimestamp) : new Date(0);
        const endDate = endTimestamp ? new Date(endTimestamp) : new Date();
        const days = Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000));

        let data;
        try {
            data = await provider.getKline(code, market, 'day', startTimestamp, endTimestamp);
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
        this.cache.day.set(code, list);

        return list;
    }

    // 根据股票日K线获取股票周K线
    _getWeekKlines(day) {
        const map = new Map();

        for (const k of day) {
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

    // 基于股票日K线获取股票月线
    _getMonthKlines(day) {
        const map = new Map();

        for (const k of day) {
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

    // 基于股票日K线获取股票年K线
    _getYearKlines(day) {
        const map = new Map();

        for (const k of day) {
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

    // 除权检查
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

    // 工具函数
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

    // 分时、股票列表、搜索
    async getMinuteKlines(codes, days = 1) {
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
            await this._loadStockList();
        }

        if (!keyword) return [];
        return this.trie.search(keyword.toLowerCase());
    }

    // 加载本地股票列表
    async _loadStockList() {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const csvPath = path.join(__dirname, '../../data/stock_list.csv');

        return new Promise((resolve, reject) => {
            const stream = fs.createReadStream(csvPath);
            stream.pipe(csv({ headers: false }))
                .on('data', (row) => {
                    const stock = {
                        code: row[0],
                        name: row[1],
                        market: row[3],
                        pinyin: row[5]
                    };
                    this.allShares.push(stock);
                    this.codeShareMap[stock.code] = stock;
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
                day: this.cache.day.size(),
                week: this.cache.week.size(),
                month: this.cache.month.size(),
                year: this.cache.year.size(),
                minute: this.cache.minute.size()
            }
        };
    }

    /**
     * 预热缓存（预加载常用股票数据）
     */
    async warmup(codes, market) {
        const promises = codes.map(code =>
            this.getKlines(code, market, 'day', 0, Date.now(), { forceRefresh: false })
                .catch(err => console.error(`预热失败 ${code}:`, err.message))
        );
        await Promise.all(promises);
        console.log(`预热完成: ${codes.length} 只股票`);
    }
}