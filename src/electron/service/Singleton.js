export default class Singleton {
    // 存储所有单例实例，仅 Singleton 类可访问
    static #instances = new Map();
    constructor(...args) {
        const cls = this.constructor;
        if (Singleton.#instances.has(cls)) {
            return Singleton.#instances.get(cls);
        }
        this._instanceId = Symbol(`Singleton_${cls.name}`);
        Singleton.#instances.set(cls, this);
        return this;
    }


    init(...args) {
        // 子类重写示例：init(name) { this.name = name; }
    }

    /**
     * 获取单例实例
     * @param  {...any} args - 传递给构造函数/init 方法的参数
     * @returns {Object} 类的单例实例
     */
    static getInstance(...args) {
        const cls = this;
        if (!Singleton.#instances.has(cls)) {
            // 首次调用：传参实例化
            const instance = new cls(...args);
            Singleton.#instances.set(cls, instance);
        }
        // 后续调用：直接返回已存在的实例（忽略参数）
        return Singleton.#instances.get(cls);
    }

    /**
     * 销毁当前类的单例实例
     */
    static destroy() {
        const cls = this;
        const instance = Singleton.#instances.get(cls);
        if (instance && instance.cleanup) {
            instance.cleanup();
        }
        Singleton.#instances.delete(cls);
    }
}