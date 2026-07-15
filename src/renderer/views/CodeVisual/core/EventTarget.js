/**
 * 事件基类，支持事件冒泡
 */
class EventTarget {
    constructor(parent = null, children = []) {
        this.listeners = new Map();
        this.parent = parent;
        this.children = children;
    }

    addEventListener(type, listener, options = {}) {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, []);
        }
        this.listeners.get(type).push({
            listener,
            once: options.once || false,
            capture: options.capture || false
        });
    }

    removeEventListener(type, listener) {
        if (!this.listeners.has(type)) return;
        const listeners = this.listeners.get(type);
        const index = listeners.findIndex(l => l.listener === listener);
        if (index !== -1) {
            listeners.splice(index, 1);
        }
        if (listeners.length === 0) {
            this.listeners.delete(type);
        }
    }

    dispatchEvent(event) {
        if (!event.target) {
            event.target = this;
        }
        event.currentTarget = this;

        // 执行监听器
        const listeners = this.listeners.get(event.type);
        if (listeners) {
            const toExecute = [...listeners];
            for (const listenerObj of toExecute) {
                if (listenerObj.once) {
                    this.removeEventListener(event.type, listenerObj.listener);
                }
                listenerObj.listener.call(this, event);
            }
        }

        // 冒泡
        if (event.bubbles !== false && this.parent) {
            this.parent.dispatchEvent(event);
        }

        return !event.defaultPrevented;
    }

    fire(eventType, eventData = {}) {
        const event = new CustomEvent(eventType, {
            detail: eventData,
            bubbles: true,
            cancelable: true
        });
        event.target = this;
        this.dispatchEvent(event);
        return event;
    }

    on(type, handler) {
        this.addEventListener(type, handler);
        return this;
    }

    off(type, handler) {
        this.removeEventListener(type, handler);
        return this;
    }

    once(type, handler) {
        this.addEventListener(type, handler, { once: true });
        return this;
    }

    // 事件冒泡到父级
    emitToParent(eventType, eventData) {
        if (this.parent) {
            const event = new CustomEvent(eventType, {
                detail: eventData,
                bubbles: true,
                cancelable: true
            });
            event.target = this;
            this.parent.dispatchEvent(event);
        }
    }
}

export default EventTarget;