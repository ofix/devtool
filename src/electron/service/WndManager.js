import { BrowserWindow, screen } from 'electron';
import path from 'path';

class WndManager {
    static instance = null;
    static mainWnd = null;
    static screenshotToolWnd = null;  // 控制工具栏窗口（小窗口，固定在左侧）
    static captureEditWnd = null;     // 截图编辑窗口（全屏透明窗口）

    constructor() {
        if (WndManager.instance) {
            throw new Error('请通过 WndManager.getInstance() 获取单例实例');
        }
    }

    static getInstance() {
        if (!WndManager.instance) {
            WndManager.instance = new WndManager();
        }
        return WndManager.instance;
    }

    /**
     * 创建截图控制工具栏窗口（小窗口，在屏幕左侧）
     */
    static createScreenshotToolWindow() {
        if (WndManager.screenshotToolWnd && !WndManager.screenshotToolWnd.isDestroyed()) {
            return WndManager.screenshotToolWnd;
        }

        // 控制工具栏是小窗口，不需要全屏
        const toolbarWidth = 60;     // 工具栏宽度
        const toolbarHeight = 400;   // 工具栏高度
        const screenSize = screen.getPrimaryDisplay().workAreaSize;
        
        // 计算位置：屏幕左侧居中
        const x = 0;
        const y = (screenSize.height - toolbarHeight) / 2;

        WndManager.screenshotToolWnd = new BrowserWindow({
            width: toolbarWidth,
            height: toolbarHeight,
            x: Math.floor(x),
            y: Math.floor(y),
            frame: false,
            transparent: true,
            hasShadow: true,         // 小窗口可以有阴影
            show: false,             // 初始隐藏
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
                preload: path.join(__dirname, 'preload.js')
            }
        });

        // 加载控制工具栏页面
        WndManager.screenshotToolWnd.loadURL(process.env.NODE_ENV === 'development'
            ? 'http://localhost:5173/#/control'  // 注意是 control 路由
            : `file://${path.join(__dirname, '../dist/index.html#/control')}`
        );

        // 窗口事件处理
        WndManager.screenshotToolWnd.on('closed', () => {
            WndManager.screenshotToolWnd = null;
        });

        // 窗口失焦时自动隐藏（可选）
        WndManager.screenshotToolWnd.on('blur', () => {
            // 如果需要自动隐藏功能，可以在这里实现
        });

