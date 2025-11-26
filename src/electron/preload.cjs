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
    removeUnmaximized: (cb) => ipcRenderer.off('unmaximized', cb)
})
