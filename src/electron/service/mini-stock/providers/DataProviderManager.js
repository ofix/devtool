import { join } from 'node:path';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import EastMoneyProvider from './EastMoneyProvider.js';
import TencentProvider from './TencentProvider.js';
import YahooProvider from './YahooProvider.js';
import BaiduFinanceProvider from './BaiduFinanceProvider.js';
import Utils from "../../../core/Utils.js";
import Trie from "../../../core/Trie.js";
import csv from 'csv-parser';

class DataProviderManager {
    constructor() {
        this.providers = {
            eastmoney: new EastMoneyProvider(),
            tencent: new TencentProvider(),
            yahoo: new YahooProvider(),
            baidu: new BaiduFinanceProvider()
        };
        this.activeProvider = 'eastmoney';
        this.cache = new Map(); // 数据缓存
        this.cacheDuration = 5000; // 缓存5秒
        this.trie = new Trie();
        this.loaded = false;
    }

    getStockCsvPath() {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        return path.join(__dirname, '../../../data/stock_list.csv');
    }

    async searchLocalStock(keyword) {
        if (!this.loaded) {
            let stockListPath = this.getStockCsvPath();
            await this.loadLocalStockList(stockListPath);
            this.loaded = true;
        }
        if (!keyword) return [];
        const key = keyword.trim();
        return this.trie.search(key.toLowerCase());
    }

    // 加载本地股票列表
    async loadLocalStockList(csvPath = 'stock_list.csv') {
        return new Promise((resolve, reject) => {
            const stockList = [];

            fs.createReadStream(csvPath)
                .pipe(
                    csv({
                        headers: false, // 无表头
                        skipLines: 0    // 不跳过任何行
                    })
                )
                .on('data', (row) => {
                    // 无表头 → 按索引读取
                    const stock = {
                        code: row[0]?.trim() || '',       // 第1列：股票代码
                        name: row[1]?.trim() || '',       // 第2列：股票名称
                        marketNo: row[2]?.trim() || '',   // 第3列：市场代号
                        market: row[3]?.trim() || '',     // 第4列：市场缩写
                        pinyin: row[4]?.trim() || '',     // 第5列：拼音全拼
                        pinyinFirst: row[5]?.trim() || '' // 第6列：拼音首字母
                    };

                    stockList.push(stock);

                    // 4种搜索关键词 插入同一棵 Trie
                    this.trie.insert(stock.code, stock);
                    this.trie.insert(stock.name, stock);
                    // this.trie.insert(stock.pinyin.toLowerCase(), stock);
                    this.trie.insert(stock.pinyinFirst.toLowerCase(), stock);
                })
                .on('end', () => {
                    resolve();
                })
                .on('error', reject);
        });
    }

    setActiveProvider(providerName) {
        if (this.providers[providerName]) {
            this.activeProvider = providerName;
            return true;
        }
        return false;
    }

    // 获取股票列表
    async getStockList() {
        const cacheKey = `stock_list`;
        const cached = this.getCache(cacheKey);
        if (cached) return cached;

        const data = await this.providers.eastmoney.getStockList();
        let stockFilePath = await Utils.ensureStockListFile();
        // this.saveStockList(data, stockFilePath);
        this.setCache(cacheKey, data);
        return data;
    }

