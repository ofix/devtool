import EastMoneySource from './dataSources/EastMoneySource';
import BaiduFinanceSource from './dataSources/BaiduFinanceSource';

class DataSourceAdapter {
  constructor() {
    this.sources = {
      eastmoney: new EastMoneySource(),
      baidu: new BaiduFinanceSource()
    };
    this.currentSource = 'eastmoney'; // 默认使用东方财富
  }

  setSource(sourceName) {
    if (this.sources[sourceName]) {
      this.currentSource = sourceName;
    }
  }

  async getMarketTop100() {
    return await this.sources[this.currentSource].getMarketTop100();
  }

  async searchStocks(keyword) {
    return await this.sources[this.currentSource].searchStocks(keyword);
  }

  async getStockRealTime(code) {
    return await this.sources[this.currentSource].getStockRealTime(code);
  }

  async getKLineData(code, period) {
    return await this.sources[this.currentSource].getKLineData(code, period);
  }

  async getStockConcept(code) {
    return await this.sources[this.currentSource].getStockConcept(code);
  }

  async getBatchStockRealTime(codes) {
    return await this.sources[this.currentSource].getBatchStockRealTime(codes);
  }
}

export default new DataSourceAdapter();