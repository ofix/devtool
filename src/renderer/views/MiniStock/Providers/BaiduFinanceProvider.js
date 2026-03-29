import axios from 'axios';

class BaiduFinanceProvider {
  constructor() {
    this.baseURL = 'https://finance.pae.baidu.com/api';
  }

  async getKLineData (code, market, period, startDate, endDate) {
    try {
      const response = await axios.get(`${this.baseURL}/getkline`, {
        params: {
          os_adapter: 'pc',
          code: code,
          market: market,
          period: period,
          start: startDate,
          end: endDate
        }
      });

      return this.parseKLineData(response.data);
    } catch (error) {
      console.error('BaiduFinanceProvider getKLineData error:', error);
      throw error;
    }
  }

  async getRealtimeData (code, market) {
    try {
      const response = await axios.get(`${this.baseURL}/getstock`, {
        params: {
          os_adapter: 'pc',
          code: code,
          market: market
        }
      });

      const data = response.data?.Result;
      if (!data) return null;

      return {
        price: data.curprice,
        open: data.open,
        high: data.maxprice,
        low: data.minprice,
        close: data.lastclose,
        volume: data.volume,
        amount: data.turnover,
        change: data.updown,
        changePercent: data.percent
      };
    } catch (error) {
      console.error('BaiduFinanceProvider getRealtimeData error:', error);
      return null;
    }
  }

  async searchStock (keyword) {
    try {
      const response = await axios.get('https://finance.pae.baidu.com/api/search', {
        params: {
          word: keyword,
          size: 20
        }
      });

      const stocks = response.data?.result?.list || [];
      return stocks.map(stock => ({
        code: stock.code,
        name: stock.name,
        market: stock.market,
        type: stock.type
      }));
    } catch (error) {
      console.error('BaiduFinanceProvider searchStock error:', error);
      return [];
    }
  }

  parseKLineData (data) {
    const klines = data?.result?.kline || [];
    return klines.map(k => ({
      date: k.date,
      open: parseFloat(k.open),
      close: parseFloat(k.close),
      high: parseFloat(k.high),
      low: parseFloat(k.low),
      volume: parseFloat(k.volume),
      amount: parseFloat(k.amount)
    }));
  }
}

export default BaiduFinanceProvider;