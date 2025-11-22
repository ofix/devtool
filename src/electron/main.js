const { app, BrowserWindow, Menu, globalShortcut, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { title } = require('process')

const createWindow = () => {
    const window = new BrowserWindow({
        width: 1280,
        height: 960,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: true,
            sandbox: false,
            webSecurity: false
        },
        icon: path.join(__dirname, 'title.ico')
    })

    let listenUrl = process.argv[2]
    if (listenUrl) {
        window.loadURL(listenUrl)
    } else {
        // __dirname 是当前 main.js 所在目录：src/electron
        // ../../dist/renderer/index.html = app.asar/dist/renderer/index.html
        const entryPath = path.join(__dirname, '../../dist/renderer/index.html');
        // 使用 file 协议 URL（Electron 会自动识别 asar 内路径）
        window.loadURL(`file://${entryPath}`);
    }


    // 获取当前 Electron 应用的运行路径
    // 这通常是应用的 package.json 所在的位置  
    const appPath = app.getAppPath()
    // window.fullScreen = true;
    Menu.setApplicationMenu(null);
    window.webContents.openDevTools();

    globalShortcut.register('ESC', () => {
        window.fullScreen = false;
    })

    ipcMain.on("full-screen", (enent, flag) => {
        if (flag == 0) {
            console.log(window.isMinimized())
            console.log(window.isVisible())
            if (window.isMinimized()) {
                window.restore(); // 先恢复窗口  
                window.setFullScreen(true); // 再全屏显示  
            } else if (!window.isVisible()) {
                window.show(); // 如果窗口不可见，则显示窗口  
                window.setFullScreen(true); // 再全屏显示  
            } else {
                window.setFullScreen(true); // 直接全屏显示  
            }
        } else if (flag == 1) {
            window.fullScreen = false;  // 还原
        }
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








