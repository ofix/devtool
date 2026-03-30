import { ipcMain, screen } from 'electron';
import os from 'node:os';
import native from '../service/DevtoolNative.js';

class SystemHandler {
    constructor() {
        this.registerHandlers();
    }

    registerHandlers() {
        ipcMain.handle('get-platform-info', async () => {
            return native.getPlatformInfo();
        });

        ipcMain.handle('get-screen-mouse-pos', () => {
            const { platform } = os;
            if (['win32', 'darwin'].includes(platform())) {
                const { x, y } = screen.getCursorScreenPoint();
                return { x, y };
            }
            if (platform() === 'linux') {
                return native.getCursorPosition();
            }
            throw new Error(`不支持的操作系统：${platform()}`);
        });

        ipcMain.handle('tool-cmd', (event, command, data) => {
            switch (command) {
                case 'record-video':
                    console.log('开始录制视频:', data);
                    break;
                case 'screen-ruler':
                    console.log('打开屏幕标尺:', data);
                    break;
                case 'color-picker':
                    console.log('打开拾色器:', data);
                    break;
                default:
                    console.log('未知工具命令:', command);
            }
        });

        ipcMain.handle('freeze-screen', () => {
            const startTime = performance.now();
            const result = native.freezeScreen();
            const duration = (performance.now() - startTime).toFixed(1);
            console.log("冻结屏幕: ", result, `耗时: ${duration} 毫秒`);
            return result;
        });

        ipcMain.handle('unfreeze-screen', () => {
            const startTime = performance.now();
            native.unFreezeScreen();
            const duration = (performance.now() - startTime).toFixed(1);
            console.log("解冻屏幕成功，", `耗时: ${duration} 毫秒`);
        });

        ipcMain.handle('is-screen-locked', () => {
            return native.isScreenFreezeed();
        });
    }
}

export default new SystemHandler();