import { ipcMain, desktopCapturer, screen } from 'electron';
import SFTPService from './SFTPService.js';
import { httpsClient } from '../core/HTTPSClient.js';
import screenshot from 'screenshot-desktop';
// 引入 Node.js 内置模块（处理图片编码）
import { Buffer } from 'buffer';
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
        this.screenRulerWnd = null;
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
        ipcMain.handle('open-screenshot-tool', (event, mode) => {
            WndManager.getInstance().createScreenshotToolWindow();
        })
        ipcMain.handle('close-screenshot-tool', (event, mode) => {
            WndManager.getInstance().closeScreenshotToolWindow();
        })
        // 当用户点击截图按钮时
        ipcMain.handle('start-screenshot', async (event, mode) => {
            await this.preloadScreenshot();
            WndManager.getInstance().showCaptureWindow();
        });
        ipcMain.handle('cancel-screenshot', async (event) => {
            WndManager.getInstance().closeCaptureWindow();
        });
        // 当需要开始选区时
        ipcMain.handle('start-selection', () => {
            WndManager.getInstance().enableCaptureWindowMouseEvents();
            return true;
        });
        // 完成滚动截图拼接
        ipcMain.handle('finish-screenshot', async () => {
            WndManager.getInstance().closeCaptureWindow();
            return true;
        });
        // 暂存滚动截图
        ipcMain.on('save-scroll-screenshot', (event, screenshotBase64) => {
        });
        // 打开标尺
        ipcMain.handle('open-ruler', async (_, options) => {
            this.screenRulerWnd = WndManager.getInstance().createScreenRulerWindow(options);
        });
        // 关闭标尺
        ipcMain.handle('close-ruler', async () => {
            WndManager.getInstance().closeScreenRulerWindow();
            this.screenRulerWnd = null;
        });
        // 切换标尺方向（调整窗口尺寸）
        ipcMain.handle('ruler:toggle-type', () => {
            if (!this.screenRulerWnd || this.screenRulerWnd.isDestroyed()) {
                return;
            }
            const [w, h] = this.screenRulerWnd.getSize();
            this.screenRulerWnd.setSize(h, w); // 交换宽高实现横竖切换
            return { width: h, height: w }; // 返回新尺寸
        });
        // 获取标尺窗口尺寸
        ipcMain.handle('ruler:get-size', () => {
            if (!this.screenRulerWnd || this.screenRulerWnd.isDestroyed()) return { width: 0, height: 0 };
            const [w, h] = this.screenRulerWnd.getSize();
            console.log("ruler:get-size: ",w,h);
            return { width: w, height: h };
        });
        // 获取标尺窗口位置
        ipcMain.handle('ruler:get-position', () => {
            if (!this.screenRulerWnd || this.screenRulerWnd.isDestroyed()) return { x: 0, y: 0 };
            const [x, y] = this.screenRulerWnd.getPosition();
            console.log("ruler:get-position: ",x,y);
            return { x, y };
        });
        // 设置标尺窗口位置（拖拽移动）
        ipcMain.handle('ruler:set-position', (_, x, y) => {
            if (!this.screenRulerWnd || this.screenRulerWnd.isDestroyed()) return;
            this.screenRulerWnd.setPosition(x, y);
            console.log("ruler:set-position: ",x,y);
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