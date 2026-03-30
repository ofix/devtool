import { ipcMain } from 'electron';
import DataProviderManager from '../service/mini-stock/providers/DataProviderManager.js';

class StockHandler {
    constructor() {
        this.dataManager = DataProviderManager;
        this.registerHandlers();
    }

    registerHandlers() {
        ipcMain.handle('mini-stock:get-day-kline', async (event, code, market, period, startDate, endDate) => {
            try {
                const data = await this.dataManager.getKLineData(code, market, period, startDate, endDate);
                return { success: true, data };
            } catch (error) {
                console.error('获取日K线失败:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('mini-stock:get-minute-kline', async (event, codes, days = 1) => {
            try {
                const data = await this.dataManager.getMinuteData(codes, days);
                return { success: true, data };
            } catch (error) {
                console.error('获取分时K线失败:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('mini-stock:set-provider', async (event, name) => {
            try {
                const success = this.dataManager.setActiveProvider(name);
                return { success };
            } catch (error) {
                console.error('设置数据提供商失败:', error);
                return { success: false, error: error.message };
            }
        });
    }
}

export default new StockHandler();