import debugLogger from '../service/DebugLogger.js';
import { ipcMain } from 'electron';
import WndManager from '../service/WndManager.js';
class LoggerHandler {
    constructor() {
        this.registerHandlers();
    }

    registerHandlers() {
        ipcMain.on('console-log', (event, data) => {
            debugLogger.addLog(data);
        });

        ipcMain.on('clear-debug-logs', () => {
            debugLogger.clearLogs();
            const manager = WndManager.getInstance();
            // 通知调试窗口清除日志
            const debugWindow = manager.getWindow('DebugWnd');
            if (debugWindow && debugWindow.isVisible()) {
                debugWindow.webContents.send('clear-log');
            }
        });

        ipcMain.handle('debug', (event, ...data) => {
            console.log(...data);
        });
    }
}

export default new LoggerHandler();