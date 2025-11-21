const {contextBridge, ipcRenderer } = require('electron/renderer')

contextBridge.exposeInMainWorld('electronAPI', {
    setFullScreen: (flag) => ipcRenderer.send('full-screen', flag),
})
