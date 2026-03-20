import axios from 'axios';

class EastMoneySource {
  constructor() {
    this.baseURL = 'http://push2.eastmoney.com/api/qt/';
    // this.headers = {
    //   'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    // };
  }

  // 获取市场涨幅前100
  async getMarketTop100() {
    try {
      // 使用东方财富的行情接口
      const response = await axios.get('http://81.push2.eastmoney.com/api/qt/clist/get', {
        params: {
          pn: 1,
          pz: 100,
          po: 1,
          np: 1,
          ut: 'bd1d9ddb04089700cf9c27f6f7426281',
          fltt: 2,
          invt: 2,
          fid: 'f3',
          fs: 'm:0 t:6,m:0 t:80,m:1 t:2,m:1 t:23',
          fields: 'f12,f14,f2,f3,f13,f62,f184,f66,f69,f72,f75,f78,f81,f84,f87,f204,f205,f124'
        },
        // headers: this.headers
      });

      if (response.data && response.data.data) {
        return response.data.data.diff.map(item => ({
          code: item.f12,
          name: item.f14,
          price: item.f2,
          changePercent: item.f3,
          changeAmount: item.f4,
          volume: item.f5,
          turnover: item.f6,
          amplitude: item.f7,
          high: item.f15,
          low: item.f16,
          open: item.f17,
          prevClose: item.f18,
          industry: item.f127 || '未知'
        }));
      }
      return [];
    } catch (error) {
      console.error('获取市场数据失败:', error);
      return this.getMockMarketData(); // 返回模拟数据作为备选
    }
  }

  // 搜索股票
  async searchStocks(keyword) {
    try {
      const response = await axios.get('http://searchapi.eastmoney.com/api/suggest/get', {
        params: {
          input: keyword,
          type: 14,
          count: 20
        }
      });

      if (response.data && response.data.QuotationCodeTable) {
        return response.data.QuotationCodeTable.Data.map(item => ({
          code: item.Code,
          name: item.Name,
          type: item.Code.substring(0, 1) === '6' ? 'SH' : 'SZ'
        }));
      }
      return [];
    } catch (error) {
      console.error('搜索股票失败:', error);
      return this.getMockSearchResults(keyword);
    }
  }

  // 获取股票实时行情
  async getStockRealTime(code) {
    try {
      const market = code.startsWith('6') ? '1' : '0';
      const response = await axios.get('http://push2.eastmoney.com/api/qt/stock/get', {
        params: {
          secid: `${market}.${code}`,
          fields: 'f43,f44,f45,f46,f47,f48,f50,f51,f52,f57,f58,f59,f60,f116,f117,f167'
        }
      });

      if (response.data && response.data.data) {
        const data = response.data.data;
        return {
          code: data.f57,
          name: data.f58,
          price: data.f43,
          change: data.f44,
          changePercent: data.f45,
          open: data.f46,
          high: data.f47,
          low: data.f48,
          volume: data.f49,
          turnover: data.f50,
          time: data.f51
        };
      }
      return null;
    } catch (error) {
      console.error('获取股票实时行情失败:', error);
      return null;
    }
  }

  // 批量获取股票实时行情
  async getBatchStockRealTime(codes) {
    if (!codes || codes.length === 0) return [];
    
    try {
      const secids = codes.map(code => {
        const market = code.startsWith('6') ? '1' : '0';
        return `${market}.${code}`;
      }).join(',');

      const response = await axios.get('http://push2.eastmoney.com/api/qt/ulist.np/get', {
        params: {
          secids: secids,
          fields: 'f43,f44,f45,f46,f47,f48,f50,f51,f52,f57,f58,f59,f60,f116,f117,f167'
        }
      });

      if (response.data && response.data.data) {
        return response.data.data.diff.map(item => ({
          code: item.f57,
          name: item.f58,
          price: item.f43,
          change: item.f44,
          changePercent: item.f45,
          open: item.f46,
          high: item.f47,
          low: item.f48,
          volume: item.f49,
          turnover: item.f50,
          time: item.f51
        }));
      }
      return [];
    } catch (error) {
      console.error('批量获取股票行情失败:', error);
      return [];
    }
  }

