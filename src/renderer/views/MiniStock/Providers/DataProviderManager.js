import EastMoneyProvider from './EastMoneyProvider';
import TencentProvider from './TencentProvider';
import YahooProvider from './YahooProvider';
import BaiduFinanceProvider from './BaiduFinanceProvider';

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

  setActiveProvider (providerName) {
    if (this.providers[providerName]) {
      this.activeProvider = providerName;
      return true;
    }
    return false;
  }

  async getKLineData (code, market, period, startDate, endDate) {
    const cacheKey = `kline_${code}_${market}_${period}_${startDate}_${endDate}`;
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    const provider = this.getProviderForMarket(market);
    const data = await provider.getKLineData(code, market, period, startDate, endDate);

    this.setCache(cacheKey, data);
    return data;
  }

  async getRealtimeData (codes) {
    const cacheKey = `realtime_${codes.join(',')}`;
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    const promises = codes.map(code => {
      const { market, symbol } = this.parseCode(code);
      const provider = this.getProviderForMarket(market);
      return provider.getRealtimeData(symbol, market);
    });

    const results = await Promise.all(promises);
    const data = Object.fromEntries(codes.map((code, i) => [code, results[i]]));

    this.setCache(cacheKey, data);
    return data;
  }

  async searchStock (keyword) {
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

  getProviderForMarket (market) {
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

  parseCode (code) {
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

  getCache (key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
      return cached.data;
    }
    return null;
  }

  setCache (key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache () {
    this.cache.clear();
  }
}

export default new DataProviderManager();