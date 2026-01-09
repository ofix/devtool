import { ipcMain, desktopCapturer } from 'electron';
import SFTPService from './SFTPService.js';
import { httpsClient } from '../core/HTTPSClient.js';
import screenshot from 'screenshot-desktop';
import WndManager from './WndManager.js';
import Singleton from "./Singleton.js";

class IPCManager extends Singleton {
    constructor(window) {
        super();
        this.window = window;
        // 存储截图状态
        this.screenshotState = {
            mode: 'rectangle', // rectangle, window, scroll, etc.
            isActive: false
        };
    }
    startListen() {
        // 连接SFTP服务器
        ipcMain.handle("ssh:connect", async (event, config) => {
            try {
                const sftp = await SFTPService.create(config);
                await sftp.getSSHClient(config.host); // 内部会连接服务器
                return {
                    success: true,
                    host: config.host,
                    connected: true
                };
            } catch (e) {
                console.log(e);
                return {
                    success: false,
                    host: config.host,
                    connected: false
                };
            }
        });
        // 断开SFTP服务器连接
        ipcMain.handle("ssh:disconnect", async (event, host) => {
            const sftp = await SFTPService.create(config);
            await sftp.disconnectServer(host);
        });
        // 列出服务器文件列表
        ipcMain.handle("ssh:listDir", async (event, config) => {
            const sftp = await SFTPService.create(config);
            await sftp.listDir(config.host, config.remotePath);
            // sftp.fileTree.changeDirectory(config.remotePath);
            return sftp.fileTree.toJson();
        });
        // SCP下载文件夹到本地
        ipcMain.on('sftp-download-dir', async (event, config) => {
            const sftp = await SFTPService.create(config);
            let _config = sftp.getConfig(config.host);
            await sftp.downloadDir(_config.host, _config.remotePath, _config.localPath, (dirProgress) => {
                event.reply('download-dir-progress', dirProgress);
            });
        })
        ipcMain.on('sftp-upload-dir', async (event, config) => {
            const sftp = await SFTPService.create(config);
            let _config = sftp.getConfig(config.host);
            await sftp.uploadDir(_config.host, _config.localPath, _config.remotePath, (dirProgress) => {
                event.reply('upload-dir-progress', dirProgress);
            });
        })
        // 网络请求
        ipcMain.handle("https:get", async (event, options) => {
            return await httpsClient.get(options);
        });
        ipcMain.handle("https:post", async (event, options) => {
            return await httpsClient.post(options);
        });
        ipcMain.handle("https:put", async (event, options) => {
            return await httpsClient.put(options);
        });
        ipcMain.handle("https:patch", async (event, options) => {
            return await httpsClient.patch(options);
        });
        ipcMain.handle("https:delete", async (event, options) => {
            return await httpsClient.delete(options);
        });
        // 获取桌面截图
        ipcMain.handle('get-desktop-screenshot', async () => {
        });
        // 显示窗口
        ipcMain.handle("show-window", (event, name) => {
            switch (name) {
                case 'screenshot-window': {
                    break;
                }
                case 'capture-edit-window': {
                    break;
                }
                default:
                    console.log("[show window] unknown window name: ", name);
                    break;
            }
        });
        ipcMain.handle("hide-window", (event, name) => {
            switch (name) {
                case 'screenshot-window': {
                    break;
                }
                case 'capture-edit-window': {
                    break;
                }
                default:
                    console.log("[hide window] unknown window name: ", name);
                    break;
            }
        });
        // 枚举所有窗口列表（EnumWindowList）
        ipcMain.handle('enum-window-list', async () => {
            try {
                const sources = await desktopCapturer.getSources({
                    types: ['window']
                });

                return sources.map(source => ({
                    id: source.id,
                    name: source.name,
                    thumbnail: source.thumbnail.toDataURL(),
                    display_id: source.display_id
                }));
            } catch (error) {
                console.error('枚举窗口失败:', error);
                return [];
            }
        });
        // 当用户点击截图按钮时
        ipcMain.handle('start-screenshot', (event, mode) => {
            WndManager.getInstance().showCaptureEditWindow();
        });
        // 当需要开始选区时
        ipcMain.handle('start-selection', () => {
            WndManager.getInstance().enableCaptureWindowMouseEvents();
            return true;
        });
        // 完成滚动截图拼接
        ipcMain.handle('finish-screenshot', async () => {
            WndManager.getInstance().closeCaptureEditWindow();
            return true;
        });
        // 暂存滚动截图
        ipcMain.on('save-scroll-screenshot', (event, screenshotBase64) => {
        });
        // 各种工具命令
        ipcMain.handle('tool-cmd', (event, command, data) => {
            switch (command) {
                case 'record-video':   // 视频录制
                    console.log('开始录制视频:', data);
                    break;
                case 'screen-ruler':   // 屏幕标尺
                    console.log('打开屏幕标尺:', data);
                    break;
                case 'color-picker': // 拾色器
                    console.log('打开拾色器:', data);
                    break;
                default:
                    console.log('未知工具命令:', command);
            }
        });
        ipcMain.on("full-screen", (enent, flag) => {
            if (flag == 0) {
                if (this.window.isMinimized()) {
                    this.window.restore(); // 先恢复窗口
                    this.window.setFullScreen(true); // 再全屏显示
                } else if (!this.window.isVisible()) {
                    this.window.show(); // 如果窗口不可见，则显示窗口
                    this.window.setFullScreen(true); // 再全屏显示
                } else {
                    this.window.setFullScreen(true); // 直接全屏显示
                }
            } else if (flag == 1) {
                this.window.fullScreen = false;  // 还原
            }
        })
        ipcMain.on('window-minimize', () => this.window.minimize())
        ipcMain.on('window-close', () => this.window.close())
        ipcMain.on('window-maximize-toggle', () => {
            if (this.window.isMaximized()) this.window.unmaximize()
            else this.window.maximize()
        })
        // 同步状态
        this.window.on('maximize', () => this.window.webContents.send('maximized'))
        this.window.on('unmaximize', () => this.window.webContents.send('unmaximized'))
    }
}

export default IPCManager;