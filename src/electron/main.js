import { app, BrowserWindow } from 'electron';
import DevTool from "./DevTool.js";
// import mmFileManager from './core/MMFileManager.js';

let devTool = null;
app.whenReady().then(() => {
    devTool = new DevTool();
    devTool.init();
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

});








