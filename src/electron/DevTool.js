import { app, BrowserWindow, Menu, globalShortcut, ipcMain } from 'electron';
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import ShortcutManager from './service/ShortcutManager.js';
import IPCManager from "./service/IPCManager.js"
import WndManager from "./service/WndManager.js"
import debugLogger from './service/DebugLogger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'
const isLinux = process.platform === 'linux'

class DevTool {
    constructor() {
        this.mainWnd = null;
        this.appShortcuts = [
            {
                shortcut: "Ctrl+Shift+A",
                callback: () => {
                    const wndManager = WndManager.getInstance();
                    wndManager.createScreenshotToolWindow();
                },
                description: '打开截图工具' // 补充：每个快捷键独立描述
            }, {
                shortcut: "F10",
                callback: () => {
                    const wndManager = WndManager.getInstance();
                    let wnd = wndManager.getWindow('DebugWnd');
                    if (wnd && !wnd.isDestroyed()) {
                        wnd.isVisible() ? wnd.hide() : wnd.show();
                    } else {
                        wndManager.showWindow('DebugWnd', {});
                        const debugWindow = wndManager.getWindow('DebugWnd');
                        // 设置日志回调
                        debugLogger.setLogCallback((log) => {
                            if (debugWindow && debugWindow.isVisible()) {
                                debugWindow.webContents.send('new-log', log);
                            }
                        });
                        if (debugWindow) {
                            debugWindow.webContents.on('dom-ready', () => {
                                debugWindow.show();
                                const incrementalLogs = debugLogger.getIncrementalLogs();
                                if (incrementalLogs.length > 0) {
                                    debugWindow.webContents.send('incremental-logs', incrementalLogs); // 新增IPC事件：增量日志
                                }
                            });
                        }
                        // 第一次显示的时候推送历史日志

                    }
                },
                description: '显示/隐藏 调试窗口'
            }
        ];
    }

    init() {
        this.createMainWnd();
        const wndManager = WndManager.getInstance();
        wndManager.mainWnd = this.mainWnd;
        if (this.mainWnd && !this.mainWnd.isDestroyed()) {
            const ipcManager = IPCManager.getInstance(this.mainWnd);
            ipcManager.startListen();
        } else {
            console.error('主窗口未就绪，无法初始化 IPCManager');
        }
        this.registerAppShortcuts();

    }

    createMainWnd() {
        this.mainWnd = new BrowserWindow({
            width: 1280,
            height: 960,
            icon: join(__dirname, '../renderer/assets/devtool.ico'),
            frame: false, // 麒麟系统实际验证，也是可以自定义标题栏
            titleBarStyle: (isWin || isMac) ? 'hiddenInset' : 'default',// 关键：彻底隐藏系统按钮和标题栏框架必须hiddenInset
            // 仅在 Windows/Linux 且使用 hidden 样式时，才启用 titleBarOverlay
            ...((isWin || isMac) && {
                titleBarOverlay: {
                    color: '#1f1f1f',       // Windows 可自定义背景色
                    symbolColor: '#C7C7C7', // Windows 可自定义按钮颜色
                    height: 34                 // 标题栏高度（整数，单位 px）
                },
            }),
            webPreferences: {
                preload: join(__dirname, 'preload.cjs'),
                nodeIntegration: true,
                contextIsolation: true,// 必须开启，避免 monaco-editor Worker 路径冲突
                sandbox: false,
                webSecurity: false,
                backgroundThrottling: false, // 禁止后台节流，避免编辑器卡顿
            },
        });

        let listenUrl = process.argv[2];
        if (listenUrl) {
            this.mainWnd.loadURL(listenUrl);
        } else {
            // __dirname 是当前 main.js 所在目录：src/electron
            // ../../dist/renderer/index.html = app.asar/dist/renderer/index.html
            const entryPath = join(__dirname, '../../dist/renderer/index.html');
            // 使用 file 协议 URL（Electron 会自动识别 asar 内路径）
            this.mainWnd.loadURL(`file://${entryPath}`);
        }

        // 获取当前 Electron 应用的运行路径
        // 这通常是应用的 package.json 所在的位置  
        const appPath = app.getAppPath();
        // window.fullScreen = true; // 修复：变量名错误，应为 this.mainWnd
        // this.mainWnd.setFullScreen(true); // 如需全屏可启用

        // 修复：设置应用菜单为空（避免内存泄漏，添加判断）
        if (Menu.getApplicationMenu()) {
            Menu.setApplicationMenu(null);
        }

        // 补充：主窗口关闭时的清理逻辑
        this.mainWnd.on('closed', () => {
            this.mainWnd = null;
        });
    }

    registerAppShortcuts() {
        // 获取快捷键管理器单例
        const shortcutManager = ShortcutManager.getInstance();
        shortcutManager.init();

        // for...in 遍历对象，for...of 遍历数组
        for (const item of this.appShortcuts) {
            // 验证必填项
            if (!item.shortcut || !item.callback) {
                console.error('快捷键配置错误：缺少 shortcut 或 callback');
                continue;
            }

            // 注册快捷键
            const registered = shortcutManager.registerAppShortcut(
                item.shortcut,
                item.callback,
                {
                    global: true, // 设为全局快捷键（即使应用不在前台也能触发）
                    scope: 'app',
                    description: item.description || '自定义快捷键',
                    preventDefault: true // 阻止系统默认行为
                }
            );

            if (registered) {
                console.log(`全局快捷键 ${item.shortcut} 注册成功!`);
            } else {
                console.error(`全局快捷键 ${item.shortcut} 注册失败!`);
            }
        }
    }
}

export default DevTool;