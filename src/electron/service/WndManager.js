import { BrowserWindow, screen, globalShortcut } from 'electron';
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import path from "path"
import Singleton from './Singleton.js';
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

class WndManager extends Singleton {
    constructor() {
        super();
        this.mainWnd = null;
        this.screenshotToolWnd = null;  // 控制工具栏窗口（小窗口，固定在左侧）
        this.captureWnd = null; // 截图窗口
        this.captureMode = 'rect';
        this.screenRulerWnd = null; // 屏幕标尺窗口
        this.bindMouseEvents = null;     // 截图编辑窗口（全屏透明窗口）
        this.measureLineWnd = null; // 屏幕测量线窗口
        this.measureLineWndVisible = false;
    }

    /**
     * 创建截图控制工具栏窗口（小窗口，在屏幕左侧）
     */
    createScreenshotToolWindow() {
        if (this.screenshotToolWnd && !this.screenshotToolWnd.isDestroyed()) {
            this.screenshotToolWnd.show();
            this.screenshotToolWnd.focus();
            return this.screenshotToolWnd;
        }

        // 控制工具栏是小窗口，不需要全屏
        const icons = 13;
        const iconSize = 32;
        const iconGap = 12;
        const toolbarWidth = icons * iconSize + (icons - 1) * iconGap;     // 工具栏宽度
        const toolbarHeight = iconSize + 16;   // 工具栏高度
        const screenSize = screen.getPrimaryDisplay().workAreaSize;

        // 计算位置：屏幕左侧居中
        const x = screenSize.width - toolbarWidth - 42;
        const y = screenSize.height - toolbarHeight - 42;
        this.screenshotToolWnd = new BrowserWindow({
            width: toolbarWidth,
            height: toolbarHeight,
            x: Math.floor(x),
            y: Math.floor(y),
            frame: false,
            transparent: true,
            hasShadow: true,         // 小窗口可以有阴影
            show: true,
            alwaysOnTop: true,
            skipTaskbar: true,
            movable: true,           // 工具栏应该可以移动
            resizable: false,        // 不需要调整大小
            minimizable: false,
            maximizable: false,
            fullscreenable: false,
            focusable: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                devTools: false,
                preload: path.join(__dirname, '../preload.cjs')
            }
        });

        // 加载控制工具栏页面
        let listenUrl = process.argv[2];
        this.screenshotToolWnd.loadURL(process.env.NODE_ENV === 'development'
            ? `${listenUrl}/#/screenshot`
            : `file://${path.join(__dirname, '../dist/index.html#/screenshot')}`
        );

        // 窗口事件处理
        this.screenshotToolWnd.on('closed', () => {
            this.screenshotToolWnd = null;
        });

