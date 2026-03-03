// src/main/pinWindowManager.js
import { BrowserWindow, screen, ipcMain } from 'electron'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import Store from 'electron-store' // 新增：引入本地存储

// 初始化本地存储（持久化历史钉图数据）
const store = new Store({
    name: 'pin-history', // 存储文件名：pin-history.json
    defaults: {
        history: [] // 历史记录数组：[{ pinId, imageData, createTime, isActive }]
    }
})

class PinWndManager {
    constructor() {
        this.pinWindows = new Map()
        this.initIpcHandlers()
        // 初始化：标记所有历史记录为非活跃（因为窗口重启后都已关闭）
        this._updateAllHistoryInactive()
    }

    initIpcHandlers() {
        // 创建窗口
        ipcMain.handle('pin-image:create', async (_, imageData) => {
            return this.createPinWindow(imageData)
        })

        // 渲染进程主动获取指定ID的钉图数据
        ipcMain.handle('pin-image:get-one', (_, pinId) => {
            return this.getImageData(pinId)
        })

        // 渲染进程通知窗口加载完成，显示窗口
        ipcMain.handle('pin-image:open-wnd', (_, pinId) => {
            this.openPinWindow(pinId)
        })

        // 关闭指定钉图窗口
        ipcMain.handle('pin-image:close-wnd', (_, pinId) => {
            this.closePinWindow(pinId)
        })

        // 关闭所有钉图窗口
        ipcMain.handle('pin-image:close-all-wnd', () => {
            this.closeAllPinWindows()
        })

        // 窗口移动（渲染进程主动调用）
        ipcMain.handle('pin-image:set-wnd-bounds', (event, { x, y, width, height }) => {
            const pinId = this.getPinIdByWebContents(event.sender)
            if (pinId) {
                const window = this.pinWindows.get(pinId).window
                window.setBounds({ x, y, width, height }) // 禁用动画，提升流畅度
            }
        })
        // 获取所有历史钉图记录
        ipcMain.handle('pin-image:get-all', () => {
            return this.getHistory()
        })

        // 从历史记录重新创建钉图窗口
        ipcMain.handle('pin-image:get-all', async (_, pinId) => {
            return this.reopenFromHistory(pinId)
        })

        // 删除单条历史记录
        ipcMain.handle('pin-image:delete-one', (_, pinId) => {
            this.deleteHistory(pinId)
        })

        // 清空所有历史记录
        ipcMain.handle('pin-image:delete-all', () => {
            this.clearHistory()
        })

        // 标记记录为活跃/非活跃（窗口打开/关闭时）
        ipcMain.handle('pin-image:mark-active', (_, pinId, isActive) => {
            this.markHistoryActive(pinId, isActive)
        })
    }

    /**
     * 创建钉图窗口时，同步保存到历史记录
     * 重写原有 createPinWindow 方法的最后部分
     */
    createPinWindow(imageData) {
        const pinId = uuidv4()
        const { bounds } = imageData

        // 获取目标屏幕（适配多屏）
        const display = screen.getDisplayMatching(bounds)

        // 创建优化后的无框窗口
        const wnd = new BrowserWindow({
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            frame: false, // 无边框
            transparent: true, // 透明背景
            resizable: false,
            movable: true,
            alwaysOnTop: true,
            skipTaskbar: true,
            fullscreenable: false,
            show: false, // 初始隐藏，等待渲染进程加载完成后再显示
            type: 'desktop', // macOS 桌面窗口
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                backgroundThrottling: false, // 禁止后台节流
                disableHardwareAcceleration: false, // 图片渲染保留硬件加速
            }
        })

        // Windows 窗口层级优化
        if (process.platform === 'win32') {
            wnd.setAlwaysOnTop(true, 'screen-saver', 1)
            wnd.setVisibleOnAllWorkspaces(true)
        }

        // 加载渲染进程页面（携带pinId参数）
        let url = `/screenshot/pin-wnd/${pinId}`;
        const listenServerUrl = process.argv[2];
        const targetUrl = process.env.NODE_ENV === 'development'
            ? `${listenServerUrl}/#${url}`
            : `file://${join(__dirname, `../dist/index.html/#${url}`)}`;

