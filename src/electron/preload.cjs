const { contextBridge, ipcRenderer } = require('electron/renderer')

function safeStringify (arg) {
    const seen = new WeakMap();
    try {
        return JSON.stringify(arg, (key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) return '[循环引用]';
                seen.set(value, true);
            }
            // 处理特殊类型
            if (value === undefined) return 'undefined';
            if (typeof value === 'function') return '[Function]';
            return value;
        }, 2);
    } catch (e) {
        return `[序列化失败: ${e.message}]`;
    }
}

// 封装日志发送到主进程的核心逻辑（加异常捕获+日志打印）
function sendLogToMainProcess (type, args) {
    try {
        // 前置校验：ipcRenderer 是否就绪
        if (!ipcRenderer || typeof ipcRenderer.send !== 'function') {
            console.error('[日志发送失败] ipcRenderer 未就绪');
            return;
        }

        const logData = {
            type,
            timestamp: new Date().toLocaleString(),
            args: Array.from(args).map(arg => {
                if (typeof arg === 'object' && arg !== null) {
                    return safeStringify(arg);
                }
                // 基础类型直接返回，处理 undefined/function
                return arg === undefined ? 'undefined' :
                    typeof arg === 'function' ? '[Function]' : arg;
            })
        };

        ipcRenderer.send('console-log', logData);
    } catch (e) {
        // 降级到原生console输出错误（带详细栈信息）
        console.error('[日志转发到调试面板失败]', e.stack);
    }
}

const wndLog = (...args) => sendLogToMainProcess('log', args);
const wndError = (...args) => sendLogToMainProcess('error', args);
const wndWarn = (...args) => sendLogToMainProcess('warn', args);
const wndInfo = (...args) => sendLogToMainProcess('info', args);

// 2. 通过 contextBridge 暴露 wnd（无需 initWndLog，直接全局可用）
contextBridge.exposeInMainWorld('dt', {
    log: wndLog,
    error: wndError,
    warn: wndWarn,
    info: wndInfo
});


