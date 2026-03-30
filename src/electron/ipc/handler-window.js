import { ipcMain } from 'electron';
import WndManager from '../service/WndManager.js';

class WindowHandler {
    constructor() {
        this.registerHandlers();
    }

    registerHandlers() {
        ipcMain.handle("show-window", (event, wndName, option = {}) => {
            const manager = WndManager.getInstance();
            return manager.showWindow(wndName, option);
        });

        ipcMain.handle("hide-window", (event, wndName) => {
            const manager = WndManager.getInstance();
            return manager.hideWindow(wndName);
        });

        ipcMain.handle("close-window", (event, wndName) => {
            const manager = WndManager.getInstance();
            return manager.closeWindow(wndName);
        });

        ipcMain.handle('minimize-window', (event, wndName) => {
            const manager = WndManager.getInstance();
            return manager.minimizeWindow(wndName);
        });

        ipcMain.handle('maximize-window', (event, wndName) => {
            const manager = WndManager.getInstance();
            return manager.maximizeWindow(wndName);
        });

        ipcMain.handle('restore-window', (event, wndName) => {
            const manager = WndManager.getInstance();
            return manager.restoreWindow(wndName);
        });

        ipcMain.handle('get-window-bounds', (event, wndName) => {
            const manager = WndManager.getInstance();
            const wnd = manager.getWindow(wndName);
            return wnd ? wnd.getBounds() : { x: 0, y: 0, width: 0, height: 0 };
        });

        ipcMain.handle('set-window-bounds', (event, wndName, bounds) => {
            const manager = WndManager.getInstance();
            const wnd = manager.getWindow(wndName);
            if (wnd) wnd.setBounds(bounds);
        });

        ipcMain.handle("move-window", (event, wndName, deltaX, deltaY) => {
            const manager = WndManager.getInstance();
            const wnd = manager.getWindow(wndName);
            if (wnd) {
                const bounds = wnd.getBounds();
                wnd.setBounds({
                    x: bounds.x + deltaX,
                    y: bounds.y + deltaY,
                    width: bounds.width,
                    height: bounds.height
                });
            }
        });

        ipcMain.handle("get-window-options", (event, wndName) => {
            const manager = WndManager.getInstance();
            return manager.getWindowOptions(wndName);
        });

        ipcMain.handle("ignoreMouseEvents", (event, wndName, enable) => {
            const manager = WndManager.getInstance();
            const wnd = manager.getWindow(wndName);
            if (!wnd || wnd.isDestroyed()) return false;
            wnd.setIgnoreMouseEvents(enable, { forward: true });
            return true;
        });

        ipcMain.on("full-screen", (event, wndName, flag) => {
            const manager = WndManager.getInstance();
            const wnd = manager.getWindow(wndName);
            if (!wnd || wnd.isDestroyed()) return;
            if (flag == 0) {
                if (wnd.isMinimized()) {
                    wnd.restore();
                    wnd.setFullScreen(true);
                } else if (!wnd.isVisible()) {
                    wnd.show();
                    wnd.setFullScreen(true);
                } else {
                    wnd.setFullScreen(true);
                }
            } else if (flag == 1) {
                wnd.restore();
            }
        });

        ipcMain.on('window-minimize', (event, wndName) => {
            const manager = WndManager.getInstance();
            manager.minimizeWindow(wndName);
        });

        ipcMain.on('window-close', (event, wndName) => {
            const manager = WndManager.getInstance();
            manager.closeWindow(wndName);
        });

        ipcMain.on('window-maximize-toggle', (event, wndName) => {
            const manager = WndManager.getInstance();
            const wnd = manager.getWindow(wndName);
            if (wnd && !wnd.isDestroyed()) {
                if (wnd.isMaximized()) wnd.unmaximize();
                else wnd.maximize();
            }
        });
    }
}

export default new WindowHandler();