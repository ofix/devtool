import path from "path";
import { join, dirname } from 'node:path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { constants as fsConstants } from 'fs';
import axios from 'axios';
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
        // 股票列表
        this.allShares = []; // A股全市场股票列表
        // IPO数据
        this.ipoInfo = new Map(); // A股全市场股票IPO信息(上市日期+发行价)
        // 搜索历史
        this.searchHistory = []; // 搜索历史记录,最多保持100条，格式: [{ code, name, timestamp }]
        this.favoriteFilePath = path.join(__dirname, '../../data/favorite_shares.json');
        this.stockListFilePath = path.join(__dirname, '../../data/stock_list.csv');
        this.searchHistoryFilePath = path.join(__dirname, '../../data/search_history.json');
        this.ipoInfoFilePath = path.join(__dirname, '../../data/ipo.csv');
        this.bkConcepts = new Map();
        this.bkRegions = new Map();
        this.bkIndustries = new Map();
        this.bkMenu = {};
        this.bkMenuFilePath = path.join(__dirname, '../../data/eastmoney_bkmenu.json');
        this.bkConceptFilePath = path.join(__dirname, '../../data/eastmoney_bk_concept.json');
        this.bkRegionFilePath = path.join(__dirname, '../../data/eastmoney_bk_region.json');
        this.bkIndustryFilePath = path.join(__dirname, '../../data/eastmoney_bk_industry.json');

        // 代码=>股票映射
        this.codeShareMap = new Map();

        // 搜索索引
        this.trie = new Trie(); // 股票前缀树
        this.bkTrieMap = { region: new Trie(), concept: new Trie(), industry: new Trie() }; // 板块前缀树
        this.loaded = false;
        this.inited = false;

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
    }

    getFilePaths () {
        return {
            favorite: this.favoriteFilePath,
            stockList: this.stockListFilePath,
            searchHistory: this.searchHistoryFilePath,
            ipoInfo: this.ipoInfoFilePath
        }
    }

    /**
     * 切换财经数据供应商
     */
    setProvider (provider) {
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

    async init () {
        // 添加请求拦截器
        axios.interceptors.request.use(request => {
            const url = new URL(request.url, request.baseURL);
            Object.keys(request.params || {}).forEach(key => {
                url.searchParams.append(key, request.params[key]);
            });
            console.log('[请求]:', url.toString());
            return request;
        });
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        this.diskKlineDir = path.join(__dirname, '../../../data/day');

        // 初始化存储
        this.storage = new KlineStorage(this.diskKlineDir);
        await this.storage.init();
        await this._loadStockList();
        this._loadSearchHistory();
        this._loadFavoriteShares();
        await this._loadIPOInfo();
        await this._loadBkMenu();
        await this._loadBkList();
        this.inited = true;
        // 分时缓存自动清理
        // const minuteCleanupTimer = setInterval(() => {
        //     this._cleanMinuteCache();
        // }, 30000);
        // this.timers.push(minuteCleanupTimer);
    }

    getBkMenu () {
        return this.bkMenu;
    }

    /**
     * 判断文件是否存在（核心方法）
     */
    async isFileExists (filePath) {
        try {
            await fs.promises.access(filePath, fsConstants.F_OK);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * 统一加载器：读取 JSON 文件并转成 Map
     * @param {string} filePath 文件路径
     * @returns {Promise<Map>}
     */
    async _loadBkFile (filePath) {
        try {
            //  判断文件是否存在
            const exists = await this.isFileExists(filePath);
            if (!exists) {
                console.warn(`文件不存在：${filePath}`);
                return new Map();
            }
            const content = fs.readFileSync(filePath, 'utf8');
            const bklist = JSON.parse(content);

            const map = new Map();

            for (const bk of bklist) {
                const { code, name, shares } = bk;

                // 格式化 shares："code|name" → { code, name }
                const formattedShares = shares.map(item => {
                    const [sCode, sName] = item.split('|');
                    return { code: sCode.trim(), name: sName.trim() };
                });

                // 存入 Map
                map.set(code, {
                    code,
                    name,
                    shares: formattedShares
                });
            }

            return map;

        } catch (err) {
            console.error('加载板块文件失败:', filePath, err.message);
            return new Map();
        }
    }

    /**
     * 加载所有板块（一次性加载）
     */
    async _loadBkList () {
        this.bkConcepts = await this._loadBkFile(this.bkConceptFilePath);
        this.bkRegions = await this._loadBkFile(this.bkRegionFilePath);
        this.bkIndustries = await this._loadBkFile(this.bkIndustryFilePath);

        console.log('概念数:', this.bkConcepts.size);
        console.log('地域数:', this.bkRegions.size);
        console.log('行业数:', this.bkIndustries.size);
    }

    /**
     * 加载东财板块菜单
     */
    async _loadBkMenu () {
        try {
            const exists = await this.isFileExists(this.bkMenuFilePath);
            if (!exists) {
                console.warn(`文件不存在：${path.basename(this.bkMenuFilePath)}`);
            }
            const content = fs.readFileSync(this.bkMenuFilePath, 'utf8');
            this.bkMenu = JSON.parse(content);
            // 校验解析后的数据格式，避免缺少核心字段
            const { regions = [], concepts = [], industries = [] } = this.bkMenu;


            // 提取重复逻辑，减少冗余（统一处理不同类型板块的trie插入）
            const insertBkToTrie = (bkList, trie) => {
                if (!Array.isArray(bkList) || !trie?.insert) return; // 容错：避免非数组/无insert方法报错
                bkList.forEach(bk => {
                    // 校验bk对象完整性，避免解构报错
                    if (!bk || !bk.code || !bk.name) return;
                    trie.insert(bk.code, bk);
                    trie.insert(bk.name, bk);
                    // 拼音容错：存在且非空才插入
                    if (bk.pinyin && typeof bk.pinyin === 'string') {
                        trie.insert(bk.pinyin.toLowerCase(), bk);
                    }
                });
            };

            // 批量插入不同类型板块，代码更简洁
            insertBkToTrie(regions, this.bkTrieMap.region);
            insertBkToTrie(concepts, this.bkTrieMap.concept);
            insertBkToTrie(industries, this.bkTrieMap.industry);

        } catch (err) {
            console.error('加载板块菜单失败:', this.bkMenuFilePath, err.message);
        }
    }

    /**
     * 保存 Map 到 JSON 文件
     * 自动把 shares: [{code,name}] 转回 "code|name" 格式
     */
    async _saveBkList (filePath, map) {
        try {
            if (!(map instanceof Map)) {
                throw new Error('必须传入 Map 类型');
            }

            // 转为 JSON 格式：shares 从对象转回 "code|name"
            const bkList = Array.from(map.values()).map(bk => {
                const { code, name, shares } = bk;
                const rawShares = Array.isArray(shares)
                    ? shares.map(s => `${s.code}|${s.name}`)
                    : [];

                return { code, name, shares: rawShares };
            });

            const jsonStr = JSON.stringify(bkList, null, 2);
            await fs.promises.writeFile(filePath, jsonStr, 'utf8');
            console.log(`保存成功：${path.basename(filePath)} (${bkList.length} 个板块)`);
            return true;
        } catch (err) {
            console.error('保存失败：', filePath, err.message);
            return false;
        }
    }

    async saveBkList (bkTypes) {
        if (bkTypes.indexOf('concept') != -1) {
            await this._saveBkList(this.bkConceptFilePath, this.bkConcepts);
            console.log("[√]概念板块文件保存成功");
        }
        if (bkTypes.indexOf('region') != -1) {
            await this._saveBkList(this.bkRegionFilePath, this.bkRegions);
            console.log("[√]地域板块文件保存成功");
        }
        if (bkTypes.indexOf('industry') != -1) {
            await this._saveBkList(this.bkIndustryFilePath, this.bkIndustries);
            console.log("[√]行业板块文件保存成功");
        }
    }

    // 获取全市场股票
    getAllShares () {
        return this.allShares;
    }

    // 获取IPO信息
    getIPOInfo () {
        return this.ipoInfo;
    }

    // 搜索本地股票
    async searchLocalStock (keyword) {
        if (!this.loaded) {
            await this._loadStockList();
        }

        if (!keyword) return [];
        return this.trie.search(keyword.toLowerCase());
    }

    async getBkList (type) {
        if (this.bkMenu.hasOwnProperty(type)) {
            return this.bkMenu[type];
        }
        return [];
    }

    // 搜索板块列表
    async searchBkList (keyword, type) {
        // 定义类型映射（核心：消除大量 if-else）
        const typeMap = {
            concept: ['concepts', this.bkTrieMap.concept],
            industry: ['industries', this.bkTrieMap.industry],
            region: ['region', this.bkTrieMap.region]
        };

        //  校验类型是否合法
        const [menuKey, trie] = typeMap[type] || [];
        if (!menuKey || !trie) return [];

        // 无关键词 → 返回全量列表
        if (!keyword) {
            return this.bkMenu[menuKey] || [];
        }

        // 有关键词 → 搜索
        return trie.search(keyword.toLowerCase());
    }

    async syncBkList (type) {
        let result = await this.providers.eastmoney.getBkList();
        if (type == 'concept') {
            return result.concepts;
        } else if (type == 'industry') {
            return result.industries;
        } else if (type == 'region') {
            return result.regions;
        }
        return [];
    }

    getBkShares (code, type) {
        if (type == 'concept') {
            return this.bkConcepts.get(code) || [];
        } else if (type == 'industry') {
            return this.bkIndustries.get(code) || [];
        } else if (type == 'region') {
            return this.bkRegions.get(code) || [];
        }
        return [];
    }

    async syncBkShares (bkList, type = 'concept') {
        let progress = 0;
        for (let bk of bkList) {
            try {
                let result = await this.getBk(bk);
                if (result.cache) {
                    console.log(`[缓存][${progress}/${concepts.length}][${result.shares.length}]`);
                    console.log(result.shares);
                } else {
                    console.log(`[${progress}/${concepts.length}][${result.shares.length}]`);
                    console.log(result.shares);
                }
                if (result.error) {
                    break;
                }
                if (!result.cache) {
                    // await manager.saveBkList(type);
                    await randomSleep(); // 防封间隔
                }
                progress += 1;
            } catch (e) {
                console.error(e.message);
                await randomSleep(); // 防封间隔            
            }
        }
    }

    // 加载本地股票列表
    async _loadStockList () {
        return new Promise((resolve, reject) => {
            const stream = fs.createReadStream(this.stockListFilePath);
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

    async _loadIPOInfo () {
        return new Promise((resolve, reject) => {
            // 先判断文件是否存在，不存在直接 resolve，不抛错
            fs.access(this.ipoInfoFilePath, (err) => {
                // 文件不存在 → 直接返回，不加载
                if (err) {
                    console.log('ℹ️ IPO 信息文件不存在，将从头开始抓取');
                    resolve();
                    return;
                }

                // 文件存在 → 正常读取解析
                const stream = fs.createReadStream(this.ipoInfoFilePath);
                stream
                    .pipe(csv({ headers: false }))
                    .on('data', (row) => {
                        const code = row[0];
                        const ipo = {
                            issuePrice: row[2],
                            issueDate: row[3]
                        };
                        this.ipoInfo.set(code, ipo);
                    })
                    .on('end', () => {
                        console.log('✅ IPO 信息加载完成');
                        resolve();
                    })
                    .on('error', (error) => {
                        reject(error);
                    });
            });
        });
    }

    // 加载搜索历史
    _loadSearchHistory () {
        try {
            if (fs.existsSync(this.searchHistoryFilePath)) {
                const data = fs.readFileSync(this.searchHistoryFilePath, 'utf8');
                const parsed = JSON.parse(data);
                if (Array.isArray(parsed)) {
                    this.searchHistory = parsed.filter(item => item.code && item.name);
                } else {
                    console.warn('搜索历史文件格式错误，使用空列表');
                    this.searchHistory = [];
                }
            } else {
                this.searchHistory = [];
            }
        } catch (err) {
            console.error('加载搜索历史文件失败:', err);
            this.searchHistory = [];
        }
    }

    // 添加搜索历史（自动去重，限制长度）
    addSearchShare (code, name) {
        const timestamp = Date.now();
        // 去重并限制长度
        this.searchHistory = [{ code, name, timestamp }, ...this.searchHistory.filter(item => item.code !== code)].slice(0, 100);
        try {
            fs.writeFileSync(this.searchHistoryFilePath, JSON.stringify(this.searchHistory, null, 2), 'utf8');
        } catch (err) {
            console.error('保存搜索历史文件失败:', err);
        }
    }

    /**
     * 从文件 favorites.json 中加载自选股
     * 文件格式: ["688203","322001","000001"]
     */
    _loadFavoriteShares () {
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
    _saveFavoriteShares () {
        try {
            fs.writeFileSync(this.favoriteFilePath, JSON.stringify(this.favoriteShares, null, 2), 'utf8');
        } catch (err) {
            console.error('保存自选股文件失败:', err);
        }
    }

    getFavoriteShares () {
        return this.favoriteShares;
    }

    /**
    * 添加自选股（自动去重）
    * @param {string} code - 股票代码（如 '688203' 或 '322001'）
    * @returns {boolean} 是否添加成功
    */
    addFavoriteShare (code) {
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

    async getBkList () {
        const provider = this._getProvider('a');
        return await provider.getBkList();
    }

    /**
     * 获取指数分时数据（统一接口）
     * @param {String} indexName 
     * @returns 
     */
    async getIndexMinuteData (indexName) {
        const provider = this._getProvider('a');
        return await provider.getIndexMinuteData(indexName);
    }

    /**
     * 获取板块信息（带缓存）
     * @param {Object} params - { type: 1/2/3, code: BKxxx }
     * @returns { cache: boolean, data: object }
     */
    async getBk (params) {
        const { type, code } = params;

        // 映射配置：类型 => [map实例, 名称]
        const mapConfig = {
            1: [this.bkRegions, '地域板块'],
            2: [this.bkIndustries, '行业板块'],
            3: [this.bkConcepts, '概念板块'],
        };

        // 获取对应 map
        const targetMap = mapConfig[type]?.[0];
        if (!targetMap) {
            throw new Error(`不支持的板块类型: ${type}`);
        }

        // 缓存命中
        if (targetMap.has(code)) {
            let data = targetMap.get(code);
            return {
                ...data,
                cache: true,
            };
        }
        // 缓存未命中 → 拉取远程
        const provider = this._getProvider('a');
        const data = await provider.getBk(params);

        // 存入缓存
        if (data.shares.length > 0) {
            targetMap.set(data.code, data);
        }

        return {
            ...data,
            cache: false,
        };
    }

    /**
       * 删除自选股
       * @param {string} code - 股票代码
       * @returns {boolean} 是否删除成功
       */
    delFavoriteShare (code) {
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
    delFavoriteShares (codes) {
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
    clearAllFavoriteShares () {
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
    _cleanMinuteCache () {
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
    _logStats () {
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

    async closeAll () {
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
    async getShareRankList (n, order = "top") {
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

    print (shareList) {
        console.log("+++++++++++++++++++++++++++++++++++++");
        for (let i = 0; i < shareList.length; i++) {
            const share = shareList[i];
            console.log(`代码:${share.code},名称:${share.name},涨幅:${share.changePercent},当前价:${share.price},开盘价:${share.open},最高价:${share.high},最低价:${share.low},成交额:${share.amount},成交量:${share.volume}`);
        }
        console.log("+++++++++++++++++++++++++++++++++++++");
        this.#printProvider();
    }

    #printProvider () {
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
    async getKlines (code, market, period, startDate, endDate, options = {}) {
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
    printKline (data) {
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
    _clearCodeCache (code) {
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
    async _getDayKlines (code, market, startTimestamp, endTimestamp, forceRefresh) {
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
    _isCacheSufficient (cached, startTimestamp, endTimestamp) {
        if (!cached || cached.length === 0) return false;

        const firstDate = new Date(cached[0].date).getTime();
        const lastDate = new Date(cached[cached.length - 1].date).getTime();

        return firstDate <= startTimestamp && lastDate >= endTimestamp;
    }

    /**
     * 将 KlineRecord 数组转换为普通对象数组
     */
    _recordsToKlineList (records) {
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
    _filterByTimestamp (list, startTimestamp, endTimestamp) {
        if (!list?.length) return [];
        return list.filter(item => {
            const time = item.timestamp || new Date(item.date).getTime();
            return (!startTimestamp || time >= startTimestamp) &&
                (!endTimestamp || time <= endTimestamp);
        });
    }

    // 拉取 + 写入存储
    async _fetchAndSaveDayKlines (code, market, startTimestamp, endTimestamp) {
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

    async _doFetchAndSaveDayKlines (code, market, startTimestamp, endTimestamp) {
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
    _getWeekKlines (day) {
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
    _getMonthKlines (day) {
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
    _getYearKlines (day) {
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
    async _checkAndUpdateAdjustment (code, market) {
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

    async _saveAdjustInfo (code, info) {
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
    _filterByDate (data, startDate, endDate) {
        if (!data?.length) return [];

        const start = startDate ? new Date(startDate).getTime() : 0;
        const end = endDate ? new Date(endDate).getTime() : Infinity;

        return data.filter(item => {
            const time = item.date ? new Date(item.date).getTime() : item.timestamp;
            return time >= start && time <= end;
        });
    }

    _getProvider (market) {
        // 港股和美股使用腾讯数据源
        if (market === 'hk' || market === 'us') {
            return this.providers.tencent;
        }
        return this.providers[this.activeProvider];
    }

    _parseCode (code) {
        if (code.startsWith('hk')) return { market: 'hk', symbol: code.slice(2) };
        if (code.startsWith('us')) return { market: 'us', symbol: code.slice(2) };
        if (code.startsWith('sh') || code.startsWith('sz')) {
            return { market: 'a', symbol: code };
        }
        return { market: 'a', symbol: code };
    }

    // 分时、股票列表、搜索（正确版：单只独立缓存）
    async getShareMinuteData (shares, ndays = 1) {
        const isSingle = !Array.isArray(shares);
        const list = isSingle ? [shares] : shares;

        // 用来存放最终结果
        const resultData = [];

        // 循环处理每一只股票（一只股票一个缓存）
        for (const code of list) {
            // ✅ 每只股票独立缓存 key
            const cacheKey = `${code}_${ndays}`;
            const cached = this.cache.minute.get(cacheKey);

            // 缓存有效（5秒）直接用
            if (cached && (Date.now() - cached.timestamp) < 5000) {
                this.stats.cacheHits++;
                resultData.push(cached.data);
                continue;
            }

            this.stats.cacheMisses++;

            // 真正请求接口
            try {
                const { market, symbol } = this._parseCode(code);
                const provider = this.providers.baidu;
                const data = await provider.getMinuteData(code, symbol, market, ndays);

                // ✅ 单独写入当前股票缓存
                this.cache.minute.set(cacheKey, {
                    data: data,
                    timestamp: Date.now()
                });

                resultData.push(data);
            } catch (err) {
                console.error(`获取分时数据失败 ${code}:`, err.message);
                resultData.push(null);

                // 失败也存个空缓存，避免频繁重试
                this.cache.minute.set(cacheKey, {
                    data: null,
                    timestamp: Date.now()
                });
            }
        }

        // 返回格式保持和原来一致
        if (isSingle) {
            return resultData[0];
        } else {
            return Object.fromEntries(list.map((c, i) => [c, resultData[i]]));
        }
    }

    async getStockList () {
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



    /**
     * 获取统计信息
     */
    getStats () {
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
    async warmup (codes, market) {
        const promises = codes.map(code =>
            this.getKlines(code, market, 'day', 0, Date.now(), { forceRefresh: false })
                .catch(err => console.error(`预热失败 ${code}:`, err.message))
        );
        await Promise.all(promises);
        console.log(`预热完成: ${codes.length} 只股票`);
    }
}