import { ipcMain } from 'electron';
import StockManager from '../service/mini-stock/StockManager.js';

class AntSyncHandler {
    constructor() {
        this.manager = new StockManager();
        this.manager.init();
        this.registerHandlers();
    }

    registerHandlers() {
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

    }
}

export default new AntSyncHandler();