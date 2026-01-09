import { BrowserWindow, screen } from 'electron';
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
        this.captureEditWnd = null;     // 截图编辑窗口（全屏透明窗口）
    }

    /**
     * 创建截图控制工具栏窗口（小窗口，在屏幕左侧）
     */
    createScreenshotToolWindow() {
        if (this.screenshotToolWnd && !this.screenshotToolWnd.isDestroyed()) {
            return this.screenshotToolWnd;
        }

        // 控制工具栏是小窗口，不需要全屏
        const toolbarWidth = 60;     // 工具栏宽度
        const toolbarHeight = 400;   // 工具栏高度
        const screenSize = screen.getPrimaryDisplay().workAreaSize;

        // 计算位置：屏幕左侧居中
        const x = 0;
        const y = (screenSize.height - toolbarHeight) / 2;

        this.screenshotToolWnd = new BrowserWindow({
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
    createCaptureEditWindow() {
        if (this.captureEditWnd && !this.captureEditWnd.isDestroyed()) {
            this.captureEditWnd.show();
            this.captureEditWnd.focus();
            return this.captureEditWnd;
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

        this.captureEditWnd = new BrowserWindow({
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
        this.captureEditWnd.loadURL(process.env.NODE_ENV === 'development'
            ? 'http://localhost:5173/#/screenshot'  // 注意是 screenshot 路由
            : `file://${path.join(__dirname, '../dist/index.html#/screenshot')}`
        );

        // 初始设置鼠标事件穿透
        this.captureEditWnd.setIgnoreMouseEvents(true, { forward: true });

        // 窗口事件处理
        this.captureEditWnd.on('closed', () => {
            this.captureEditWnd = null;
        });

        this.captureEditWnd.on('ready-to-show', () => {
            // 页面加载完成后，确保窗口在所有屏幕的最上层
            this.captureEditWnd.setAlwaysOnTop(true, 'screen-saver');
            this.captureEditWnd.show();
        });

        return this.captureEditWnd;
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
    showCaptureEditWindow() {
        if (this.captureEditWnd && !this.captureEditWnd.isDestroyed()) {
            this.captureEditWnd.show();
            this.captureEditWnd.focus();
        } else {
            this.createCaptureEditWindow();
        }

        // 隐藏控制工具栏
        this.hideScreenshotToolWindow();
    }

    /**
     * 隐藏截图编辑窗口
     */
    hideCaptureEditWindow() {
        if (this.captureEditWnd && !this.captureEditWnd.isDestroyed()) {
            this.captureEditWnd.hide();
        }

        // 显示控制工具栏
        this.showScreenshotToolWindow();
    }

    /**
     * 关闭截图编辑窗口
     */
    closeCaptureEditWindow() {
        if (this.captureEditWnd && !this.captureEditWnd.isDestroyed()) {
            this.captureEditWnd.close();
            this.captureEditWnd = null;
        }

        this.showScreenshotToolWindow();
    }

    /**
     * 启用截图窗口的鼠标事件
     */
    enableCaptureWindowMouseEvents() {
        if (this.captureEditWnd && !this.captureEditWnd.isDestroyed()) {
            this.captureEditWnd.setIgnoreMouseEvents(false);
        }
    }

    /**
     * 禁用截图窗口的鼠标事件（穿透）
     */
    disableCaptureWindowMouseEvents() {
        if (this.captureEditWnd && !this.captureEditWnd.isDestroyed()) {
            this.captureEditWnd.setIgnoreMouseEvents(true, { forward: true });
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
                return this.captureEditWnd;
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
        if (this.captureEditWnd && !this.captureEditWnd.isDestroyed()) {
            this.captureEditWnd.close();
        }
        this.screenshotToolWnd = null;
        this.captureEditWnd = null;
    }
}

export default WndManager;