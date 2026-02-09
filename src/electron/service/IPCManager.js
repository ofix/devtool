import { ipcMain, desktopCapturer, screen } from 'electron';
import SFTPService from './SFTPService.js';
import { httpsClient } from '../core/HTTPSClient.js';
import screenshot from 'screenshot-desktop';
import WndManager from './WndManager.js';
import Singleton from "./Singleton.js";
import native from "./DevtoolNative.js";
import debugLogger from './DebugLogger.js';
// 日志缓存上限

class IPCManager extends Singleton {
    constructor(window) {
        super();
        this.window = window;
        // 存储截图状态
        this.screenshotState = {
            mode: 'rectangle', // rectangle, window, scroll, etc.
            isActive: false
        };;
        this.cachedScreenshot = null; // 预加载的截图数据（base64）
        this.cacheScreenshotExpireTime = 0; // 缓存过期时间
    }
    // 预加载全屏截图（核心：提前获取，减少渲染进程等待）
    async preloadScreenshot() {
        // 缓存未过期，直接返回
        if (this.cachedScreenshot && Date.now() < this.cacheScreenshotExpireTime) {
            return this.cachedScreenshot;
        }

        try {
            // 使用 screenshot-desktop
            const imgBuffer = await screenshot({ format: 'png' });
            const base64 = `data:image/png;base64,${imgBuffer.toString('base64')}`;
            // 缓存截图，设置 2 秒过期（避免数据太旧）
            this.cachedScreenshot = base64;
            this.cacheScreenshotExpireTime = Date.now() + 2000;
            return base64;
        } catch (error) {
            console.error('预加载截图失败：', error);
            return null;
        }
    }

