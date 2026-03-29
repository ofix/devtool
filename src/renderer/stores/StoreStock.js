import { reactive, computed, toRefs } from 'vue';

class StockStore {
  constructor() {
    this.state = reactive({
      displayStocks: [],      // 显示的股票列表（最多4只）
      favorites: [],          // 自选股列表
      currentStock: null,     // 当前选中的股票
      stockDataCache: new Map() // 股票数据缓存
    });

    this.loadFromStorage();
  }

  // 添加股票到显示区域
  addStock (stock) {
    if (this.state.displayStocks.length >= 4) {
      console.warn('最多只能显示4只股票');
      return false;
    }

    if (!this.state.displayStocks.find(s => s.code === stock.code)) {
      this.state.displayStocks.push({
        code: stock.code,
        name: stock.name,
        market: stock.market,
        price: 0,
        change: 0,
        changePercent: 0
      });
      this.saveToStorage();
      return true;
    }
    return false;
  }

  // 移除显示的股票
  removeStock (code) {
    const index = this.state.displayStocks.findIndex(s => s.code === code);
    if (index !== -1) {
      this.state.displayStocks.splice(index, 1);
      this.saveToStorage();
    }
  }

  // 添加自选股
  addFavorite (stock) {
    if (!this.state.favorites.find(s => s.code === stock.code)) {
      this.state.favorites.push({
        code: stock.code,
        name: stock.name,
        market: stock.market,
        sector: stock.sector || '',
        price: 0,
        change: 0,
        changePercent: 0
      });
      this.saveToStorage();
    }
  }

  // 移除自选股
  removeFavorite (code) {
    const index = this.state.favorites.findIndex(s => s.code === code);
    if (index !== -1) {
      this.state.favorites.splice(index, 1);
      this.saveToStorage();
    }
  }

  // 检查是否自选
  isFavorite (code) {
    return this.state.favorites.some(s => s.code === code);
  }

  // 设置当前选中的股票
  setCurrentStock (code) {
    this.state.currentStock = code;
  }

  // 更新股票实时数据
  updateStockData (code, data) {
    const stock = this.state.displayStocks.find(s => s.code === code);
    if (stock) {
      Object.assign(stock, data);
    }

    const favorite = this.state.favorites.find(s => s.code === code);
    if (favorite) {
      Object.assign(favorite, data);
    }

    this.state.stockDataCache.set(code, data);
  }

  // 获取股票数据
  getStockData (code) {
    return this.state.stockDataCache.get(code);
  }

  // 保存到本地存储
  async saveToStorage () {
    const data = {
      displayStocks: this.state.displayStocks.map(s => ({
        code: s.code,
        name: s.name,
        market: s.market
      })),
      favorites: this.state.favorites.map(f => ({
        code: f.code,
        name: f.name,
        market: f.market,
        sector: f.sector
      }))
    };
    await window.electron?.setConfig('stocks', data);
  }

  // 从本地存储加载
  async loadFromStorage () {
    const data = await window.electron?.getConfig('stocks');
    if (data) {
      if (data.displayStocks) {
        this.state.displayStocks = data.displayStocks.map(s => ({
          ...s,
          price: 0,
          change: 0,
          changePercent: 0
        }));
      }
      if (data.favorites) {
        this.state.favorites = data.favorites.map(f => ({
          ...f,
          price: 0,
          change: 0,
          changePercent: 0
        }));
      }
    }
  }
}

// 单例模式
let instance = null;
export function useStockStore () {
  if (!instance) {
    instance = new StockStore();
  }
  return instance;
}