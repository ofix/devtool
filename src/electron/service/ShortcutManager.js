import { globalShortcut, BrowserWindow, ipcMain, Menu, MenuItem } from 'electron';
import Singleton from "./Singleton.js";

class ShortcutManager extends Singleton {
    constructor() {
        super();
        this.shortcuts = new Map() // 存储所有快捷键
        this.windowShortcuts = new Map() // 窗口特定的快捷键
        this.contexts = new Set(['global', 'app', 'window', 'editor', 'player'])
        this.isIPCInitialized = false; // 新增：标记IPC是否已初始化
    }

    init() {
        if (!this.isIPCInitialized) {
            this.setupIPC();
            this.isIPCInitialized = true;
        }
    }

    /**
     * 设置主进程和渲染进程通信
     */
    setupIPC() {
        // 渲染进程可以查询快捷键
        ipcMain.handle('shortcut:get-all', () => {
            return Array.from(this.shortcuts.entries()).map(([accelerator, config]) => ({
                accelerator,
                description: config.description,
                scope: config.scope,
                enabled: config.enabled
            }))
        })

        // 渲染进程可以注册快捷键
        ipcMain.handle('shortcut:register', (event, accelerator, description, scope = 'app') => {
            return this.registerAppShortcut(accelerator, () => {
                // 发送回渲染进程
                event.sender.send('shortcut-triggered', accelerator)
            }, {
                scope,
                description,
                windowId: event.sender.id
            })
        })

        // 渲染进程可以触发快捷键
        ipcMain.on('shortcut:trigger', (event, accelerator) => {
            const shortcut = this.shortcuts.get(accelerator)
            if (shortcut && shortcut.callback) {
                shortcut.callback()
            }
        })
    }

    /**
     * 注册应用快捷键
     */
    registerAppShortcut(accelerator, callback, options = {}) {
        const {
            global = false,
            scope = 'app',
            description = '',
            windowId = null,
            context = 'default',
            preventDefault = true
        } = options

        // 验证快捷键格式
        if (!this.validateAccelerator(accelerator)) {
            console.error(`无效的快捷键格式: ${accelerator}`)
            return false
        }

        // 检查是否已存在
        if (this.shortcuts.has(accelerator)) {
            console.warn(`快捷键已存在: ${accelerator}`)
            return false
        }

        // 创建快捷键配置
        const shortcutConfig = {
            accelerator,
            callback,
            description,
            scope,
            global,
            windowId,
            context,
            preventDefault,
            enabled: true,
            registeredAt: Date.now()
        }

        // 根据作用域注册
        let registered = false
        if (global) {
            registered = this.registerGlobalShortcut(accelerator, shortcutConfig)
        } else {
            switch (scope) {
                case 'menu':
                    registered = this.registerMenuShortcut(accelerator, shortcutConfig)
                    break
                case 'window':
                    registered = this.registerWindowShortcut(accelerator, shortcutConfig)
                    break
                case 'webContents':
                    registered = this.registerWebContentsShortcut(accelerator, shortcutConfig)
                    break
                default:
                    registered = this.registerBrowserShortcut(accelerator, shortcutConfig)
            }
        }

        if (registered) {
            this.shortcuts.set(accelerator, shortcutConfig)
            console.log(`快捷键注册成功 [${scope}]: ${accelerator} - ${description}`)
        }

        return registered
    }

    /**
     * 注册全局快捷键
     */
    registerGlobalShortcut(accelerator, config) {
        try {
            return globalShortcut.register(accelerator, () => {
                console.log(`全局快捷键: ${accelerator}`)
                config.callback()

                // 如果是全局快捷键，可以激活窗口
                if (config.windowId) {
                    const window = BrowserWindow.fromId(config.windowId)
                    if (window && !window.isDestroyed()) {
                        window.show()
                        window.focus()
                    }
                }
            })
        } catch (error) {
            console.error(`全局快捷键注册失败 ${accelerator}:`, error)
            return false
        }
    }

    /**
     * 注册菜单快捷键
     */
    registerMenuShortcut(accelerator, config) {
        try {
            // 添加到应用菜单
            const menu = Menu.getApplicationMenu()
            if (menu) {
                // 查找现有菜单项并添加快捷键
                this.addShortcutToMenu(menu, accelerator, config)
            }

            // 或者创建新的菜单项
            const menuItem = new MenuItem({
                label: config.description || '自定义操作',
                accelerator,
                click: config.callback,
                visible: true
            })

            // 添加到上下文菜单
            this.addToContextMenu(menuItem)

            return true
        } catch (error) {
            console.error(`菜单快捷键注册失败 ${accelerator}:`, error)
            return false
        }
    }

    /**
     * 注册窗口级快捷键
     */
    registerWindowShortcut(accelerator, config) {
        if (!config.windowId) {
            console.error('窗口快捷键需要指定 windowId')
            return false
        }

        const window = BrowserWindow.fromId(config.windowId)
        if (!window || window.isDestroyed()) {
            console.error(`窗口不存在: ${config.windowId}`)
            return false
        }

        // 监听窗口的键盘输入
        window.webContents.on('before-input-event', (event, input) => {
            if (!config.enabled) return

            const pressedAccelerator = this.inputToAccelerator(input)
            if (pressedAccelerator === accelerator) {
                if (config.preventDefault) {
                    event.preventDefault()
                }
                config.callback()
            }
        })

        return true
    }