    startListen() {
        ipcMain.on('console-log', (event, data) => {
            debugLogger.addLog(data);
        });
        ipcMain.on('clear-debug-logs', () => {
            debugLogger.clearLogs();
            const debugWindow = WndManager.getInstance().getWindow('DebugWnd');
            if (debugWindow && debugWindow.isVisible()) {
                debugWindow.webContents.send('clear-log');
            }
        });
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
            // 优先返回缓存，同时异步更新缓存（不阻塞）
            const cached = this.cachedScreenshot;
            // 异步更新缓存（用户无感知）
            this.preloadScreenshot();
            return cached || await this.preloadScreenshot();
        });
        // 截取指定区域的屏幕内容
        ipcMain.handle('capture-area', async (_, rect) => {
            try {
                // 校验选区参数（避免无效截取）
                if (!rect || rect.width <= 0 || rect.height <= 0) {
                    throw new Error('无效的截取区域');
                }

                // 获取主屏幕的缩放比例（解决高分屏/缩放导致的截图偏移问题）
                const display = screen.getPrimaryDisplay();
                const scaleFactor = display.scaleFactor;

                // 关键：screenshot-desktop 的区域坐标需要乘以缩放比例
                const captureOptions = {
                    format: 'png',
                    // 选区坐标适配缩放（比如 150% 缩放时，坐标需要×1.5）
                    x: rect.x * scaleFactor,
                    y: rect.y * scaleFactor,
                    width: rect.width * scaleFactor,
                    height: rect.height * scaleFactor
                };

                // 截取指定区域
                const imgBuffer = await screenshot(captureOptions);
                const base64 = `data:image/png;base64,${imgBuffer.toString('base64')}`;
                return {
                    dataUrl: base64,
                    rect // 附带原始选区信息
                };
            } catch (error) {
                console.error('区域截图失败：', error);
                return null;
            }
        });
        // 显示窗口
        ipcMain.handle("show-window", (event, wndName, option = {}) => {
            return WndManager.getInstance().showWindow(wndName, option)
        });
        ipcMain.handle('get-window-bounds', (event, wndName) => {
            const manager = WndManager.getInstance();
            const wnd = manager.getWindow(wndName);
            if (wnd) {
                return wnd.getBounds();
            }
            return { x: 0, y: 0, width: 0, height: 0 };
        });
        ipcMain.handle('set-window-bounds', (event, wndName, bounds) => {
            const manager = WndManager.getInstance();
            const wnd = manager.getWindow(wndName);
            if (wnd) {
                wnd.setBounds({
                    x: bounds.x,
                    y: bounds.y,
                    width: bounds.width,
                    height: bounds.height
                });
            }
        });
        ipcMain.handle("hide-window", (event, wndName) => {
            return WndManager.getInstance().hideWindow(wndName);
        });
        ipcMain.handle("close-window", (event, wndName) => {
            return WndManager.getInstance().closeWindow(wndName);
        });
        ipcMain.handle("get-window-options", (event, wndName) => {
            const manager = WndManager.getInstance();
            const wnd = manager.getWindow(wndName);
            if (wnd) {
                return manager.getWindowOptions(wndName);
            }
            return null;
        });
        // 枚举所有窗口列表（EnumWindowList）
        ipcMain.handle('enum-window-list', async () => {
            return native.getAllWindows();
        });
        // 获取录屏数据源
        ipcMain.handle("get-record-sources", async () => {
            try {
                const sources = await desktopCapturer.getSources({
                    types: ['window'],
                    thumbnailSize: { width: 0, height: 0 },

                });
                return sources.map(source => ({
                    id: source.id,
                    name: source.name,
                    display_id: source.display_id
                }));
            } catch (error) {
                console.error('枚举窗口失败:', error);
                return [];
            }
        });
        // 当用户点击截图按钮时
        ipcMain.handle('start-screenshot', async (event, option) => {
            await this.preloadScreenshot();
            let manager = WndManager.getInstance();
            manager.hideWindow('ScreenshotToolWnd');
            manager.showWindow('CaptureWnd', option);
        });
        ipcMain.handle('cancel-screenshot', async (event) => {
            let manager = WndManager.getInstance();
            manager.closeWindow('CaptureWnd');
            manager.showWindow('ScreenshotToolWnd');
        });
        // 完成滚动截图拼接
        ipcMain.handle('finish-screenshot', async () => {
            let manager = WndManager.getInstance();
            manager.closeWindow('CaptureWnd');
            manager.showWindow('ScreenshotToolWnd');
        });
        // 暂存滚动截图
        ipcMain.on('save-scroll-screenshot', (event, screenshotBase64) => {
        });
        // 切换标尺方向（调整窗口尺寸）
        ipcMain.handle('ruler:toggle-type', () => {
            let wnd = WndManager.getInstance().getWindow('ScreenRulerWnd');
            if (!wnd) {
                return;
            }
            const bounds = wnd.getBounds();
            wnd.setBounds({
                x: bounds.x,
                y: bounds.y,
                width: bounds.height,
                height: bounds.width
            }); // 交换宽高实现横竖切换
            return { width: bounds.height, height: bounds.width }; // 返回新尺寸
        });
        // 获取标尺窗口尺寸
        ipcMain.handle('ruler:get-size', () => {
            let wnd = WndManager.getInstance().getWindow('ScreenRulerWnd');
            if (!wnd) {
                return { width: 0, height: 0 };
            }
            const [w, h] = wnd.getSize();
            return { width: w, height: h };
        });
        // 获取标尺窗口位置
        ipcMain.handle('ruler:get-position', () => {
            let wnd = WndManager.getInstance().getWindow('ScreenRulerWnd');
            if (!wnd) {
                return { x: 0, y: 0 };
            }
            const [x, y] = wnd.getPosition();
            return { x, y };
        });
        ipcMain.handle("ruler:get-bounds", (_) => {
            let wnd = WndManager.getInstance().getWindow('ScreenRulerWnd');
            if (!wnd) {
                return { x: 0, y: 0, width: 0, height: 0 };
            }
            return wnd.getBounds();
        })
        // 设置标尺窗口位置和宽高
        ipcMain.handle("ruler:set-bounds", (_, bounds) => {
            let wnd = WndManager.getInstance().getWindow('ScreenRulerWnd');
            if (!wnd) {
                return false;
            }
            wnd.setBounds(bounds);
        })
        ipcMain.handle("ruler:update-measure-line-pos", (_, option) => {
            let wnd = WndManager.getInstance().getWindow('MeasureLineWnd');
            if (wnd && !wnd.isDestroyed()) {
                if (option.direction == 'top' || option.direction == 'bottom') {
                    wnd.setBounds({ x: option.x, y: option.y, width: 10, height: 30 });
                } else {
                    wnd.setBounds({ x: option.x, y: option.y, width: 30, height: 10 });
                }
                WndManager.getInstance().showWindow("MeasureLineWnd", option);
                wnd.webContents.send('window-options', option);
            } else {
                WndManager.getInstance().showWindow("MeasureLineWnd", option);
                let wnd = WndManager.getInstance().getWindow('MeasureLineWnd');
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