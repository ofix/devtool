import { app, BrowserWindow } from 'electron';
import DevTool from "./DevTool.js";
// import mmFileManager from './core/MMFileManager.js';
import windowInfo from "./service/WindowInfo.js";
import WndManager from "./service/WndManager.js"

// 捕获未处理的异常
process.on('uncaughtException', (error) => {
    console.error('💥 未处理的异常:', error);
    // 不退出应用，记录错误即可
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 未处理的 Promise 拒绝:', reason);
});


let devTool = null;
app.whenReady().then(() => {
    const wndManager = WndManager.getInstance();
    wndManager.showWindow('TrayAppWnd');
    wndManager.hideWindow('TrayAppWnd');
    devTool = new DevTool();
    devTool.init();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length > 0) createWindow()
    })
    windowInfo.load(); // 加载 window-info 模块
})

// 对于 macOS，当所有窗口都关闭时，应用通常不会退出，而是保持在 Dock 中。
// 用户可以通过点击 Dock 图标来重新打开窗口。这就是macOS，这里没有调用 app.quit()
app.on('window-all-closed', () => {
    if (process.platform != 'darwin') app.quit()
})

// 应用退出时清理资源
app.on('will-quit', async () => {

});








