import { ipcMain, desktopCapturer, screen, dialog } from 'electron';
import os from 'node:os';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import iconv from 'iconv-lite';
import SFTPService from './SFTPService.js';
import { httpsClient } from '../core/HTTPSClient.js';
import screenshot from 'screenshot-desktop';
import WndManager from './WndManager.js';
import Singleton from "./Singleton.js";
import native from "./DevtoolNative.js";
import debugLogger from './DebugLogger.js';
import { diffFileContent } from '../core/FileDiff.js';
import { DirDiff } from '../core/DirDiff.js';

// 日志缓存上限

class IPCManager extends Singleton {
    constructor() {
        super();
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

    detectFileEncoding(filePath) {
        try {
            const buffer = fs.readFileSync(filePath, { encoding: null, size: 4096 });

            // 最高优先级：检测 UTF-16 LE (带/不带 BOM)
            // UTF-16 LE BOM (FF FE)
            if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
                return 'utf16-le';
            }
            // 无 BOM 的 UTF-16 LE（通过字节特征检测）
            if (buffer.length >= 4) {
                let hasUtf16LePattern = true;
                // 偶数位是字符，奇数位是空字节（UTF-16 LE 特征）
                for (let i = 0; i < Math.min(10, buffer.length); i += 2) {
                    if (i + 1 < buffer.length && buffer[i + 1] !== 0x00) {
                        hasUtf16LePattern = false;
                        break;
                    }
                }
                if (hasUtf16LePattern) {
                    return 'utf16-le';
                }
            }

            // 测 UTF-16 BE
            if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
                return 'utf16-be';
            }

            // 检测 UTF-8 (带 BOM)
            if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
                return 'utf8';
            }

            // 兼容其他常见编码
            const encodings = ['utf8', 'gbk', 'gb2312', 'big5', 'latin1'];
            for (const enc of encodings) {
                try {
                    iconv.decode(buffer, enc);
                    return enc;
                } catch (e) {
                    continue;
                }
            }

