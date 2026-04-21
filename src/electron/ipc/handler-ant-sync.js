import { ipcMain } from 'electron';
import StockManager from '../service/mini-stock/StockManager.js';

class AntSyncHandler {
    constructor() {
        this.manager = new StockManager();
        this.manager.init();
        this.registerHandlers();
    }

    registerHandlers() {
        ipcMain.handle('ant-sync:get-bk-overview', async (_) => {
            if (!this.manager.inited) {
                await this.manager.init();
            }
            return this.manager.getBkOverview();
        });
        ipcMain.handle('ant-sync:get-bk-list', async (_, type, keyword) => {
            if (!this.manager.inited) {
                await this.manager.init();
            }
            return this.manager.searchBkList(keyword, type);
        });
        ipcMain.handle('ant-sync:sync-bk-list', async (_, type) => {
            if (!this.manager.inited) {
                await this.manager.init();
            }
            return [];
            // return await this.manager.syncBkList(type);
        });
        ipcMain.handle('ant-sync:get-bk-shares', async (_, type, bkCode) => {
            if (!this.manager.inited) {
                await this.manager.init();
            }
            return this.manager.getBkShares(bkCode, type);
        });
        ipcMain.handle('ant-sync:sync-bk-shares', async (_, type, bkList) => {
            if (!this.manager.inited) {
                await this.manager.init();
            }
            return [];
            // return await this.manager.syncBkShares(bkList, type);
        });
        ipcMain.handle('ant-sync:save-provider-settings', async (_, data) => {
            if (!this.manager.inited) {
                await this.manager.init();
            }
            this.manager.saveProviderSettings(data);
        });
        ipcMain.handle('ant-sync:load-provider-settings', async (_) => {
            if (!this.manager.inited) {
                await this.manager.init();
            }
            return this.manager.getProviderSettings();
        });
    }
}

export default new AntSyncHandler();