import { ipcMain } from 'electron';
import WndManager from '../service/WndManager.js';

class RulerHandler {
    constructor() {
        this.registerHandlers();
    }

    registerHandlers() {
        ipcMain.handle('ruler:toggle-type', () => {
            const manager = WndManager.getInstance();
            const wnd = manager.getWindow('ScreenRulerWnd');
            if (!wnd) return null;
            const bounds = wnd.getBounds();
            wnd.setBounds({
                x: bounds.x,
                y: bounds.y,
                width: bounds.height,
                height: bounds.width
            });
            return { width: bounds.height, height: bounds.width };
        });

        ipcMain.handle('ruler:get-size', () => {
            const manager = WndManager.getInstance();
            const wnd = manager.getWindow('ScreenRulerWnd');
            if (!wnd) return { width: 0, height: 0 };
            const [w, h] = wnd.getSize();
            return { width: w, height: h };
        });

        ipcMain.handle('ruler:get-position', () => {
            const manager = WndManager.getInstance();
            const wnd = manager.getWindow('ScreenRulerWnd');
            if (!wnd) return { x: 0, y: 0 };
            const [x, y] = wnd.getPosition();
            return { x, y };
        });

        ipcMain.handle("ruler:get-bounds", () => {
            const manager = WndManager.getInstance();
            const wnd = manager.getWindow('ScreenRulerWnd');
            if (!wnd) return { x: 0, y: 0, width: 0, height: 0 };
            return wnd.getBounds();
        });

        ipcMain.handle("ruler:set-bounds", (_, bounds) => {
            const manager = WndManager.getInstance();
            const wnd = manager.getWindow('ScreenRulerWnd');
            if (!wnd) return false;
            wnd.setBounds(bounds);
            return true;
        });

        ipcMain.handle("ruler:update-measure-line-pos", (_, option) => {
            const manager = WndManager.getInstance();
            let wnd = manager.getWindow('MeasureLineWnd');
            if (wnd && !wnd.isDestroyed()) {
                if (option.direction == 'top' || option.direction == 'bottom') {
                    wnd.setBounds({ x: option.x, y: option.y, width: 10, height: 30 });
                } else {
                    wnd.setBounds({ x: option.x, y: option.y, width: 30, height: 10 });
                }
                manager.showWindow("MeasureLineWnd", option);
                wnd.webContents.send('window-options', option);
            } else {
                manager.showWindow("MeasureLineWnd", option);
                wnd = manager.getWindow('MeasureLineWnd');
                if (option.direction == 'top' || option.direction == 'bottom') {
                    wnd.setBounds({ x: option.x, y: option.y, width: 10, height: 30 });
                } else {
                    wnd.setBounds({ x: option.x, y: option.y, width: 30, height: 10 });
                }
                wnd.webContents.on('dom-ready', () => {
                    wnd.webContents.send('window-options', option);
                });
            }
        });
    }
}

export default new RulerHandler();