            return 'utf8'; // 兜底
        } catch (e) {
            return 'utf8';
        }
    }

    /**
     * 纯异步逐行读取文件, 处理大文件的按行读取（真正分片，不一次性加载）
     * @param {string} filePath - 文件路径
     * @returns {Promise<string[]>} 文件行数组
     */
    async readFileLines(filePath) {
        // 前置校验：路径合法性
        if (!filePath || typeof filePath !== 'string') {
            throw new Error('无效的文件路径：必须是非空字符串');
        }

        let fileHandle = null;
        try {
            // 纯异步打开文件（替代同步的 createReadStream）
            fileHandle = await fs.open(filePath, 'r');
            // 异步获取文件信息（大小）
            const fileStat = await fileHandle.stat();
            const fileSize = fileStat.size;

            // 异步检测文件编码
            const encoding = await this.detectFileEncoding(filePath);

            // 分块异步读取文件
            const chunkSize = 64 * 1024; // 64KB 块大小（平衡性能和内存）
            let position = 0; // 当前读取位置
            let remainingBuffer = Buffer.alloc(0); // 剩余未处理的缓冲区（跨块的换行符）
            const lines = [];

            // 循环异步读取每一块
            while (position < fileSize) {
                // 计算本次读取的字节数（最后一块可能不足chunkSize）
                const bytesToRead = Math.min(chunkSize, fileSize - position);
                const chunkBuffer = Buffer.alloc(bytesToRead);

                // 纯异步读取文件块（核心异步API）
                const { bytesRead } = await fileHandle.read(
                    chunkBuffer,
                    0,
                    bytesToRead,
                    position
                );

                // 更新读取位置
                position += bytesRead;

                // 拼接剩余缓冲区 + 本次读取的块
                const combinedBuffer = Buffer.concat([remainingBuffer, chunkBuffer.slice(0, bytesRead)]);
                // 解码为字符串（按检测到的编码）
                let combinedStr = iconv.decode(combinedBuffer, encoding);

                // 分割行（处理不同换行符：\r\n、\n、\r）
                const lineBreakRegex = /\r\n|\n|\r/g;
                let lastIndex = 0;
                let match;

                // 遍历所有换行符位置
                while ((match = lineBreakRegex.exec(combinedStr)) !== null) {
                    const line = combinedStr.slice(lastIndex, match.index).trimEnd();
                    lines.push(line);
                    lastIndex = lineBreakRegex.lastIndex;
                }

                // 保存剩余未分割的部分（跨块的内容）
                remainingBuffer = iconv.encode(combinedStr.slice(lastIndex), encoding);
            }

            // 处理最后剩余的内容（文件末尾无换行符的情况）
            if (remainingBuffer.length > 0) {
                const lastLine = iconv.decode(remainingBuffer, encoding).trimEnd();
                if (lastLine) {
                    lines.push(lastLine);
                }
            }
            return lines;
        } catch (err) {
            throw new Error(`读取文件失败：${err.message}`);
        } finally {
            // 确保文件句柄异步关闭（无论成功/失败）
            if (fileHandle) {
                await fileHandle.close().catch(err => console.warn('关闭文件句柄失败：', err.message));
            }
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
            native.lockScreen();
            // 优先返回缓存，同时异步更新缓存（不阻塞）
            const cached = this.cachedScreenshot;
            // 异步更新缓存（用户无感知）
            this.preloadScreenshot();
            return cached || await this.preloadScreenshot();
        });
        // 获取平台信息
        ipcMain.handle('get-platform-info', async () => {
            return native.getPlatformInfo();
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
                })
            }
        })
        ipcMain.handle("hide-window", (event, wndName) => {
            return WndManager.getInstance().hideWindow(wndName);
        });
        ipcMain.handle("close-window", (event, wndName) => {
            return WndManager.getInstance().closeWindow(wndName);
        });
        ipcMain.handle('minimize-window', (event, wndName) => {
            return WndManager.getInstance().minimizeWindow(wndName);
        });
        ipcMain.handle('maximize-window', (event, wndName) => {
            return WndManager.getInstance().maximizeWindow(wndName);
        });
        ipcMain.handle('restore-window', (event, wndName) => {
            return WndManager.getInstance().restoreWindow(wndName);
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
        ipcMain.handle("ignoreMouseEvents", (event, wndName, enable) => {
            let wnd = WndManager.getInstance().getWindow(wndName);
            if (!wnd || wnd.isDestroyed()) {
                return false;
            }
            wnd.setIgnoreMouseEvents(enable, { forward: true });
            return true;
        });
        ipcMain.handle('get-screen-mouse-pos', (event) => {
            const { platform } = os;
            // Windows/macOS 使用Electron原生API
            if (['win32', 'darwin'].includes(platform())) {
                const { x, y } = screen.getCursorScreenPoint();
                return { x, y };
            }
            // Linux/麒麟系统 使用xdotool包
            if (platform() === 'linux') {
                const point = native.getCursorPosition();
                return point;
            }
            throw new Error(`不支持的操作系统：${platform()}`);
        });
        ipcMain.handle('lock-screen', (_) => {
            return native.lockScreen();
        });
        ipcMain.handle('unlock-screen', (_) => {
            return native.unlockScreen();
        })
        // 冻结屏幕并打开屏幕拾色器窗口
        ipcMain.handle('color-picker:open', (_) => {
            native.lockScreen();
            let wnd = WndManager.getInstance().getWindow('ColorPickerWnd');
            if (!wnd || wnd.isDestroyed()) {
                return false;
            }
            wnd.show();
        });
        ipcMain.handle('color-picker:cancel', (_) => {
            native.unlockScreen();
            let wnd = WndManager.getInstance().getWindow('ColorPickerWnd');
            if (!wnd || wnd.isDestroyed()) {
                return false;
            }
            wnd.close();
        });
        // 取消屏幕并关闭屏幕拾色器窗口
        ipcMain.handle('color-picker:close', (_) => {
            native.unlockScreen();
            let manager = WndManager.getInstance();
            let wndPicker = manager.getWindow('ColorPickerWnd');
            if (!wndPicker || wndPicker.isDestroyed()) {
                return false;
            }
            wndPicker.close();
            let wndPalette = manager.getWindow('ColorPaletteWnd');
            if (!wndPalette || wndPalette.isDestroyed()) {
                return false;
            }
            wndPalette.show();
        });
        // 文件比对
        // 监听文件选择请求
        ipcMain.handle('select-file', async (event, side) => {
            const result = await dialog.showOpenDialog({
                properties: ['openFile'],
                filters: [{ name: 'Text Files', extensions: ['vue', 'cc', 'cpp', 'c', 'txt', 'js', 'php', 'py', 'make', 'json', 'md', 'json', 'cjs', 'java', 'dart'] }],
                modal: true
            })
            if (!result.canceled && result.filePaths.length > 0) {
                return { path: result.filePaths[0], side }
            }
            return null
        })

        // 文件夹比对
        ipcMain.handle('select-folder', async (event) => {
            try {
                const result = await dialog.showOpenDialog({
                    properties: ['openDirectory', 'createDirectory'],
                    title: '选择目标文件夹',
                    modal: true
                });

                if (!result.canceled && result.filePaths.length > 0) {
                    return result.filePaths[0];
                }
                return null;
            } catch (error) {
                console.error('选择文件夹时发生错误:', error);
                return null;
            }
        })

        // 文件夹扫描
        ipcMain.handle('load-folder', async (event, dirPath) => {
            const dirDiff = new DirDiff();
            return await dirDiff.scanDirRecursive(dirPath);
        });

        // 文件夹比对
        ipcMain.handle('diff-folder', async (event, folderA, folderB, ignorePatterns = [/\.DS_Store$/, /Thumbs\.db$/]) => {
            const dirDiff = new DirDiff();
            const result = await dirDiff.compareFolders(folderA, folderB);
            return result;
        });

        // 监听文件内容读取请求
        ipcMain.handle('read-file-content', async (event, filePath) => {
            try {
                // 真正的大文件按行读取，避免一次性加载
                const lines = await this.readFileLines(filePath);
                return { success: true, lines };
            } catch (error) {
                console.error('读取文件失败：', error);
                return { success: false, error: error.message };
            }
        })

        // 监听主进程 diff 计算请求
        ipcMain.handle('diff-file-content', async (event, leftLines, rightLines) => {
            try {
                return diffFileContent(leftLines, rightLines)
            } catch (error) {
                return { success: false, error: error.message }
            }
        })
        ipcMain.handle('is-screen-locked', (_) => {
            return native.isScreenLocked();
        })
        ipcMain.on("full-screen", (enent, wndName, flag) => {
            let wnd = WndManager.getInstance().getWindow(wndName);
            if (!wnd || wnd.isDestroyed()) {
                return false;
            }
            if (flag == 0) {
                if (wnd.isMinimized()) {
                    wnd.restore(); // 先恢复窗口
                    wnd.setFullScreen(true); // 再全屏显示
                } else if (!wnd.isVisible()) {
                    wnd.show(); // 如果窗口不可见，则显示窗口
                    wnd.setFullScreen(true); // 再全屏显示
                } else {
                    wnd.setFullScreen(true); // 直接全屏显示
                }

            } else if (flag == 1) {
                wnd.restore(); // 还原
            }
        })
        ipcMain.on('window-minimize', (event, wndName) => {
            let wnd = WndManager.getInstance().getWindow(wndName);
            if (!wnd || wnd.isDestroyed()) {
                return false;
            }
            wnd.minimize();
            return true;
        })
        ipcMain.on('window-close', (event, wndName) => {
            let wnd = WndManager.getInstance().getWindow(wndName);
            if (!wnd || wnd.isDestroyed()) {
                return false;
            }
            wnd.close();
            return true;
        })
        ipcMain.on('window-maximize-toggle', () => {
            let wnd = WndManager.getInstance().getWindow(wndName);
            if (!wnd || wnd.isDestroyed()) {
                return false;
            }
            if (wnd.isMaximized()) wnd.unmaximize()
            else wnd.maximize()
        })
    }
}

export default IPCManager;