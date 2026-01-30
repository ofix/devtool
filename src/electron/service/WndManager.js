import { BrowserWindow, screen, globalShortcut, ipcMain } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Singleton from './Singleton.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class WndManager extends Singleton {
    constructor() {
        super();
        this.captureMode = 'rect';
        this.wndMap = new Map();
        this.wndInitialOptions = new Map(); // 窗口初始化选项，用于后续获取

        this.windowPresets = {
            'ScreenshotToolWnd': this.getScreenshotToolWndConfig(),
            'CaptureWnd': this.getCaptureWndConfig(),
            'MeasureLineWnd': this.getMeasureLineWndConfig(),
            'ScreenRulerWnd': this.getScreenRulerWndConfig()
        };
    }

    // 基础窗口配置
    get transparentWndOptions() {
        return {
            frame: false,
            transparent: true,
            alwaysOnTop: true,
            resizable: false,
            movable: true,
            focusable: true,
            autoHideMenuBar: true,
            useContentSize: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                devTools: false,
                preload: join(__dirname, '../preload.cjs'),
                // 启用IPC通信，用于向窗口传递参数
                contextIsolation: true
            }
        };
    }

    // 窗口配置预设
    getScreenshotToolWndConfig() {
        const icons = 13;
        const iconSize = 32;
        const iconGap = 12;
        const toolbarWidth = icons * iconSize + (icons - 1) * iconGap;
        const toolbarHeight = iconSize + 16;
        const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

        return {
            x: screenWidth - toolbarWidth - 42,
            y: screenHeight - toolbarHeight - 42,
            width: toolbarWidth,
            height: toolbarHeight,
            url: '/screenshot',
            levelName: 'popup-menu',
            levelZOrder: 2
        };
    }

    getCaptureWndConfig() {
        const { width, height } = screen.getPrimaryDisplay().size;
        return {
            x: 0, y: 0, width, height,
            url: '/screenshot/capture',
            levelName: 'screen-saver',
            levelZOrder: 100
        };
    }

    getMeasureLineWndConfig(options = {}) {
        const { type = 'horizontal', position = 'above' } = options;
        const width = type === 'horizontal' ? 10 : 30;
        const height = type === 'horizontal' ? 30 : 10;

        return {
            x: -100, y: -100, width, height,
            focusable: true,
            url: '/measure-line',
            levelName: 'screen-saver',
            levelZOrder: 0,
            ignoreMouseEvents: true,
        };
    }

    getScreenRulerWndConfig(options = {}) {
        const { type = 'horizontal' } = options;
        const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

        const rulerWidth = type === 'horizontal' ? 800 : 100;
        const rulerHeight = type === 'horizontal' ? 100 : 800;

        return {
            x: (screenWidth - rulerWidth) / 2,
            y: (screenHeight - rulerHeight) / 2,
            width: rulerWidth,
            height: rulerHeight,
            url: '/screen-ruler',
            levelName: 'pop-up-menu',
            levelZOrder: 0
        };
    }

    /**
     * 统一窗口创建方法（增强版，支持参数传递）
     * @param {string} name 窗口名称
     * @param {Object} options 自定义选项
     * @param {Function} customConfig 自定义配置生成函数
     */
    createWindow(name, options = {}, customConfig = null) {
        // 获取配置
        let config;
        if (customConfig) {
            config = customConfig(options);
        } else if (this.windowPresets[name]) {
            config = this.windowPresets[name];
        } else {
            throw new Error(`未找到窗口 "${name}" 的配置`);
        }

        const wnd = this.createTransparentWnd({
            name,
            ...config,
        });

        // 窗口创建完成后发送选项参数
        wnd.webContents.on('did-finish-load', () => {
            this.sendWindowOptions(name, options);
        });

        return wnd;
    }

    /**
     * 创建透明窗口
     */
    createTransparentWnd({
        name,
        x,
        y,
        width,
        height,
        url,
        levelName = "normal",
        levelZOrder = 0,
        ignoreMouseEvents = false,
    }) {
        // 避免重复创建
        if (this.wndMap.has(name)) {
            const existingWnd = this.wndMap.get(name);
            if (!existingWnd.isDestroyed()) {
                existingWnd.show();
                return existingWnd;
            }
        }

        const wndOptions = {
            ...this.transparentWndOptions,
            x, y, width, height
        };

        const wnd = new BrowserWindow(wndOptions);
        this.wndMap.set(name, wnd);

        this.loadUrl(wnd, url);

        if (ignoreMouseEvents) {
            wnd.setIgnoreMouseEvents(true, { forward: true });
        }

        wnd.on('closed', () => {
            this.wndMap.delete(name);
        });

        wnd.webContents.on('did-finish-load', () => {
            wnd.setAlwaysOnTop(true, levelName, levelZOrder);
            wnd.moveTop();
        });

        return wnd;
    }

    /**
     * 向窗口发送选项参数（通过IPC）
     */
    sendWindowOptions(name, options) {
        const wnd = this.wndMap.get(name);
        if (wnd && !wnd.isDestroyed()) {
            wnd.webContents.send('window-options', {
                windowName: name,
                options: options
            });
        }
    }

    // 统一的URL加载逻辑
    loadUrl(wnd, url) {
        const listenServerUrl = process.argv[2];
        const targetUrl = process.env.NODE_ENV === 'development'
            ? `${listenServerUrl}/#${url}`
            : `file://${join(__dirname, `../dist/index.html/#${url}`)}`;

        wnd.loadURL(targetUrl);
    }

    /**
     * 创建测量线窗口（支持位置参数）
     * @param {Object} options 
     * @param {string} options.type 类型：horizontal/vertical
     * @param {string} options.position 位置：top/bottom/left/right（相对于标尺）
     * @param {number} options.x x坐标
     * @param {number} options.y y坐标
     */
    createMeasureLineWindow(options = {}) {
        return this.createWindow('MeasureLineWnd', options);
    }

    // 创建屏幕标尺窗口
    createScreenRulerWindow(options = {}) {
        const wnd = this.createWindow('ScreenRulerWnd', options);
        this.registerEscapeShortcut('ScreenRulerWnd');
        wnd.on('closed', () => {
            globalShortcut.unregister('Escape');
        });
        return wnd;
    }

    // 创建浮动截屏工具条窗口
    createScreenshotToolWindow() {
        return this.createWindow('ScreenshotToolWnd');
    }

    // 创建截屏窗口
    createCaptureWindow(options) {
        return this.createWindow('CaptureWnd', options);
    }

    showCaptureWindow(options) {
        this.hideWindow('ScreenshotToolWnd');
        this.showWindow('CaptureWnd', options);
    }

    // ESC快捷键注册逻辑
    registerEscapeShortcut(wndKey) {
        globalShortcut.register('Escape', () => {
            this.closeWindow(wndKey);
            globalShortcut.unregister('Escape');
        });
    }

    // 通用窗口操作方法
    showWindow(wndName, options = {}) {
        const wnd = this.wndMap.get(wndName);
        if (wnd && !wnd.isDestroyed()) {
            if (wnd.isFocusable()) {
                wnd.focus();
            }
            wnd.show();
            // 显示时重新发送选项参数
            this.sendWindowOptions(wndKey, options);
            return true;
        } else {
            this.createWindow(wndName,)
        }
        return false;
    }

    // 其他方法保持不变...
    hideWindow(wndKey) {
        const wnd = this.wndMap.get(wndKey);
        if (wnd && !wnd.isDestroyed()) {
            wnd.hide();
            return true;
        }
        return false;
    }

    closeWindow(wndKey) {
        const wnd = this.wndMap.get(wndKey);
        if (wnd && !wnd.isDestroyed()) {
            wnd.close();
            this.wndMap.delete(wndKey);
            this.windowOptionsCache.delete(wndKey);
            return true;
        }
        return false;
    }

    getWindow(wndKey) {
        return this.wndMap.get(wndKey) || null;
    }

    cleanup() {
        for (const [wndKey, wnd] of this.wndMap) {
            if (wnd && !wnd.isDestroyed()) {
                wnd.close();
            }
        }
        this.wndMap.clear();
        this.windowOptionsCache.clear();
    }
}

export default WndManager;