    // 保存数据到JSON文件
    async saveStockList(data, filePath) {
        try {
            const jsonData = {
                totalCount: data.length,
                updateTime: new Date().toISOString(),
                stocks: data
            };

            await fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), 'utf-8');
            return true;
        } catch (error) {
            console.error('保存文件失败:', error);
            throw error;
        }
    }

    // 读取JSON文件
    async loadStockList(filePath) {
        try {
            const data = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            console.error('读取文件失败:', error);
            return null;
        }
    }

    async getKLineData(code, market, period, startDate, endDate) {
        const cacheKey = `kline_${code}_${market}_${period}_${startDate}_${endDate}`;
        const cached = this.getCache(cacheKey);
        if (cached) return cached;

        const provider = this.getProviderForMarket(market);
        const data = await provider.getKLineData(code, market, period, startDate, endDate);

        this.setCache(cacheKey, data);
        return data;
    }

    /**
     * 获取分时数据（替代原有的实时数据接口）
     * @param {string|Array} codes - 股票代码，支持单个字符串或数组
     * @param {number} days - 获取天数，默认1天
     * @returns {Promise<object|Array>} 分时数据
     */
    async getMinuteData(codes, days = 1) {
        // 处理单个代码的情况
        const isSingle = !Array.isArray(codes);
        const codeList = isSingle ? [codes] : codes;

        // 构建缓存key
        const cacheKey = `minute_${codeList.join(',')}_${days}`;
        const cached = this.getCache(cacheKey);
        if (cached) return isSingle ? cached[0] : cached;

        // 批量获取分时数据
        const promises = codeList.map(code => {
            const { market, symbol } = this.parseCode(code);
            const provider = this.getProviderForMarket(market);
            return provider.getMinuteData(symbol, market, days);
        });

        const results = await Promise.allSettled(promises);

        // 处理结果
        const data = results.map((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                return result.value;
            }
            console.error(`获取分时数据失败: ${codeList[index]}`, result.reason);
            return null;
        });

        // 构建返回对象
        const resultData = isSingle ? data[0] : Object.fromEntries(
            codeList.map((code, i) => [code, data[i]])
        );

        this.setCache(cacheKey, resultData);
        return resultData;
    }

    /**
     * 获取5日分时数据
     * @param {string|Array} codes - 股票代码
     * @returns {Promise<object|Array>} 5日分时数据
     */
    async getFiveDayMinuteData(codes) {
        return this.getMinuteData(codes, 5);
    }

    /**
     * 批量获取多个股票的分时数据（并发控制）
     * @param {Array} stocks - 股票列表 [{code, market}, ...]
     * @param {number} days - 获取天数
     * @param {number} concurrency - 并发数，默认5
     * @returns {Promise<Array>} 分时数据列表
     */
    async batchGetMinuteData(stocks, days = 1, concurrency = 5) {
        const results = [];
        const batches = [];

        // 分批处理
        for (let i = 0; i < stocks.length; i += concurrency) {
            batches.push(stocks.slice(i, i + concurrency));
        }

        for (const batch of batches) {
            const promises = batch.map(stock => {
                const provider = this.getProviderForMarket(stock.market);
                return provider.getMinuteData(stock.code, stock.market, days);
            });

            const batchResults = await Promise.allSettled(promises);
            results.push(...batchResults.map((result, index) => {
                if (result.status === 'fulfilled' && result.value) {
                    return result.value;
                }
                console.error(`获取分时数据失败: ${batch[index].code}`, result.reason);
                return null;
            }));
        }

        return results.filter(result => result !== null);
    }

    async searchStock(keyword) {
        // 同时从多个数据源搜索，合并结果
        const promises = Object.values(this.providers).map(provider =>
            provider.searchStock(keyword).catch(() => [])
        );

        const results = await Promise.all(promises);
        const merged = results.flat();

        // 去重
        const unique = new Map();
        merged.forEach(stock => {
            const key = `${stock.market}_${stock.code}`;
            if (!unique.has(key)) {
                unique.set(key, stock);
            }
        });

        return Array.from(unique.values());
    }

    getProviderForMarket(market) {
        switch (market) {
            case 'a':
                return this.providers[this.activeProvider];
            case 'hk':
            case 'us':
                return this.providers.tencent;
            default:
                return this.providers.eastmoney;
        }
    }

    parseCode(code) {
        // 解析股票代码，支持格式：000001, hk00700, usAAPL
        let market = 'a';
        let symbol = code;

        if (code.startsWith('hk')) {
            market = 'hk';
            symbol = code.substring(2);
        } else if (code.startsWith('us')) {
            market = 'us';
            symbol = code.substring(2);
        } else if (/^\d{5}$/.test(code)) {
            market = 'hk';
        } else if (/^[A-Z]{1,5}$/.test(code)) {
            market = 'us';
        }

        return { market, symbol };
    }

    getCache(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
            return cached.data;
        }
        return null;
    }

    setCache(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    clearCache() {
        this.cache.clear();
    }

    // 可选：保留一个兼容性的实时数据接口，但标记为已废弃
    /**
     * @deprecated 请使用 getMinuteData 替代
     */
    async getRealtimeData(codes) {
        console.warn('getRealtimeData is deprecated, please use getMinuteData instead');
        return this.getMinuteData(codes, 1);
    }
}

export default new DataProviderManager();