  // 获取K线数据
  async getKLineData(code, period) {
    const periodMap = {
      '1m': '1',
      '5m': '5',
      '15m': '15',
      '30m': '30',
      '60m': '60',
      'day': '101',
      'week': '102',
      'month': '103',
      'year': '104'
    };

    try {
      const market = code.startsWith('6') ? '1' : '0';
      const response = await axios.get('http://push2his.eastmoney.com/api/qt/stock/kline/get', {
        params: {
          secid: `${market}.${code}`,
          klt: periodMap[period] || '101',
          fqt: 1,
          lmt: period === 'day' ? 100 : (period === 'week' ? 52 : (period === 'month' ? 36 : 10)),
          fields1: 'f1,f2,f3,f4,f5,f6',
          fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61'
        }
      });

      if (response.data && response.data.data) {
        const klines = response.data.data.klines.map(item => {
          const parts = item.split(',');
          return {
            time: parts[0],
            open: parseFloat(parts[1]),
            close: parseFloat(parts[2]),
            high: parseFloat(parts[3]),
            low: parseFloat(parts[4]),
            volume: parseFloat(parts[5]),
            turnover: parseFloat(parts[6]),
            change: parseFloat(parts[7]),
            changePercent: parseFloat(parts[8])
          };
        });
        return klines;
      }
      return this.getMockKLineData(period);
    } catch (error) {
      console.error('获取K线数据失败:', error);
      return this.getMockKLineData(period);
    }
  }

  // 获取股票概念
  async getStockConcept(code) {
    try {
      const market = code.startsWith('6') ? '1' : '0';
      const response = await axios.get('http://push2.eastmoney.com/api/qt/stock/feature', {
        params: {
          secid: `${market}.${code}`,
          fields: 'f21,f22,f23,f24,f25,f26,f27,f28,f29,f30'
        }
      });

      if (response.data && response.data.data) {
        const concepts = [];
        for (let i = 1; i <= 5; i++) {
          const name = response.data.data[`f2${i}`];
          const desc = response.data.data[`f3${i}`];
          if (name) {
            concepts.push({ name, desc });
          }
        }
        return concepts;
      }
      return [];
    } catch (error) {
      console.error('获取股票概念失败:', error);
      return [
        { name: '新能源', desc: '新能源产业链' },
        { name: '半导体', desc: '芯片设计制造' }
      ];
    }
  }

  // 模拟数据（作为备选）
  getMockMarketData() {
    const stocks = [];
    for (let i = 1; i <= 100; i++) {
      stocks.push({
        code: `${600000 + i}`,
        name: `股票${i}`,
        price: 10 + Math.random() * 100,
        changePercent: (Math.random() * 10 - 5).toFixed(2),
        changeAmount: (Math.random() * 5 - 2.5).toFixed(2),
        volume: Math.floor(Math.random() * 10000000),
        turnover: Math.floor(Math.random() * 100000000),
        amplitude: (Math.random() * 8).toFixed(2),
        high: 0,
        low: 0,
        open: 0,
        prevClose: 0,
        industry: ['科技', '金融', '医药', '消费', '能源'][Math.floor(Math.random() * 5)]
      });
    }
    return stocks.sort((a, b) => parseFloat(b.changePercent) - parseFloat(a.changePercent));
  }

  getMockSearchResults(keyword) {
    return [
      { code: '600519', name: '贵州茅台', type: 'SH' },
      { code: '000858', name: '五粮液', type: 'SZ' },
      { code: '601318', name: '中国平安', type: 'SH' },
      { code: '600036', name: '招商银行', type: 'SH' },
      { code: '000333', name: '美的集团', type: 'SZ' }
    ].filter(item => 
      item.code.includes(keyword) || 
      item.name.includes(keyword) ||
      this.pinyinMatch(item.name, keyword)
    );
  }

  getMockKLineData(period) {
    const data = [];
    const count = period === 'day' ? 100 : (period === 'week' ? 52 : (period === 'month' ? 36 : 10));
    let basePrice = 100;
    let date = new Date();

    for (let i = 0; i < count; i++) {
      const open = basePrice + (Math.random() - 0.5) * 10;
      const close = open + (Math.random() - 0.5) * 5;
      const high = Math.max(open, close) + Math.random() * 3;
      const low = Math.min(open, close) - Math.random() * 3;

      data.push({
        time: this.formatDate(date, period),
        open: parseFloat(open.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        volume: Math.floor(Math.random() * 10000000),
        turnover: Math.floor(Math.random() * 1000000000)
      });

      basePrice = close;
      if (period === 'day') {
        date.setDate(date.getDate() - 1);
      } else if (period === 'week') {
        date.setDate(date.getDate() - 7);
      } else if (period === 'month') {
        date.setMonth(date.getMonth() - 1);
      } else {
        date.setFullYear(date.getFullYear() - 1);
      }
    }

    return data.reverse();
  }

  pinyinMatch(name, keyword) {
    // 简单的拼音首字母匹配
    const pinyin = name.split('').map(c => {
      if (/[\u4e00-\u9fa5]/.test(c)) {
        return c.charAt(0);
      }
      return c;
    }).join('');
    return pinyin.includes(keyword.toLowerCase());
  }

  formatDate(date, period) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    if (period === 'day') {
      return `${year}-${month}-${day}`;
    } else if (period === 'week') {
      return `${year}-W${Math.ceil(date.getDate() / 7)}`;
    } else if (period === 'month') {
      return `${year}-${month}`;
    } else {
      return `${year}`;
    }
  }
}

export default EastMoneySource;