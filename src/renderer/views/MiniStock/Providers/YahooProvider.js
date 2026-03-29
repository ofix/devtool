import axios from 'axios';

class YahooProvider {
  constructor() {
    this.baseURL = 'https://query1.finance.yahoo.com/v8/finance/chart';
  }

  async getKLineData (code, market, period, startDate, endDate) {
    try {
      const symbol = this.getSymbol(code, market);
      const interval = this.convertPeriod(period);
      const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
      const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);

      const response = await axios.get(`${this.baseURL}/${symbol}`, {
        params: {
          interval: interval,
          range: this.getRange(period),
          includePrePost: false,
          events: 'div,splits',
          period1: startTimestamp,
          period2: endTimestamp
        }
      });

      return this.parseKLineData(response.data);
    } catch (error) {
      console.error('YahooProvider getKLineData error:', error);
      throw error;
    }
  }

  async getRealtimeData (code, market) {
    try {
      const symbol = this.getSymbol(code, market);
      const response = await axios.get(`${this.baseURL}/${symbol}`, {
        params: {
          interval: '1m',
          range: '1d'
        }
      });

      const result = response.data?.chart?.result?.[0];
      if (!result) return null;

      const meta = result.meta;
      const quote = result.indicators?.quote?.[0];

      return {
        price: meta.regularMarketPrice,
        open: meta.chartPreviousClose,
        high: quote.high?.[quote.high.length - 1] || meta.regularMarketPrice,
        low: quote.low?.[quote.low.length - 1] || meta.regularMarketPrice,
        volume: quote.volume?.[quote.volume.length - 1] || 0,
        change: meta.regularMarketPrice - meta.chartPreviousClose,
        changePercent: ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100
      };
    } catch (error) {
      console.error('YahooProvider getRealtimeData error:', error);
      return null;
    }
  }

  async searchStock (keyword) {
    try {
      const response = await axios.get('https://query1.finance.yahoo.com/v1/finance/search', {
        params: {
          q: keyword,
          quotesCount: 20,
          newsCount: 0
        }
      });

      const quotes = response.data?.quotes || [];
      return quotes.map(quote => ({
        code: quote.symbol,
        name: quote.longname || quote.shortname || quote.symbol,
        market: this.detectMarket(quote.symbol),
        exchange: quote.exchange
      }));
    } catch (error) {
      console.error('YahooProvider searchStock error:', error);
      return [];
    }
  }

  getSymbol (code, market) {
    switch (market) {
      case 'a':
        return `${code}.SS`; // 上海 .SS，深圳 .SZ
      case 'hk':
        return `${code}.HK`;
      case 'us':
        return code;
      default:
        return code;
    }
  }

  convertPeriod (period) {
    const periodMap = {
      'day': '1d',
      'week': '1wk',
      'month': '1mo',
      'year': '1y',
      'minute': '1m',
      '5minute': '5m'
    };
    return periodMap[period] || '1d';
  }

  getRange (period) {
    const rangeMap = {
      'day': '1mo',
      'week': '3mo',
      'month': '1y',
      'year': '5y',
      'minute': '1d',
      '5minute': '5d'
    };
    return rangeMap[period] || '1mo';
  }

  detectMarket (symbol) {
    if (symbol.endsWith('.SS') || symbol.endsWith('.SZ')) return 'a';
    if (symbol.endsWith('.HK')) return 'hk';
    return 'us';
  }

  parseKLineData (data) {
    const result = data?.chart?.result?.[0];
    if (!result) return [];

    const timestamps = result.timestamp;
    const quote = result.indicators?.quote?.[0];
    const adjclose = result.indicators?.adjclose?.[0];

    return timestamps.map((timestamp, i) => ({
      date: new Date(timestamp * 1000).toISOString().split('T')[0],
      open: quote.open?.[i] || 0,
      high: quote.high?.[i] || 0,
      low: quote.low?.[i] || 0,
      close: adjclose?.adjclose?.[i] || quote.close?.[i] || 0,
      volume: quote.volume?.[i] || 0
    }));
  }
}

export default YahooProvider;