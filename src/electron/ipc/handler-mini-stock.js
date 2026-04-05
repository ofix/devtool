import { ipcMain } from 'electron';
import StockManager from '../service/mini-stock/providers/StockManager.js';

class StockHandler {
    constructor() {
        this.manager = new StockManager();
        this.registerHandlers();
    }

    registerHandlers () {
        ipcMain.handle('mini-stock:kline', async (event, codes, market, period, startDate, endDate) => {
            try {
                const data = await this.manager.getKlines(codes, market, period, startDate, endDate);
                return data;
            } catch (error) {
                console.error('获取日K线失败:', error);
                return [];
            }
        });

        ipcMain.handle('mini-stock:minute-kline', async (event, codes, days = 1) => {
            try {
                const data = await this.manager.getMinuteData(codes, days);
                return data;
            } catch (error) {
                console.error('获取分时K线失败:', error);
                return [];
            }
        });

        ipcMain.handle('mini-stock:set-provider', async (event, name) => {
            try {
                const result = this.manager.setActiveProvider(name);
                return result;
            } catch (error) {
                console.error('设置数据提供商失败:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('mini-stock:search-shares', async (event, keyword) => {
            const shares = this.manager.searchLocalShares(keyword);
            return shares;
        });

        ipcMain.handle('mini-stock:share-rank-list', async (event, n, order) => {
            const shares = await this.manager.getShareRankList(n, order);
            return shares;
        });

        ipcMain.handle('mini-stock:favorite-shares', async (event,) => {
            const shares = await this.manager.getFavoriteShares();
            return shares;
        });

        ipcMain.handle('mini-stock:add-favorite-share', async (event, code) => {
            const result = await this.manager.addFavoriteShare(code);
            return result;
        });

        ipcMain.handle('mini-stock:del-favorite-share', async (event, code) => {
            const result = await this.manager.delFavoriteShare(code);
            return result;
        });

        ipcMain.handle('mini-stock:add-search-share', async (event, code) => {
            const result = await this.manager.addSearchShare(code);
            return result;
        });
    }
}

export default new StockHandler();