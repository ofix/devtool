class LogManager {
    constructor() {
        this.logs = [];
        // 存储回调函数：{ init: 初始化回调, add: 增量更新回调 }
        this.callbacks = {
            init: null,
            add: null
        };
        // 单例模式
        if (LogManager.instance) {
            return LogManager.instance;
        }
        LogManager.instance = this;
    }

    /**
     * 注册回调函数
     * @param {Function} initCb - 初始化回调（接收全量日志）
     * @param {Function} addCb - 增量更新回调（接收单条新日志）
     */
    registerCallbacks(initCb, addCb) {
        this.callbacks.init = initCb;
        this.callbacks.add = addCb;
        // 初始化：立即触发全量同步
        if (initCb) {
            initCb([...this.logs]);
        }
    }

    /**
     * 移除回调函数
     */
    unregisterCallbacks() {
        this.callbacks.init = null;
        this.callbacks.add = null;
    }

    /**
     * 日志核心方法
     * @param  {...any} args - 任意参数
     */
    log(...args) {
        const logItem = {
            params: args,
            timestamp: new Date()
        };
        this.logs.push(logItem);
        // 最多保留1000条日志，防止内存溢出
        if (this.logs.length > 1000) {
            this.logs.shift();
        }
        // 增量更新：只传递新增的单条日志
        if (this.callbacks.add) {
            this.callbacks.add(logItem);
        }
    }

    /**
     * 清空所有日志（可选扩展方法）
     */
    clear() {
        this.logs = [];
        // 清空后触发全量同步
        if (this.callbacks.init) {
            this.callbacks.init([]);
        }
    }
}

// 初始化并挂载到window
const logManager = new LogManager();
window.wnd = window.wnd || {};
window.wnd.log = (...args) => logManager.log(...args);
// 暴露清空方法（可选）
window.wnd.clearLog = () => logManager.clear();

// 导出实例，供组件使用
export default logManager;