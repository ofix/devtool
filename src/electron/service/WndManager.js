import { app, BrowserWindow, screen, Tray, globalShortcut, ipcMain } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Singleton from './Singleton.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const isMac = process.platform === 'darwin'

class WndManager extends Singleton {
    constructor() {
        super();
        this.wndMap = new Map();
        this.windowOptionsCache = new Map(); // 统一存储窗口的最新选项

        // 分离BrowserWindow配置和自定义配置
        this.windowPresets = {
            'MainWnd': this.getMainWndConfig(),
            'ScreenshotToolWnd': this.getScreenshotToolWndConfig(),
            'CaptureWnd': this.getCaptureWndConfig(),
            'ColorPickerWnd': this.getColorPickerWndConfig(),
            'ColorPaletteWnd': this.getColorPaletteWndConfig(),
            'MeasureLineWnd': this.getMeasureLineWndConfig(),
            'ScreenRulerWnd': this.getScreenRulerWndConfig(),
            'ToolConfigWnd': this.getToolConfigWndConfig(),
            'TrayAppWnd': this.getTrayAppWndConfig(),
            'UnitConvertWnd': this.getUnitConvertConfig(),
            'SFTPWnd': this.getDebugToolWndConfig(),
            'PostWomanWnd': this.getPostWomanWndConfig(),
            'DebugWnd': this.getDebugWndConfig(),
            'FileCompareWnd': this.getFileCompareWndConfig()
        };

        this.activeWnd = "";
    }