        // 窗口失焦时自动隐藏（可选）
        this.screenshotToolWnd.on('blur', () => {
            // 如果需要自动隐藏功能，可以在这里实现
        });
        return this.screenshotToolWnd;
    }

    /**
     * 创建截图编辑窗口（全屏透明窗口）
     */
    createCaptureWindow(mode) {
        this.captureMode = mode;
        if (this.captureWnd && !this.captureWnd.isDestroyed()) {
            this.captureWnd.show();
            this.captureWnd.focus();
            return this.captureWnd;
        }

        // 获取所有显示器的工作区，处理多显示器情况
        // const displays = screen.getAllDisplays();
        // const bounds = {
        //     x: 0,
        //     y: 0,
        //     width: 0,
        //     height: 0
        // };

        // // 计算包含所有显示器的边界
        // displays.forEach(display => {
        //     const workArea = display.workArea;
        //     bounds.x = Math.min(bounds.x, workArea.x);
        //     bounds.y = Math.min(bounds.y, workArea.y);
        //     bounds.width = Math.max(bounds.width, workArea.x + workArea.width);
        //     bounds.height = Math.max(bounds.height, workArea.y + workArea.height);
        // });

        // // 最终尺寸
        // const totalWidth = bounds.width - bounds.x;
        // const totalHeight = bounds.height - bounds.y;

        const primaryDisplay = screen.getPrimaryDisplay()
        const { width, height } = primaryDisplay.size

        this.captureWnd = new BrowserWindow({
            width: width,
            height: height,
            x: 0,
            y: 0,
            enableKeybindings: true,
            fullscreen: true, // 可以同时设置
            frame: false,
            alwaysOnTop: true,
            skipTaskbar: true,
            transparent: true,
            backgroundColor: '#00000000',
            hasShadow: false,
            show: false,             // 先不显示，等加载完成
            movable: false,          // 截图窗口不能移动
            resizable: false,
            minimizable: false,
            maximizable: false,
            fullscreenable: false,
            enableLargerThanScreen: true,
            titleBarStyle: 'customButtonsOnHover', // Linux 下设置窗口层级为最高（高于任务栏）
            focusable: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, '../preload.cjs'),
                // 截图窗口需要额外的权限
                webSecurity: true,
                allowRunningInsecureContent: false,
                // 禁用硬件加速（部分设备会导致截图闪烁）
                hardwareAcceleration: true,
            }
        });

        // 禁用窗口动画（Windows/macOS 通用）
        this.captureWnd.setOpacity(1);
        this.captureWnd.setHasShadow(false);

        // 新增：Linux 下强制设置窗口为「顶层窗口」（麒麟系统专用）
        if (process.platform === 'linux') {
            this.captureWnd.setAlwaysOnTop(true, 'screen-saver'); // 层级高于屏幕保护程序/任务栏
            this.captureWnd.setVisibleOnAllWorkspaces(true); // 所有工作区可见
        }

        // 加载截图编辑页面
        let listenUrl = process.argv[2];

        this.captureWnd.loadURL(process.env.NODE_ENV === 'development'
            ? `${listenUrl}/#/screenshot/capture`  // 注意是 screenshot 路由
            : `file://${path.join(__dirname, '../dist/index.html#/screenshot/capture')}`
        );

        // this.captureWnd.webContents.openDevTools();

        // 窗口事件处理
        this.captureWnd.on('closed', () => {
            this.captureWnd = null;
        });

        this.captureWnd.webContents.on('did-finish-load', () => {
            // 页面加载完成后，确保窗口在所有屏幕的最上层
            // this.captureWnd.setFullScreen(true);
            // this.captureWnd.setAlwaysOnTop(true, 'screen-saver');
            this.captureWnd.show();
            // 聚焦窗口，确保鼠标事件生效
            this.captureWnd.focus();
            // 可选：强制刷新窗口尺寸，确保覆盖整个屏幕
            setTimeout(() => {
                this.captureWnd.setBounds({ x: 0, y: 0, width, height });
            }, 100);

        });

        return this.captureWnd;
    }

    showMeasureLineWnd(options = { type: 'horizontal', visible: false, precision: 1 }) {
        if (options.visible) {
            this.createMeasureLineWindow();

        } else {
            this.measureLineWnd?.hide();

        }
    }

    // 创建屏幕标尺测量线
    createMeasureLineWindow(options = { type: 'horizontal', precision: 1 }) {
        if (this.measureLineWnd) {
            this.measureLineWnd.show();
            return this.measureLineWnd;
        }

        let width = 10;
        let height = 30;
        if (options.type != 'horizontal') {
            width = 30;
            height = 10;
        }
        this.measureLineWnd = new BrowserWindow({
            width: width,
            height: height,
            x: -100,
            y: -100,
            frame: false, // 无边框
            transparent: true, // 透明背景
            alwaysOnTop: true, // 置顶
            resizable: false, // 可缩放
            aspectRatio: undefined, // 清空宽高比约束
            movable: true, // 可拖拽
            focusable: false,           // 不获取焦点
            // 禁止Electron自动调整窗口位置（避免尺寸变化后窗口跑偏）
            autoHideMenuBar: true,
            useContentSize: true, // 关键：尺寸基于内容区域，而非窗口边框
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                devTools: false,
                preload: path.join(__dirname, '../preload.cjs')
            },
        });

        // 加载标尺页面
        let listenUrl = process.argv[2];
        this.measureLineWnd.loadURL(process.env.NODE_ENV === 'development'
            ? `${listenUrl}/#/measure-line`
            : `file://${path.join(__dirname, '../dist/index.html/#/measure-line')}`
        );

        this.measureLineWnd.setIgnoreMouseEvents(true, { forward: true });

        // 监听窗口关闭
        this.measureLineWnd.on('closed', () => {
            this.measureLineWnd = null;
        });

        // 关键：在页面加载完成后设置层级（确保生效）
        this.measureLineWnd.webContents.on('did-finish-load', () => {
            // 使用floating层级（优先级高于normal）+ 更高的relativeLevel
            this.measureLineWnd.setAlwaysOnTop(true, 'screen-saver', 0);
            this.measureLineWnd.moveTop(); // 强制移到所有窗口之上
        });


        return this.measureLineWnd;
    }

    // 打开屏幕标尺窗口
    createScreenRulerWindow(options = { type: 'horizontal', precision: 1 }) {
        if (this.screenRulerWnd) {
            this.screenRulerWnd.focus();
            return this.screenRulerWnd;
        }

        // 获取屏幕尺寸
        const primaryDisplay = screen.getPrimaryDisplay();
        // const scaleFactor = primaryDisplay.scaleFactor || 1;
        const { width, height } = primaryDisplay.workAreaSize;

        /***************************************************************************
         * 场景	               禁用enableHighDpiSupport()	       启用enableHighDpiSupport()
         * DPR 读取	           返回 1.0（虚假值）	                返回 2.0（真实值）
         * 窗口高度设置 100px	物理高度 = 100px（内容拉伸模糊）      物理高度 = 200px（内容清晰）
         * 标尺 Canvas 渲染	    刻度模糊、锯齿明显	刻度清晰、1px     物理像素精准对齐
         * getContentSize()	   返回物理像素值（100px）	            返回逻辑像素值（50px）
         ***************************************************************************/
        // 标尺默认尺寸
        const rulerWidth = options.type === 'horizontal' ? 800 : 100;
        const rulerHeight = options.type === 'horizontal' ? 100 : 800;

        this.screenRulerWnd = new BrowserWindow({
            width: rulerWidth,
            height: rulerHeight,
            x: (width - rulerWidth) / 2,
            y: (height - rulerHeight) / 2,
            frame: false, // 无边框
            transparent: true, // 透明背景
            alwaysOnTop: true, // 置顶
            resizable: false, // 可缩放
            aspectRatio: undefined, // 清空宽高比约束
            movable: true, // 可拖拽
            // 禁止Electron自动调整窗口位置（避免尺寸变化后窗口跑偏）
            autoHideMenuBar: true,
            // 启用高DPI
            enableHighDpi: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                devTools: false,
                preload: path.join(__dirname, '../preload.cjs')
            },
        });

        // 加载标尺页面
        let listenUrl = process.argv[2];
        this.screenRulerWnd.loadURL(process.env.NODE_ENV === 'development'
            ? `${listenUrl}/#/screen-ruler`
            : `file://${path.join(__dirname, '../dist/index.html/#screen-ruler')}`
        );

        // 设置层级，数值越高越靠前
        // 预设层级常量（优先级从低到高）：normal < floating < tray < screen-saver < top-most
        this.screenRulerWnd.webContents.on('did-finish-load', () => {
            this.screenRulerWnd.setAlwaysOnTop(true, 'pop-up-menu', 0); // normal层级+10（低于measureLineWnd的30）
        });


        // 监听窗口关闭
        this.screenRulerWnd.on('closed', () => {
            this.screenRulerWnd = null;
        });

        // 绑定鼠标事件
        globalShortcut.register('Escape', () => {
            if (this.screenRulerWnd) {
                this.screenRulerWnd.close();
                globalShortcut.unregister('Escape');
            }
        });

        this.screenRulerWnd.on('closed', () => {
            globalShortcut.unregister('Escape');
        });
        return this.screenRulerWnd;
    }

    /**
     * 显示截图控制工具栏
     */
    showScreenshotToolWindow() {
        if (this.screenshotToolWnd && !this.screenshotToolWnd.isDestroyed()) {
            this.screenshotToolWnd.show();
            this.screenshotToolWnd.focus();
        } else {
            this.createScreenshotToolWindow();
        }
    }

    /**
     * 隐藏截图控制工具栏
     */
    hideScreenshotToolWindow() {
        if (this.screenshotToolWnd && !this.screenshotToolWnd.isDestroyed()) {
            this.screenshotToolWnd.hide();
        }
    }

    /**
     * 显示截图编辑窗口
     */
    showCaptureWindow(mode) {
        this.captureMode = mode;
        if (this.captureWnd && !this.captureWnd.isDestroyed()) {
            this.captureWnd.show();
            this.captureWnd.focus();
        } else {
            this.createCaptureWindow(mode);
        }

        // 隐藏控制工具栏
        this.hideScreenshotToolWindow();
    }

    getCaptureMode() {
        return this.captureMode;
    }

    /**
     * 隐藏截图编辑窗口
     */
    hideCaptureWindow() {
        if (this.captureWnd && !this.captureWnd.isDestroyed()) {
            this.captureWnd.hide();
        }

        // 显示控制工具栏
        this.showScreenshotToolWindow();
    }

    /**
     * 关闭截图工具窗口
     */
    closeScreenshotToolWindow() {
        if (this.screenshotToolWnd && !this.screenshotToolWnd.isDestroyed()) {
            this.screenshotToolWnd.close();
            this.screenshotToolWnd = null;
        }
    }

    /**
     * 关闭截图编辑窗口
     */
    closeCaptureWindow() {
        if (this.captureWnd && !this.captureWnd.isDestroyed()) {
            this.captureWnd.close();
            this.captureWnd = null;
        }

        this.showScreenshotToolWindow();
    }

    // 关闭屏幕标尺窗口
    closeScreenRulerWindow() {
        if (this.screenRulerWnd && !this.screenRulerWnd.isDestroyed()) {
            this.screenRulerWnd.close();
            this.screenRulerWnd = null;
        }
    }

    /**
     * 启用截图窗口的鼠标事件
     */
    enableCaptureWindowMouseEvents() {
        if (this.captureWnd && !this.captureWnd.isDestroyed()) {
            this.captureWnd.setIgnoreMouseEvents(false);
        }
    }

    /**
     * 禁用截图窗口的鼠标事件（穿透）
     */
    disableCaptureWindowMouseEvents() {
        if (this.captureWnd && !this.captureWnd.isDestroyed()) {
            this.captureWnd.setIgnoreMouseEvents(true, { forward: true });
        }
    }

    /**
     * 获取窗口实例
     */
    getWindow(type) {
        switch (type) {
            case 'tool':
                return this.screenshotToolWnd;
            case 'capture':
                return this.captureWnd;
            case 'main':
                return this.mainWnd;
            default:
                return null;
        }
    }

    /**
     * 清理所有窗口
     */
    cleanup() {
        if (this.screenshotToolWnd && !this.screenshotToolWnd.isDestroyed()) {
            this.screenshotToolWnd.close();
        }
        if (this.captureWnd && !this.captureWnd.isDestroyed()) {
            this.captureWnd.close();
        }
        if (this.screenRulerWnd && !this.screenRulerWnd.isDestroyed()) {
            this.screenRulerWnd.close();
        }
        this.screenshotToolWnd = null;
        this.captureWnd = null;
        this.screenRulerWnd = null;
    }
}

export default WndManager;