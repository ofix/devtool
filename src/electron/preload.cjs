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
    clear: () => ipcRenderer.invoke('mmf:clear')
})