    // 基础窗口配置（只包含BrowserWindow属性）
    get transparentWndOptions() {
        return {
            frame: false,
            transparent: true,
            resizable: false,
            movable: true,
            focusable: true,
            autoHideMenuBar: true,
            useContentSize: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                webSecurity: false, // 关闭跨域安全检查
                preload: join(__dirname, '../preload.cjs'),
                contextIsolation: true,
                maxPayloadSize: 200 // 共享内存Buffer传输限制
            }
        };
    }
    getMainWndConfig() {
        const { screenWidth, screenHeight } = screen.getPrimaryDisplay().size;
        const width = 640 + 100;
        const height = 480 + 160;
        return {
            browserWindow: {
                x: (screenWidth - width) / 2, y: (screenHeight - height) / 2, width, height,
                transparent: true,
                titleBarStyle: 'hidden', resizable: false,
                titleBarOverlay: false,        // 显式关闭覆盖层
                trafficLightPosition: { x: -9999, y: -9999 }, // 把红绿灯移出可视区域
            },
            custom: {
                url: '/main-app',
                levelName: 'normal',
                levelZOrder: 0,
                devTool: false,
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
                levelName: 'normal',
                levelZOrder: 2
            }
        };
    }

    getCaptureWndConfig() {
        const { width, height } = screen.getPrimaryDisplay().size;
        return {
            browserWindow: {
                x: 0, y: 0, width, height,
                alwaysOnTop: true,
            },
            custom: {
                url: '/screenshot/capture',
                levelName: 'screen-saver',
                levelZOrder: 10
            }
        };
    }

    getColorPickerWndConfig() {
        const { width, height } = screen.getPrimaryDisplay().size;
        return {
            browserWindow: {
                x: 0, y: 0, width, height,
                alwaysOnTop: true, transparent: true,
                backgroundColor: '#00000000',
            },
            custom: {
                url: '/color-picker',
                levelName: 'screen-saver',
                levelZOrder: 20,
                devTool: false
            }
        };
    }

    getColorPaletteWndConfig() {
        const { screenWidth, screenHeight } = screen.getPrimaryDisplay().size;
        const width = 680;
        const height = 340;
        return {
            browserWindow: {
                x: (screenWidth - width) / 2, y: (screenHeight - height) / 2, width, height,
                alwaysOnTop: false, transparent: false,
            },
            custom: {
                url: '/color-palette',
                levelName: 'normal',
                levelZOrder: 0,
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
                focusable: false, show: true,
            },
            custom: {
                url: '/measure-line',
                levelName: 'pop-up-menu',
                levelZOrder: 100,
                ignoreMouseEvents: true,
                devTool: false
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
                levelName: 'normal',
                levelZOrder: 10,
                devTool: false
            }
        };
    }

    getToolConfigWndConfig(options = {}) {
        return {
            browserWindow: {
                x: -1000,
                y: -1000,
                width: 100,
                height: 100
            },
            custom: {
                url: '/tool-config',
                levelName: 'normal',
                levelZOrder: 0,
                devTool: false
            }
        };
    }

    getDebugToolWndConfig(options = {}) {
        const screenBounds = screen.getPrimaryDisplay().bounds;
        return {
            browserWindow: {
                x: 0,
                y: 0,
                width: screenBounds.width,
                height: screenBounds.height,
                transparent: false,
                resizable: true,
                movable: true,
            },
            custom: {
                url: '/debug-tool/ssh', // 不能指定/debug-tool，否则会被VSCodeLayout的路由守卫重定向，导致无法加载正确的页面
                levelName: 'normal',
                levelZOrder: 0,
                devTool: true
            }
        };
    }

    getPostWomanWndConfig(options = {}) {
        const screenBounds = screen.getPrimaryDisplay().bounds;
        return {
            browserWindow: {
                x: 0,
                y: 0,
                width: screenBounds.width,
                height: screenBounds.height,
                transparent: false,
            },
            custom: {
                url: '/postwoman',
                levelName: 'normal',
                levelZOrder: 0,
                devTool: true
            }
        };
    }

    getTrayAppWndConfig(options = {}) {
        const screenBounds = screen.getPrimaryDisplay().bounds;
        const trayIcon = join(__dirname, '../public/tray.png');
        let tray = new Tray(trayIcon);
        tray.setToolTip('devtool');
        tray.on('click', () => {
            let trayWnd = this.getWindow('TrayAppWnd');
            if (trayWnd && trayWnd.isVisible()) {
                this.hideWindow('TrayAppWnd');
            } else {
                this.showWindow('TrayAppWnd');
            }
        });
        const trayBounds = tray.getBounds(); // 托盘图标位置
        // 计算窗口位置（兼容Windows/macOS/Linux）
        const windowWidth = 420;
        const windowHeight = 600;
        let x, y;

        if (process.platform === 'win32' || process.platform === 'linux') {
            // Windows/Linux：右下角，托盘上方10px，右侧10px
            x = screenBounds.width - windowWidth;
            y = screenBounds.height - windowHeight - trayBounds.height;
        } else if (process.platform === 'darwin') {
            // macOS：右上角，托盘（菜单栏）下方10px
            x = screenBounds.width - windowWidth - 10;
            y = trayBounds.y + trayBounds.height + 10;
        }
        return {
            browserWindow: {
                x: x,
                y: y,
                width: windowWidth,
                height: windowHeight,
                alwaysOnTop: true,
            },
            custom: {
                url: '/tray-app',
                levelName: 'pop-up-menu',
                levelZOrder: 0,
                devTool: false
            }
        };
    }

    getUnitConvertConfig(options = {}) {
        const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
        const wndWidth = 800;
        const wndHeight = 600;
        return {
            browserWindow: {
                x: (screenWidth - wndWidth) / 2,
                y: (screenHeight - wndHeight) / 2,
                width: wndWidth,
                height: wndHeight,
                title: "单位换算",
                frame: false,
            },
            custom: {
                url: '/unit-convert',
                levelName: 'normal',
                levelZOrder: 0,
                devTool: true
            }
        };
    }

    getFileCompareWndConfig(options = {}) {
        const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
        const wndWidth = 960;
        const wndHeight = 680;
        return {
            browserWindow: {
                x: (screenWidth - wndWidth) / 2,
                y: (screenHeight - wndHeight) / 2,
                width: wndWidth,
                height: wndHeight,
                title: "文件比对",
                frame: true,
                resizable: true,
                transparent: false
            },
            custom: {
                url: '/file-compare',
                levelName: 'normal',
                levelZOrder: 0,
                devTool: true
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
                levelZOrder: 9
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


        if (customOptions.devTool) {
            console.log(`窗口 ${name} 打开开发者工具选项`);
            wnd.webContents.openDevTools({ mode: "detach", activate: true });
        }

        wnd.on('closed', () => {
            this.wndMap.delete(name);
            this.windowOptionsCache.delete(name);
        });

        // wnd._winBox.setDisableDragFeedback(true);

        // 窗口加载完成时设置层级
        wnd.webContents.once('did-finish-load', () => {
            if (customOptions.levelName) {
                if (customOptions.levelZOrder !== undefined && customOptions.levelZOrder !== 0) {
                    wnd.setAlwaysOnTop(true, customOptions.levelName, customOptions.levelZOrder);
                } else {
                    wnd.setAlwaysOnTop(false, customOptions.levelName, customOptions.levelZOrder);
                }
            }
            if (customOptions.ignoreMouseEvents) {
                console.log(`窗口 ${name} 忽略鼠标事件`);
                wnd.setIgnoreMouseEvents(true, { forward: true });
            }
            wnd.moveTop();
        });

        wnd.on("blur", () => {
            if (customOptions.ignoreMouseEvents) {
                console.log(`窗口 ${name} blur 的时候，忽略鼠标事件`);
                wnd.setIgnoreMouseEvents(true, { forward: true });
            }
        })

        return wnd;
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

    // 隐藏窗口 -- macOS下无动画效果
    hideWindow(wndKey) {
        this.activeWnd = "";
        const wnd = this.wndMap.get(wndKey);
        if (wnd && !wnd.isDestroyed()) {
            wnd.hide();
            return true;
        }
        return false;
    }

    // 最小化窗口
    minimizeWindow(wndKey) {
        const wnd = this.wndMap.get(wndKey);
        if (wnd && !wnd.isDestroyed()) {
            wnd.minimize();
            return true;
        }
        return false;
    }

    // 最大化窗口
    maximizeWindow(wndKey) {
        const wnd = this.wndMap.get(wndKey);
        if (wnd && !wnd.isDestroyed()) {
            console.log("最大化窗口 ", wndKey);
            wnd.maximize();
            return true;
        }
        return false;
    }

    // 恢复窗口
    restoreWindow(wndKey) {
        const wnd = this.wndMap.get(wndKey);
        if (wnd && !wnd.isDestroyed()) {
            wnd.restore();
            return true;
        }
        return false;
    }

    // 关闭窗口
    closeWindow(wndKey) {
        this.activeWnd = "";
        const wnd = this.wndMap.get(wndKey);
        if (wnd && !wnd.isDestroyed()) {
            if (isMac) {
                wnd.minimize();// macOS上隐藏窗口以保持应用活跃，符合平台习惯
            } else {
                wnd.close();
                this.wndMap.delete(wndKey);
                this.windowOptionsCache.delete(wndKey);
            }
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