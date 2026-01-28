const { contextBridge, ipcRenderer } = require('electron/renderer')

contextBridge.exposeInMainWorld('channel', {
    setFullScreen: (flag) => ipcRenderer.send('full-screen', flag),
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
    on: (channel, listener) => ipcRenderer.on(channel, (_evt, ...args) => listener(...args)),
    off: (channel, listener) => ipcRenderer.off(channel, listener),
    minimize: () => ipcRenderer.send('window-minimize'),
    maximizeToggle: () => ipcRenderer.send('window-maximize-toggle'),
    close: () => ipcRenderer.send('window-close'),
    onMaximized: (cb) => ipcRenderer.on('maximized', cb),
    onUnmaximized: (cb) => ipcRenderer.on('unmaximized', cb),
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
    // 控制窗口
    showWindow: (window) => ipcRenderer.invoke("show-window", window),
    hideWindow: (window) => ipcRenderer.invoke("hide-window", window),
    // 屏幕截图
    showScreenshotTool: () => ipcRenderer.invoke("open-screenshot-tool"),
    closeScreenshotTool: () => ipcRenderer.invoke("close-screenshot-tool"),
    startScreenshot: (mode) => ipcRenderer.invoke("start-screenshot", mode),
    cancelScreenshot: () => ipcRenderer.invoke("cancel-screenshot"),
    getCaptureMode: () => ipcRenderer.invoke("get-capture-mode"),
    finishScreenshot: () => ipcRenderer.invoke('finish-screenshot'),
    sendToolCmd: (cmd, data) => ipcRenderer.invoke("tool-cmd", cmd, data),
    openScreenshotSettings: (data) => ipcRenderer.invoke("open-screenshot-settings", data),
    getDesktopScreenshot: () => ipcRenderer.invoke('get-desktop-screenshot'),
    enumWindowList: () => ipcRenderer.invoke('enum-window-list'),
    saveScrollScreenshot: (screenshotBase64) => ipcRenderer.send('save-scroll-screenshot', screenshotBase64),
    closeScreenshotWindow: () => ipcRenderer.send('close-screenshot-window'),
    // 屏幕标尺
    openScreenRuler: (option) => ipcRenderer.invoke("open-ruler", option),
    closeScreenRuler: () => ipcRenderer.invoke("close-ruler"),
    rulerToggleType: () => ipcRenderer.invoke("ruler:toggle-type"),
    rulerGetBounds: () => ipcRenderer.invoke("ruler:get-bounds"),
    rulerSetBounds: (bounds) => ipcRenderer.invoke("ruler:set-bounds", bounds),
    rulerGetSize: () => ipcRenderer.invoke("ruler:get-size"),
    rulerSetSize: (width, height) => ipcRenderer.invoke("ruler:set-size", width, height),
    rulerGetPosition: () => ipcRenderer.invoke("ruler:get-position"),
})
