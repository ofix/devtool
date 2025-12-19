import { globalShortcut, BrowserWindow, ipcMain } from 'electron'

class ShortcutService {
  // 私有静态实例
  static #instance = null
  
  // 私有字段
  #mainWindow = null
  #shortcuts = new Map()
  #shortcutConfigs = new Map()
  #isInitialized = false

  // 默认快捷键配置
  #defaultConfigs = [
    {
      id: 'find',
      accelerator: 'CommandOrControl+F',
      description: '查找',
      enabled: true,
      global: true
    },
    {
      id: 'save',
      accelerator: 'CommandOrControl+S',
      description: '保存',
      enabled: true,
      global: true
    },
    {
      id: 'reload',
      accelerator: 'CommandOrControl+R',
      description: '重新加载',
      enabled: true,
      global: false
    }
  ]

  constructor() {
    if (ShortcutService.#instance) {
      return ShortcutService.#instance
    }
    ShortcutService.#instance = this
    this.#loadDefaultConfigs()
  }

  static get instance() {
    if (!ShortcutService.#instance) {
      ShortcutService.#instance = new ShortcutService()
    }
    return ShortcutService.#instance
  }

  #loadDefaultConfigs() {
    this.#defaultConfigs.forEach(config => {
      this.#shortcutConfigs.set(config.id, config)
    })
  }

  initialize(mainWindow) {
    if (this.#isInitialized) {
      console.warn('ShortcutService 已经初始化过了')
      return
    }

    this.#mainWindow = mainWindow
    this.#registerAllShortcuts()
    this.#setupIpcHandlers()
    this.#isInitialized = true
    
    console.log('🚀 ShortcutService 初始化完成')
  }

  #registerAllShortcuts() {
    for (const config of this.#shortcutConfigs.values()) {
      if (config.enabled && config.global) {
        this.#registerShortcut(config)
      }
    }
  }

  #registerShortcut(config) {
    const handler = this.#getHandlerForConfig(config)
    if (handler) {
      this.register(config.accelerator, handler)
    }
  }

  #getHandlerForConfig(config) {
    switch (config.id) {
      case 'find':
        return () => this.#sendToRenderer('show-find-replace')
      case 'save':
        return () => this.#sendToRenderer('save-document')
      case 'reload':
        return () => this.#reloadWindow()
      default:
        return () => this.#sendToRenderer('shortcut-triggered', config.id)
    }
  }

  #reloadWindow() {
    if (this.#mainWindow?.webContents) {
      this.#mainWindow.webContents.reload()
    }
  }

  #setupIpcHandlers() {
    // 注册快捷键
    ipcMain.handle('shortcut:register', (event, accelerator, handlerName) => {
      return this.register(accelerator, () => {
        this.#sendToRenderer(`shortcut:${handlerName}`)
      })
    })

    // 注销快捷键
    ipcMain.handle('shortcut:unregister', (event, accelerator) => {
      this.unregister(accelerator)
    })

    // 获取所有快捷键
    ipcMain.handle('shortcut:getAll', () => {
      return this.allShortcuts
    })

    // 检查快捷键是否注册
    ipcMain.handle('shortcut:isRegistered', (event, accelerator) => {
      return this.isRegistered(accelerator)
    })
  }

  register(accelerator, callback) {
    // 清理之前的快捷键
    this.unregister(accelerator)

    const ret = globalShortcut.register(accelerator, callback)
    
    if (ret) {
      this.#shortcuts.set(accelerator, {
        callback,
        registeredAt: Date.now()
      })
      console.log(`✅ 快捷键注册成功: ${accelerator}`)
    } else {
      console.error(`❌ 快捷键注册失败: ${accelerator}`)
    }
    
    return ret
  }

  unregister(accelerator) {
    if (this.#shortcuts.has(accelerator)) {
      globalShortcut.unregister(accelerator)
      this.#shortcuts.delete(accelerator)
      console.log(`🗑️ 快捷键已注销: ${accelerator}`)
    }
  }

  unregisterAll() {
    globalShortcut.unregisterAll()
    this.#shortcuts.clear()
    console.log('🗑️ 所有快捷键已注销')
  }

  isRegistered(accelerator) {
    return this.#shortcuts.has(accelerator)
  }

  get allShortcuts() {
    return Array.from(this.#shortcuts.keys())
  }

  getShortcutInfo(accelerator) {
    const shortcut = this.#shortcuts.get(accelerator)
    if (!shortcut) return null
    
    return {
      accelerator,
      registeredAt: new Date(shortcut.registeredAt).toISOString(),
      isGlobal: true
    }
  }

  #sendToRenderer(channel, ...args) {
    if (this.#mainWindow?.webContents && !this.#mainWindow.isDestroyed()) {
      this.#mainWindow.webContents.send(channel, ...args)
    } else {
      console.warn(`⚠️ 无法发送消息到渲染进程: ${channel}`, args)
    }
  }

  dispose() {
    this.unregisterAll()
    this.#mainWindow = null
    this.#isInitialized = false
  }
}

// 导出单例实例
export const shortcutService = ShortcutService.instance
export default shortcutService