        wnd.loadURL(targetUrl);

        // 监听窗口关闭，自动清理映射关系
        wnd.on('closed', () => {
            this.pinWindows.delete(pinId)
        })

        // 新增：保存到历史记录
        const historyRecord = {
            pinId,
            imageData: {
                // 只存储必要数据，避免体积过大：Buffer转为base64存储
                base64: imageData.buffer.toString('base64'),
                bounds: imageData.bounds,
                format: imageData.format || 'png'
            },
            createTime: Date.now(),
            isActive: true // 新创建的窗口为活跃状态
        }

        // 存储到本地
        const history = store.get('history', [])
        history.unshift(historyRecord) // 最新的放在最前面
        // 可选：限制历史记录数量（比如最多100条）
        if (history.length > 100) {
            history.pop()
        }
        store.set('history', history)

        // 原有存储逻辑
        this.pinWindows.set(pinId, {
            wnd,
            imageData,
            createTime: Date.now()
        })

        return pinId
    }

    /**
     * 获取所有历史钉图记录
     * @returns {Array} 历史记录数组
     */
    getHistory() {
        const history = store.get('history', [])
        // 补充活跃状态（对比当前运行的窗口）
        return history.map(item => ({
            ...item,
            isActive: this.pinWindows.has(item.pinId) // 实时判断是否活跃
        }))
    }

    /**
     * 从历史记录重新打开钉图窗口
     * @param {string} pinId 历史记录ID
     * @returns {string} 新的pinId（或原ID）
     */
    reopenFromHistory(pinId) {
        const history = store.get('history', [])
        const record = history.find(item => item.pinId === pinId)

        if (!record) {
            throw new Error('历史记录不存在')
        }

        // 将base64转回Buffer
        const buffer = Buffer.from(record.imageData.base64, 'base64')

        // 调用原有创建方法（自动同步历史记录）
        return this.createPinWindow({
            buffer,
            bounds: record.imageData.bounds,
            format: record.imageData.format
        })
    }

    /**
     * 删除单条历史记录
     * @param {string} pinId
     */
    deleteHistory(pinId) {
        // 先关闭对应的窗口（如果存在）
        this.closePinWindow(pinId)

        // 再删除本地存储的记录
        let history = store.get('history', [])
        history = history.filter(item => item.pinId !== pinId)
        store.set('history', history)
    }

    /**
     * 清空所有历史记录
     */
    clearHistory() {
        // 先关闭所有活跃窗口
        this.closeAllPinWindows()
        // 清空本地存储
        store.set('history', [])
    }

    /**
     * 标记历史记录的活跃状态
     * @param {string} pinId
     * @param {boolean} isActive
     */
    markHistoryActive(pinId, isActive) {
        let history = store.get('history', [])
        const index = history.findIndex(item => item.pinId === pinId)
        if (index !== -1) {
            history[index].isActive = isActive
            store.set('history', history)
        }
    }

    openPinWindow(pinId) {
        const item = this.pinWindows.get(pinId);
        if (item && !item.wnd.isDestroyed()) {
            item.wnd.show();
            return true;
        }
        return false;
    }

    /**
     * 窗口关闭时，同步更新历史记录状态
     * 重写原有 closePinWindow 方法
     */
    closePinWindow(pinId) {
        const item = this.pinWindows.get(pinId)
        if (item && !item.wnd.isDestroyed()) {
            item.wnd.close()
            this.pinWindows.delete(pinId)

            // 新增：标记为非活跃
            this.markHistoryActive(pinId, false)
        }
    }

    /**
     * 关闭所有钉图窗口
     */
    closeAllPinWindows() {
        Array.from(this.pinWindows.keys()).forEach(pinId => {
            this.closePinWindow(pinId)
        })
    }


    /**
     * 初始化时，将所有历史记录标记为非活跃
     */
    _updateAllHistoryInactive() {
        let history = store.get('history', [])
        history = history.map(item => ({ ...item, isActive: false }))
        store.set('history', history)
    }
}

export default new PinWndManager()