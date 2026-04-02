import axios from 'axios';

class TencentProvider {
  constructor() {
    this.baseURL = 'https://web.ifzq.gtimg.cn';
  }

  async getKLineData (code, market, period, startDate, endDate) {
    try {
      const symbol = this.getSymbol(code, market);
      const response = await axios.get(`${this.baseURL}/appstock/app/fqkline/get`, {
        params: {
          param: `${symbol},${period},${startDate},${endDate},640`,
          r: Math.random()
        }
      });

      return this.parseKLineData(response.data, period);
    } catch (error) {
      console.error('TencentProvider getKLineData error:', error);
      throw error;
    }
  }

  async getMinuteData (code, market) {
    try {
      const symbol = this.getSymbol(code, market);
      const response = await axios.get(`${this.baseURL}/qt/quote=${symbol}`);

      // 腾讯返回格式：v_sz000001="1~平安银行~000001~11.23~...";
      const data = response.data;
      const match = data.match(/="(.+)"/);
      if (!match) return null;

      const items = match[1].split('~');
      return {
        price: parseFloat(items[3]),
        change: parseFloat(items[4]),
        changePercent: parseFloat(items[5]),
        volume: parseFloat(items[6]),
        amount: parseFloat(items[7]),
        open: parseFloat(items[9]),
        high: parseFloat(items[10]),
        low: parseFloat(items[11]),
        close: parseFloat(items[3])
      };
    } catch (error) {
      console.error('TencentProvider getRealtimeData error:', error);
      return null;
    }
  }

  async searchStock (keyword) {
    try {
      const response = await axios.get('https://search.10jqka.com.cn/stock/search', {
        params: {
          w: keyword,
          t: 'all'
        }
      });

      // 解析搜索结果
      const stocks = [];
      const regex = /<a[^>]*>\((\d{6})\)([^<]+)<\/a>/g;
      let match;
      while ((match = regex.exec(response.data)) !== null) {
        stocks.push({
          code: match[1],
          name: match[2].trim(),
          market: this.detectMarket(match[1])
        });
      }

      return stocks;
    } catch (error) {
      console.error('TencentProvider searchStock error:', error);
      return [];
    }
  }

  getSymbol (code, market) {
    switch (market) {
      case 'a':
        return code.startsWith('6') ? `sh${code}` : `sz${code}`;
      case 'hk':
        return `hk${code}`;
      case 'us':
        return `us${code}`;
      default:
        return code;
    }
  }

  detectMarket (code) {
    if (code.startsWith('6')) return 'a';
    if (code.startsWith('0') || code.startsWith('3')) return 'a';
    if (/^\d{5}$/.test(code)) return 'hk';
    return 'us';
  }

  parseKLineData (data, period) {
    const klineData = data?.data?.[period === 'day' ? 'qfqday' : period] || [];
    return klineData.map(item => ({
      date: item[0],
      open: parseFloat(item[1]),
      close: parseFloat(item[2]),
      high: parseFloat(item[3]),
      low: parseFloat(item[4]),
      volume: parseFloat(item[5]),
      amount: parseFloat(item[6])
    }));
  }
}

export default TencentProvider;