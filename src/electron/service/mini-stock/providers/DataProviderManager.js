import EastMoneyProvider from './EastMoneyProvider.js';
import TencentProvider from './TencentProvider.js';
import YahooProvider from './YahooProvider.js';
import BaiduFinanceProvider from './BaiduFinanceProvider.js';

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
  }

  setActiveProvider(providerName) {
    if (this.providers[providerName]) {
      this.activeProvider = providerName;
      return true;
    }
    return false;
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