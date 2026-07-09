class EventTarget {
    constructor() {
      this._listeners = new Map();
      this._parent = null;
      this._children = [];
    }
  
    addEventListener(type, listener, options = {}) {
      if (!this._listeners.has(type)) {
        this._listeners.set(type, []);
      }
      this._listeners.get(type).push({
        listener,
        once: options.once || false,
        capture: options.capture || false
      });
    }
  
    removeEventListener(type, listener) {
      if (!this._listeners.has(type)) return;
      const listeners = this._listeners.get(type);
      const index = listeners.findIndex(l => l.listener === listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
      if (listeners.length === 0) {
        this._listeners.delete(type);
      }
    }
  
    dispatchEvent(event) {
      if (!event.target) {
        event.target = this;
      }
      event.currentTarget = this;
  
      // 执行监听器
      const listeners = this._listeners.get(event.type);
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
      if (event.bubbles !== false && this._parent) {
        this._parent.dispatchEvent(event);
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
      if (this._parent) {
        const event = new CustomEvent(eventType, {
          detail: eventData,
          bubbles: true,
          cancelable: true
        });
        event.target = this;
        this._parent.dispatchEvent(event);
      }
    }
  }
  
  export default EventTarget;