    /**
     * 注册 WebContents 快捷键
     */
    registerWebContentsShortcut(accelerator, config) {
        if (!config.windowId) {
            console.error('WebContents 快捷键需要指定 windowId')
            return false
        }

        const window = BrowserWindow.fromId(config.windowId)
        if (!window || window.isDestroyed()) {
            console.error(`窗口不存在: ${config.windowId}`)
            return false
        }

        // 使用 webContents 的 before-input-event
        const handler = (event, input) => {
            if (!config.enabled) return

            const pressedAccelerator = this.inputToAccelerator(input)
            if (pressedAccelerator === accelerator) {
                if (config.preventDefault) {
                    event.preventDefault()
                }
                config.callback()
            }
        }

        window.webContents.on('before-input-event', handler)

        // 保存处理器以便后续移除
        config._handler = handler

        return true
    }

    /**
     * 注册浏览器通用快捷键
     */
    registerBrowserShortcut(accelerator, config) {
        // 通过 IPC 发送到渲染进程，由前端处理
        if (config.windowId) {
            const window = BrowserWindow.fromId(config.windowId)
            if (window && !window.isDestroyed()) {
                window.webContents.send('register-shortcut', {
                    accelerator,
                    description: config.description,
                    callbackId: Date.now() // 使用唯一ID
                })

                // 监听渲染进程的响应
                ipcMain.once(`shortcut-registered-${config.windowId}`, (event, result) => {
                    if (result.success) {
                        console.log(`浏览器快捷键注册成功: ${accelerator}`)
                    }
                })

                return true
            }
        }
        return false
    }

    /**
     * 添加快捷键到菜单
     */
    addShortcutToMenu(menu, accelerator, config) {
        // 递归遍历菜单
        const traverseMenu = (items) => {
            for (const item of items) {
                if (item.submenu) {
                    traverseMenu(item.submenu.items)
                }

                // 如果菜单项有对应的action，可以设置快捷键
                if (item.id && item.id === config.context) {
                    item.accelerator = accelerator
                    item.click = config.callback
                }
            }
        }

        traverseMenu(menu.items)
    }

    /**
     * 添加快捷键到上下文菜单
     */
    addToContextMenu(menuItem) {
        // 保存到全局上下文菜单
        if (!global.contextMenuItems) {
            global.contextMenuItems = []
        }
        global.contextMenuItems.push(menuItem)
    }

    /**
     * 将输入事件转换为快捷键字符串
     */
    inputToAccelerator(input) {
        const parts = []

        if (input.control) parts.push('Ctrl')
        if (input.meta) parts.push('Cmd')
        if (input.alt) parts.push('Alt')
        if (input.shift) parts.push('Shift')

        // 处理按键名称
        let key = input.key
        if (key.startsWith('Arrow')) {
            key = key.replace('Arrow', '')
        }

        // 特殊键处理
        const keyMap = {
            ' ': 'Space',
            'Escape': 'Esc',
            'Enter': 'Enter',
            'Backspace': 'Backspace',
            'Tab': 'Tab',
            'Delete': 'Delete',
            'Insert': 'Insert',
            'Home': 'Home',
            'End': 'End',
            'PageUp': 'PageUp',
            'PageDown': 'PageDown'
        }

        if (keyMap[key]) {
            key = keyMap[key]
        } else if (key.length === 1) {
            key = key.toUpperCase()
        }

        parts.push(key)
        return parts.join('+')
    }

    /**
     * 验证快捷键格式
     */
    validateAccelerator(accelerator) {
        if (!accelerator || typeof accelerator !== 'string') {
            return false
        }

        // 基本验证
        const parts = accelerator.split('+')
        if (parts.length === 0) return false

        // 检查按键是否有效
        const validKeys = new Set([
            // 字母数字
            ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(''),
            // 功能键
            ...'F1,F2,F3,F4,F5,F6,F7,F8,F9,F10,F11,F12,F13,F14,F15,F16,F17,F18,F19,F20,F21,F22,F23,F24'.split(','),
            // 特殊键
            'Space', 'Enter', 'Esc', 'Escape', 'Tab', 'Backspace', 'Delete',
            'Insert', 'Home', 'End', 'PageUp', 'PageDown',
            'Up', 'Down', 'Left', 'Right',
            'MediaPlayPause', 'MediaNextTrack', 'MediaPrevTrack', 'MediaStop'
        ])

        const lastKey = parts[parts.length - 1]
        if (!validKeys.has(lastKey)) {
            return false
        }

        return true
    }

    /**
     * 启用/禁用快捷键
     */
    setShortcutEnabled(accelerator, enabled) {
        const config = this.shortcuts.get(accelerator)
        if (config) {
            config.enabled = enabled

            if (config.global && config.type === 'global') {
                if (enabled) {
                    globalShortcut.register(accelerator, config.callback)
                } else {
                    globalShortcut.unregister(accelerator)
                }
            }

            return true
        }
        return false
    }

    /**
     * 注销快捷键
     */
    unregisterShortcut(accelerator) {
        const config = this.shortcuts.get(accelerator)
        if (config) {
            if (config.global) {
                globalShortcut.unregister(accelerator)
            }

            // 清理处理器
            if (config._handler) {
                const window = BrowserWindow.fromId(config.windowId)
                if (window && !window.isDestroyed()) {
                    window.webContents.removeListener('before-input-event', config._handler)
                }
            }

            this.shortcuts.delete(accelerator)
            return true
        }
        return false
    }

    /**
     * 获取所有快捷键
     */
    getAllShortcuts() {
        return Array.from(this.shortcuts.entries()).map(([accelerator, config]) => ({
            accelerator,
            description: config.description,
            scope: config.scope,
            global: config.global,
            enabled: config.enabled,
            context: config.context
        }))
    }

    /**
     * 清理所有快捷键
     */
    cleanup() {
        // 注销所有全局快捷键
        globalShortcut.unregisterAll()

        // 清理其他资源
        this.shortcuts.clear()
        this.windowShortcuts.clear()
    }
}


export default ShortcutManager;