import { BrowserWindow, screen, globalShortcut, ipcMain } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Singleton from './Singleton.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class WndManager extends Singleton {
    constructor() {
        super();
        this.wndMap = new Map();
        this.windowOptionsCache = new Map(); // 统一存储窗口的最新选项

        // 分离BrowserWindow配置和自定义配置
        this.windowPresets = {
            'ScreenshotToolWnd': this.getScreenshotToolWndConfig(),
            'CaptureWnd': this.getCaptureWndConfig(),
            'MeasureLineWnd': this.getMeasureLineWndConfig(),
            'ScreenRulerWnd': this.getScreenRulerWndConfig(),
            'DebugWnd': this.getDebugWndConfig()
        };

        this.activeWnd = "";
    }

    // 基础窗口配置（只包含BrowserWindow属性）
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
                preload: join(__dirname, '../preload.cjs'),
                contextIsolation: true
            }
        };
    }
    // 窗口配置预设 - 返回分离的配置对象
    getScreenshotToolWndConfig() {
        const icons = 13;
        const iconSize = 32;
        const iconGap = 12;
        const toolbarWidth = icons * iconSize + (icons - 1) * iconGap;
        const toolbarHeight = iconSize + 16;
        const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

        return {
            // BrowserWindow配置
            browserWindow: {
                x: screenWidth - toolbarWidth - 42,
                y: screenHeight - toolbarHeight - 42,
                width: toolbarWidth,
                height: toolbarHeight
            },
            // 自定义配置
            custom: {
                url: '/screenshot',
                levelName: 'popup-menu',
                levelZOrder: 2
            }
        };
    }

    getCaptureWndConfig() {
        const { width, height } = screen.getPrimaryDisplay().size;
        return {
            browserWindow: {
                x: 0, y: 0, width, height
            },
            custom: {
                url: '/screenshot/capture',
                levelName: 'screen-saver',
                levelZOrder: 100
            }
        };
    }

    getMeasureLineWndConfig(options = {}) {
        const { type = 'horizontal', position = 'top' } = options;
        const width = type === 'horizontal' ? 10 : 30;
        const height = type === 'horizontal' ? 30 : 10;

        return {
            browserWindow: {
                x: -100, y: -100, width, height,
                focusable: false,
            },
            custom: {
                url: '/measure-line',
                levelName: 'screen-saver',
                levelZOrder: 0,
                ignoreMouseEvents: true,
            }
        };
    }

    getScreenRulerWndConfig(options = {}) {
        const { type = 'horizontal' } = options;
        const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

        const rulerWidth = type === 'horizontal' ? 800 : 100;
        const rulerHeight = type === 'horizontal' ? 100 : 800;

        return {
            browserWindow: {
                x: (screenWidth - rulerWidth) / 2,
                y: (screenHeight - rulerHeight) / 2,
                width: rulerWidth,
                height: rulerHeight
            },
            custom: {
                url: '/screen-ruler',
                levelName: 'pop-up-menu',
                levelZOrder: 0
            }
        };
    }

    getDebugWndConfig(options = {}) {
        const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
        return {
            browserWindow: {
                x: screenWidth - 800, y: 20, width: 780, height: Math.floor(screenHeight / 3), show: false, frame: true, resizable: true
            },
            custom: {
                url: '/debug-wnd',
                levelName: 'pop-up-menu',
                levelZOrder: 0
            }
        };
    }

    /**
     * 统一窗口创建方法
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

        // 分离BrowserWindow配置和自定义配置
        const { browserWindow, custom } = config;

        // 合并BrowserWindow配置
        const wndOptions = {
            ...this.transparentWndOptions,
            ...browserWindow
        };

        // 创建窗口时立即存储选项
        this.windowOptionsCache.set(name, options);

        const wnd = this.createTransparentWnd({
            name,
            wndOptions,
            customOptions: custom
        });

        return wnd;
    }

    /**
     * 创建透明窗口
     */
    createTransparentWnd({ name, wndOptions, customOptions }) {
        // 避免重复创建
        if (this.wndMap.has(name)) {
            const existingWnd = this.wndMap.get(name);
            if (!existingWnd.isDestroyed()) {
                existingWnd.show();
                return existingWnd;
            }
        }

        const wnd = new BrowserWindow(wndOptions);
        this.wndMap.set(name, wnd);

        this.loadUrl(wnd, customOptions.url);

        if (customOptions.ignoreMouseEvents) {
            wnd.setIgnoreMouseEvents(true, { forward: true });
        }

        wnd.webContents.openDevTools({ 'detached': true });

        wnd.on('closed', () => {
            this.wndMap.delete(name);
            this.windowOptionsCache.delete(name);
        });

        // 窗口加载完成时设置层级
        wnd.webContents.once('did-finish-load', () => {
            if (customOptions.levelName && customOptions.levelZOrder !== undefined) {
                wnd.setAlwaysOnTop(true, customOptions.levelName, customOptions.levelZOrder);
            }
            wnd.moveTop();
        });

        return wnd;
    }

    /**
     * 改进的showWindow方法
     * @param {string} wndName 窗口名称
     * @param {Object} options 选项参数
     */
    showWindow(wndName, options = {}) {
        this.activeWnd = wndName;
        const wnd = this.wndMap.get(wndName);

        if (wnd && !wnd.isDestroyed()) {
            // 窗口已存在，更新选项
            this.windowOptionsCache.set(wndName, options);
            if (wnd.isFocusable()) {
                wnd.focus();
            }
            wnd.show();
            return true;
        } else {
            // 窗口不存在，创建新窗口
            this.createWindow(wndName, options);
            return true;
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
     * 创建测量线窗口
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

    // 其他方法
    hideWindow(wndKey) {
        this.activeWnd = "";
        const wnd = this.wndMap.get(wndKey);
        if (wnd && !wnd.isDestroyed()) {
            wnd.hide();
            return true;
        }
        return false;
    }

    closeWindow(wndKey) {
        this.activeWnd = "";
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

    // 获取窗口当前选项
    getWindowOptions(wndKey) {
        return this.windowOptionsCache.get(wndKey) || {};
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