contextBridge.exposeInMainWorld('channel', {
    clearDebugLogs: () => ipcRenderer.send('clear-debug-logs'),
    setFullScreen: (flag, wndName) => ipcRenderer.send('full-screen', flag, wndName),
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
    on: (channel, callback) => {
        const wrappedCallback = (event, ...args) => {
            callback(event, ...args); // 解构参数，确保渲染进程能拿到 logs
        };
        ipcRenderer.on(channel, wrappedCallback);
        // 返回移除监听的方法（可选）
        return () => ipcRenderer.removeListener(channel, wrappedCallback);
    },
    off: (channel, listener) => ipcRenderer.off(channel, listener),
    // 控制窗口
    showWindow: (wndName, options = {}) => ipcRenderer.invoke("show-window", wndName, options),
    hideWindow: (wndName) => ipcRenderer.invoke("hide-window", wndName),
    closeWindow: (wndName) => ipcRenderer.invoke("close-window", wndName),
    minimizeWindow: (wndName) => ipcRenderer.invoke('minimize-window', wndName),
    maximizeWindow: (wndName) => ipcRenderer.invoke('maximize-window', wndName),
    restoreWindow: (wndName) => ipcRenderer.invoke('restore-window', wndName),
    getWindowBounds: (wndName) => ipcRenderer.invoke('get-window-bounds', wndName),
    setWindowBounds: (wndName, bounds) => ipcRenderer.invoke('set-window-bounds', wndName, bounds),
    moveWindow: (wndName, deltaX, deltaY) => ipcRenderer.invoke('move-window', wndName, deltaX, deltaY),
    getWindowOptions: (wndName) => ipcRenderer.invoke("get-window-options", wndName),
    onMaximized: (cb) => ipcRenderer.on('maximized', cb),
    onUnmaximized: (cb) => ipcRenderer.on('unmaximized', cb),
    ignoreMouseEvents: (wndName, enable) => ipcRenderer.invoke('ignoreMouseEvents', wndName, enable),
    getScreenMousePos: () => ipcRenderer.invoke('get-screen-mouse-pos'),
    getPlatformInfo: () => ipcRenderer.invoke('get-platform-info'),
    removeMaximized: (cb) => ipcRenderer.off('maximized', cb),
    removeUnmaximized: (cb) => ipcRenderer.off('unmaximized', cb),
    // SSH 连接/断开
    sshConnect: ({ host, port, username, password, remotePath }) => ipcRenderer.invoke('ssh:connect', { host, port, username, password, remotePath }),
    sshDisconnect: (host) => ipcRenderer.invoke('ssh:disconnect', host),
    // SFTP 操作
    sshListDir: ({ host, port, username, password, remotePath }) => ipcRenderer.invoke('ssh:listDir', { host, port, username, password, remotePath }),
    // 下载单个文件到内存映射文件，避免文件拷贝
    sshDownloadToMMF: ({ host, port, username, password, remotePath }) => ipcRenderer.invoke('ssh:downloadToMMF', { host, port, username, password, remotePath }),
    // 压缩文件读写
    extractFile: (archivePath) => ipcRenderer.invoke('mmf:extract', archivePath),
    loadFileContents: (fileMeta) => ipcRenderer.invoke('mmf:loadFileContents', fileMeta),
    writeFile: (cacheKey, offset, data) => ipcRenderer.invoke('mmf:write', cacheKey, offset, data),
    saveFile: (cacheKey, outputPath) => ipcRenderer.invoke('mmf:save', cacheKey, outputPath),
    compressGZ: (cacheKey, outputPath) => ipcRenderer.invoke('mmf:compress-gz', cacheKey, outputPath),
    decompressGZ: (gzPath) => ipcRenderer.invoke('mmf:decompress-gz', gzPath),
    clear: () => ipcRenderer.invoke('mmf:clear'),
    // 快捷键相关操作
    registerShortcut: (accelerator, handlerName) => ipcRenderer.invoke('shortcut:register', accelerator, handlerName),
    unregisterShortcut: (accelerator) => ipcRenderer.invoke('shortcut:unregister', accelerator),
    getAllShortcuts: () => ipcRenderer.invoke('shortcut:getAll'),
    isShortcutRegistered: (accelerator) => ipcRenderer.invoke('shortcut:isRegistered', accelerator),
    onShortcut: (handlerName, callback) => {
        const channel = `shortcut:${handlerName}`
        ipcRenderer.on(channel, (event, ...args) => callback(...args));
    },
    // 发送网络请求
    doPost: (options) => ipcRenderer.invoke('https:post', options),
    doGet: (options) => ipcRenderer.invoke("https:get", options),
    doDelete: (options) => ipcRenderer.invoke("https:delete", options),
    doPatch: (options) => ipcRenderer.invoke("https:patch", options),
    doPut: (options) => ipcRenderer.invoke("https:put", options),
    // 屏幕截图
    lockScreen: () => ipcRenderer.invoke('lock-screen'),
    unlockScreen: () => ipcRenderer.invoke('unlock-screen'),
    isScreenLocked: () => ipcRenderer.invoke('is-screen-locked'),
    startScreenshot: (mode) => ipcRenderer.invoke("start-screenshot", mode),
    cancelScreenshot: () => ipcRenderer.invoke("cancel-screenshot"),
    finishScreenshot: () => ipcRenderer.invoke('finish-screenshot'),
    sendToolCmd: (cmd, data) => ipcRenderer.invoke("tool-cmd", cmd, data),
    openScreenshotSettings: (data) => ipcRenderer.invoke("open-screenshot-settings", data),
    getDesktopScreenshot: () => ipcRenderer.invoke('get-desktop-screenshot'),
    enumWindowList: () => ipcRenderer.invoke('enum-window-list'),
    saveScrollScreenshot: (screenshotBase64) => ipcRenderer.send('save-scroll-screenshot', screenshotBase64),
    closeScreenshotWindow: () => ipcRenderer.send('close-screenshot-window'),
    // 屏幕标尺
    rulerToggleType: () => ipcRenderer.invoke("ruler:toggle-type"),
    rulerGetBounds: () => ipcRenderer.invoke("ruler:get-bounds"),
    rulerSetBounds: (bounds) => ipcRenderer.invoke("ruler:set-bounds", bounds),
    rulerGetSize: () => ipcRenderer.invoke("ruler:get-size"),
    rulerSetSize: (width, height) => ipcRenderer.invoke("ruler:set-size", width, height),
    rulerGetPosition: () => ipcRenderer.invoke("ruler:get-position"),
    updateMeasureLinePos: (option) => ipcRenderer.invoke("ruler:update-measure-line-pos", option),
})
