import { app, BrowserWindow, Menu, globalShortcut, ipcMain } from 'electron';
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import IPCManager from "./service/IPCManager.js"
import mmFileManager from './core/MMFileManager.js';
import shortcutService from './services/ShortcutService'

// 创建ES模块的__dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'
const isLinux = process.platform === 'linux'

const createWindow = () => {
    const window = new BrowserWindow({
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
            contextIsolation: true,
            sandbox: false,
            webSecurity: false,
            backgroundThrottling: false, // 禁止后台节流，避免编辑器卡顿
        },
    })

    let listenUrl = process.argv[2]
    if (listenUrl) {
        window.loadURL(listenUrl)
        window.webContents.openDevTools();
    } else {
        // __dirname 是当前 main.js 所在目录：src/electron
        // ../../dist/renderer/index.html = app.asar/dist/renderer/index.html
        const entryPath = join(__dirname, '../../dist/renderer/index.html');
        // 使用 file 协议 URL（Electron 会自动识别 asar 内路径）
        window.loadURL(`file://${entryPath}`);
    }


    // 获取当前 Electron 应用的运行路径
    // 这通常是应用的 package.json 所在的位置  
    const appPath = app.getAppPath()
    // window.fullScreen = true;
    Menu.setApplicationMenu(null);

    globalShortcut.register('ESC', () => {
        window.fullScreen = false;
    })

    let ipcManager = new IPCManager(window);
    ipcManager.startListen();

    // 初始化快捷键服务
    shortcutService.initialize(mainWindow)

    // 可以动态注册额外的快捷键
    shortcutService.register('CommandOrControl+Shift+F', () => {
        console.log('高级查找')
    })
}


// 应用准备就绪，加载窗口
app.whenReady().then(() => {
    createWindow()
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length > 0) createWindow()

    })
})

// 对于 macOS，当所有窗口都关闭时，应用通常不会退出，而是保持在 Dock 中。
// 用户可以通过点击 Dock 图标来重新打开窗口。这就是macOS，这里没有调用 app.quit()
app.on('window-all-closed', () => {
    if (process.platform != 'darwin') app.quit()
})

// 应用退出时清理资源
app.on('will-quit', async () => {
    shortcutService.dispose()
});