        return WndManager.screenshotToolWnd;
    }

    /**
     * 创建截图编辑窗口（全屏透明窗口）
     */
    static createCaptureEditWindow() {
        if (WndManager.captureEditWnd && !WndManager.captureEditWnd.isDestroyed()) {
            WndManager.captureEditWnd.show();
            WndManager.captureEditWnd.focus();
            return WndManager.captureEditWnd;
        }

        // 获取所有显示器的工作区，处理多显示器情况
        const displays = screen.getAllDisplays();
        const bounds = {
            x: 0,
            y: 0,
            width: 0,
            height: 0
        };

        // 计算包含所有显示器的边界
        displays.forEach(display => {
            const workArea = display.workArea;
            bounds.x = Math.min(bounds.x, workArea.x);
            bounds.y = Math.min(bounds.y, workArea.y);
            bounds.width = Math.max(bounds.width, workArea.x + workArea.width);
            bounds.height = Math.max(bounds.height, workArea.y + workArea.height);
        });

        // 最终尺寸
        const totalWidth = bounds.width - bounds.x;
        const totalHeight = bounds.height - bounds.y;

        WndManager.captureEditWnd = new BrowserWindow({
            width: totalWidth,
            height: totalHeight,
            x: bounds.x,
            y: bounds.y,
            frame: false,
            transparent: true,
            hasShadow: false,
            show: false,             // 先不显示，等加载完成
            alwaysOnTop: true,
            skipTaskbar: true,
            movable: false,          // 截图窗口不能移动
            resizable: false,
            minimizable: false,
            maximizable: false,
            fullscreenable: false,
            enableLargerThanScreen: true,
            focusable: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js'),
                // 截图窗口需要额外的权限
                webSecurity: false,
                allowRunningInsecureContent: true
            }
        });

        // 加载截图编辑页面
        WndManager.captureEditWnd.loadURL(process.env.NODE_ENV === 'development'
            ? 'http://localhost:5173/#/screenshot'  // 注意是 screenshot 路由
            : `file://${path.join(__dirname, '../dist/index.html#/screenshot')}`
        );

        // 初始设置鼠标事件穿透
        WndManager.captureEditWnd.setIgnoreMouseEvents(true, { forward: true });

        // 窗口事件处理
        WndManager.captureEditWnd.on('closed', () => {
            WndManager.captureEditWnd = null;
        });

        WndManager.captureEditWnd.on('ready-to-show', () => {
            // 页面加载完成后，确保窗口在所有屏幕的最上层
            WndManager.captureEditWnd.setAlwaysOnTop(true, 'screen-saver');
            WndManager.captureEditWnd.show();
        });

        return WndManager.captureEditWnd;
    }

    /**
     * 显示截图控制工具栏
     */
    static showScreenshotToolWindow() {
        if (WndManager.screenshotToolWnd && !WndManager.screenshotToolWnd.isDestroyed()) {
            WndManager.screenshotToolWnd.show();
            WndManager.screenshotToolWnd.focus();
        } else {
            WndManager.createScreenshotToolWindow();
        }
    }

    /**
     * 隐藏截图控制工具栏
     */
    static hideScreenshotToolWindow() {
        if (WndManager.screenshotToolWnd && !WndManager.screenshotToolWnd.isDestroyed()) {
            WndManager.screenshotToolWnd.hide();
        }
    }

    /**
     * 显示截图编辑窗口
     */
    static showCaptureEditWindow() {
        if (WndManager.captureEditWnd && !WndManager.captureEditWnd.isDestroyed()) {
            WndManager.captureEditWnd.show();
            WndManager.captureEditWnd.focus();
        } else {
            WndManager.createCaptureEditWindow();
        }
        
        // 隐藏控制工具栏
        WndManager.hideScreenshotToolWindow();
    }

    /**
     * 隐藏截图编辑窗口
     */
    static hideCaptureEditWindow() {
        if (WndManager.captureEditWnd && !WndManager.captureEditWnd.isDestroyed()) {
            WndManager.captureEditWnd.hide();
        }
        
        // 显示控制工具栏
        WndManager.showScreenshotToolWindow();
    }

    /**
     * 关闭截图编辑窗口
     */
    static closeCaptureEditWindow() {
        if (WndManager.captureEditWnd && !WndManager.captureEditWnd.isDestroyed()) {
            WndManager.captureEditWnd.close();
            WndManager.captureEditWnd = null;
        }
        
        WndManager.showScreenshotToolWindow();
    }

    /**
     * 启用截图窗口的鼠标事件
     */
    static enableCaptureWindowMouseEvents() {
        if (WndManager.captureEditWnd && !WndManager.captureEditWnd.isDestroyed()) {
            WndManager.captureEditWnd.setIgnoreMouseEvents(false);
        }
    }

    /**
     * 禁用截图窗口的鼠标事件（穿透）
     */
    static disableCaptureWindowMouseEvents() {
        if (WndManager.captureEditWnd && !WndManager.captureEditWnd.isDestroyed()) {
            WndManager.captureEditWnd.setIgnoreMouseEvents(true, { forward: true });
        }
    }

    /**
     * 获取窗口实例
     */
    static getWindow(type) {
        switch (type) {
            case 'tool':
                return WndManager.screenshotToolWnd;
            case 'capture':
                return WndManager.captureEditWnd;
            case 'main':
                return WndManager.mainWnd;
            default:
                return null;
        }
    }

    /**
     * 清理所有窗口
     */
    static cleanup() {
        if (WndManager.screenshotToolWnd && !WndManager.screenshotToolWnd.isDestroyed()) {
            WndManager.screenshotToolWnd.close();
        }
        if (WndManager.captureEditWnd && !WndManager.captureEditWnd.isDestroyed()) {
            WndManager.captureEditWnd.close();
        }
        WndManager.screenshotToolWnd = null;
        WndManager.captureEditWnd = null;
        WndManager.instance = null;
    }
}

export default WndManager;