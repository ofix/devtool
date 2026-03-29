import axios from 'axios';

class EastMoneyProvider {
  constructor() {
    this.baseURL = 'https://push2.eastmoney.com/api/qt';
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://quote.eastmoney.com/'
    };
  }

  async getKLineData (code, market, period, startDate, endDate) {
    try {
      // 转换周期格式
      const klt = this.convertPeriod(period);
      const secid = this.getSecId(code, market);

      const response = await axios.get(`${this.baseURL}/stock/kline/get`, {
        params: {
          secid: secid,
          fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
          fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
          klt: klt,
          fqt: 1, // 复权类型：0不复权，1前复权，2后复权
          beg: startDate,
          end: endDate
        },
        headers: this.headers
      });

      return this.parseKLineData(response.data);
    } catch (error) {
      console.error('EastMoneyProvider getKLineData error:', error);
      throw error;
    }
  }

  async getRealtimeData (code, market) {
    try {
      const secid = this.getSecId(code, market);
      const response = await axios.get(`${this.baseURL}/stock/real`, {
        params: {
          secid: secid,
          fields: 'f43,f44,f45,f46,f47,f48,f49,f50,f51,f52,f57,f58,f60,f116,f117,f162,f167,f168'
        },
        headers: this.headers
      });

      const data = response.data?.data;
      if (!data) return null;

      return {
        price: data.f43,           // 最新价
        open: data.f46,            // 开盘价
        high: data.f44,            // 最高价
        low: data.f45,             // 最低价
        close: data.f43,           // 收盘价
        volume: data.f47,          // 成交量
        amount: data.f48,          // 成交额
        change: data.f169,         // 涨跌额
        changePercent: data.f170,  // 涨跌幅
        turnover: data.f168        // 换手率
      };
    } catch (error) {
      console.error('EastMoneyProvider getRealtimeData error:', error);
      return null;
    }
  }

  async searchStock (keyword) {
    try {
      const response = await axios.get('https://searchapi.eastmoney.com/api/suggest/get', {
        params: {
          input: keyword,
          type: '14',
          count: 20
        }
      });

      const stocks = response.data?.QuotationCodeTable?.Data || [];
      return stocks.map(stock => ({
        code: stock.Code,
        name: stock.Name,
        market: this.detectMarket(stock.Market),
        type: stock.Type,
        pinyin: stock.PY
      }));
    } catch (error) {
      console.error('EastMoneyProvider searchStock error:', error);
      return [];
    }
  }

  convertPeriod (period) {
    const periodMap = {
      'day': 101,
      'week': 102,
      'month': 103,
      'year': 104,
      'minute': 1,    // 1分钟
      '5minute': 5    // 5分钟
    };
    return periodMap[period] || 101;
  }

  getSecId (code, market) {
    if (market === 'a') {
      // 判断上海还是深圳
      if (code.startsWith('6')) {
        return `1.${code}`; // 上海
      } else {
        return `0.${code}`; // 深圳
      }
    }
    return code;
  }

  detectMarket (marketCode) {
    const marketMap = {
      '0': 'a',   // 深圳
      '1': 'a',   // 上海
      '2': 'hk',  // 港股
      '3': 'us'   // 美股
    };
    return marketMap[marketCode] || 'a';
  }

  parseKLineData (data) {
    const klines = data?.data?.klines || [];
    return klines.map(line => {
      const items = line.split(',');
      return {
        date: items[0],
        open: parseFloat(items[1]),
        close: parseFloat(items[2]),
        high: parseFloat(items[3]),
        low: parseFloat(items[4]),
        volume: parseFloat(items[5]),
        amount: parseFloat(items[6]),
        amplitude: parseFloat(items[7]),  // 振幅
        changePercent: parseFloat(items[8]), // 涨跌幅
        change: parseFloat(items[9]),     // 涨跌额
        turnover: parseFloat(items[10])   // 换手率
      };
    });
  }
}

export default EastMoneyProvider;