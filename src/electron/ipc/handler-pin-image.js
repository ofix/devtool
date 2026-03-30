import { ipcMain, BrowserWindow, screen } from 'electron';
import path from 'node:path';

class PinImageHandler {
    constructor() {
        this.pinWindows = new Map(); // 存储贴图窗口
        this.pinImages = new Map();  // 存储图片数据
        this.registerHandlers();
    }

    registerHandlers() {
        ipcMain.handle('pin-image:create', async (event, imageBuffer) => {
            try {
                const pinId = `pin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                this.pinImages.set(pinId, imageBuffer);

                // 创建贴图窗口
                const win = new BrowserWindow({
                    width: 300,
                    height: 300,
                    frame: false,
                    transparent: true,
                    alwaysOnTop: true,
                    resizable: true,
                    webPreferences: {
                        nodeIntegration: false,
                        contextIsolation: true
                    }
                });

                this.pinWindows.set(pinId, win);

                // 加载贴图页面
                win.loadURL(`data:image/png;base64,${imageBuffer.toString('base64')}`);

                return { success: true, pinId };
            } catch (error) {
                console.error('创建贴图失败:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('pin-image:get-all', async () => {
            const images = [];
            this.pinImages.forEach((buffer, id) => {
                images.push({
                    id,
                    dataUrl: `data:image/png;base64,${buffer.toString('base64')}`
                });
            });
            return images;
        });

        ipcMain.handle('pin-image:get-one', async (event, pinId) => {
            const buffer = this.pinImages.get(pinId);
            if (!buffer) return null;
            return {
                id: pinId,
                dataUrl: `data:image/png;base64,${buffer.toString('base64')}`
            };
        });

        ipcMain.handle('pin-image:delete-one', async (event, pinId) => {
            try {
                const win = this.pinWindows.get(pinId);
                if (win && !win.isDestroyed()) {
                    win.close();
                }
                this.pinWindows.delete(pinId);
                this.pinImages.delete(pinId);
                return { success: true };
            } catch (error) {
                console.error('删除贴图失败:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('pin-image:delete-all', async () => {
            try {
                this.pinWindows.forEach((win, id) => {
                    if (win && !win.isDestroyed()) {
                        win.close();
                    }
                });
                this.pinWindows.clear();
                this.pinImages.clear();
                return { success: true };
            } catch (error) {
                console.error('删除所有贴图失败:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('pin-image:open-wnd', async (event, pinId) => {
            const win = this.pinWindows.get(pinId);
            if (win && !win.isDestroyed()) {
                win.show();
                return { success: true };
            }
            return { success: false, error: '窗口不存在' };
        });

        ipcMain.handle('pin-image:close-wnd', async (event, pinId) => {
            const win = this.pinWindows.get(pinId);
            if (win && !win.isDestroyed()) {
                win.hide();
                return { success: true };
            }
            return { success: false, error: '窗口不存在' };
        });

        ipcMain.handle('pin-image:close-all-wnd', async () => {
            this.pinWindows.forEach((win) => {
                if (win && !win.isDestroyed()) {
                    win.hide();
                }
            });
            return { success: true };
        });

        ipcMain.handle('pin-image:set-wnd-bounds', async (event, x, y, width, height) => {
            // 这里需要根据具体的窗口来实现
            return { success: true };
        });
    }
}

export default new PinImageHandler();