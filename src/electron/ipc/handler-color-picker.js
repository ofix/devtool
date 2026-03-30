import { ipcMain } from 'electron';
import WndManager from '../service/WndManager.js';
class ColorPickerHandler {
    constructor() {
        this.colorPickerColor = "";
        this.registerHandlers();
    }

    registerHandlers() {
        ipcMain.handle('color-picker:open', async () => {
            const manager = WndManager.getInstance();
            manager.hideWindow('MainWnd');
            manager.showWindow('ColorPickerWnd');
        });

        ipcMain.handle('color-picker:cancel', async () => {
            const manager = WndManager.getInstance();
            manager.closeWindow('ColorPickerWnd');
            manager.showWindow('MainWnd');
        });

        ipcMain.handle('color-picker:close', async (_, color) => {
            this.colorPickerColor = color;
            const manager = WndManager.getInstance();
            manager.showWindow('ColorPaletteWnd');
            const colorPaletteWnd = manager.getWindow('ColorPaletteWnd');
            if (colorPaletteWnd && !colorPaletteWnd.isDestroyed()) {
                colorPaletteWnd.on('closed', () => {
                    manager.showWindow('MainWnd');
                });
            }
            manager.closeWindow('ColorPickerWnd');
        });

        ipcMain.handle('color-picker:get-color', async () => {
            return this.colorPickerColor;
        });
    }
}

export default new ColorPickerHandler();