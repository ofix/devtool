import { ipcMain } from 'electron';
import { httpsClient } from '../core/HTTPSClient.js';

class HTTPHandler {
    constructor() {
        this.registerHandlers();
    }

    registerHandlers() {
        ipcMain.handle("https:get", async (event, options) => {
            try {
                return await httpsClient.get(options);
            } catch (error) {
                console.error('HTTP GET请求失败:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle("https:post", async (event, options) => {
            try {
                return await httpsClient.post(options);
            } catch (error) {
                console.error('HTTP POST请求失败:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle("https:put", async (event, options) => {
            try {
                return await httpsClient.put(options);
            } catch (error) {
                console.error('HTTP PUT请求失败:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle("https:patch", async (event, options) => {
            try {
                return await httpsClient.patch(options);
            } catch (error) {
                console.error('HTTP PATCH请求失败:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle("https:delete", async (event, options) => {
            try {
                return await httpsClient.delete(options);
            } catch (error) {
                console.error('HTTP DELETE请求失败:', error);
                return { success: false, error: error.message };
            }
        });
    }
}

export default new HTTPHandler();