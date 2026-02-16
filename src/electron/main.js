import { app, BrowserWindow, nativeImage } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs';

import DevTool from "./DevTool.js";
import { isMac } from './DevTool.js';
// import mmFileManager from './core/MMFileManager.js';
import native from "./service/DevtoolNative.js";
import WndManager from "./service/WndManager.js"

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    // 必须先创建IPC才能创建MainWnd，否则会出现 setIgnoreMouseEvents 没有处理函数的错误
    devTool = new DevTool();
    devTool.init();

    const wndManager = WndManager.getInstance();
    wndManager.showWindow('MainWnd');
    if (!isMac) {
        wndManager.showWindow('TrayAppWnd');
        wndManager.hideWindow('TrayAppWnd');
    } else {
        const icnsPath = join(__dirname, '../renderer/assets/devtool.svg');
        try {
            // 1. 读取 ICNS 文件的二进制数据
            const iconImg = nativeImage.createFromPath(icnsPath);
            // 2. 强制设置图标尺寸（可选，确保清晰度）
            const sizedIcon = iconImg.resize({ width: 1024, height: 1024 });

            app.dock.setIcon(sizedIcon);
            app.dock.setIcon(sizedIcon);
            app.dock.hide();
            app.dock.show();
            console.log('✅ 程序坞图标设置成功！');

        } catch (err) {
            console.error('💥 读取失败：', err.message);
        }
        // console.log("设置程序坞图标，路径:", icnsPath);
        // 设置程序坞图标
        // app.dock.setIcon(icnsPath);
    }

    app.on('activate', () => {
        // if (BrowserWindow.getAllWindows().length > 0) createWindow()
    })
    native.load(); // 加载 native 模块
})

// 对于 macOS，当所有窗口都关闭时，应用通常不会退出，而是保持在 Dock 中。
// 用户可以通过点击 Dock 图标来重新打开窗口。这就是macOS，这里没有调用 app.quit()
app.on('window-all-closed', () => {
    if (process.platform != 'darwin') app.quit()
})

// 应用退出时清理资源
app.on('will-quit', async () => {

});








