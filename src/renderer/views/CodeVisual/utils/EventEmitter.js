// utils/EventEmitter.js
export class EventEmitter {
    constructor() {
        this.events = new Map();
    }

    on(event, callback) {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event).push(callback);
        return this;
    }

    off(event, callback) {
        if (!this.events.has(event)) return this;
        const callbacks = this.events.get(event);
        const index = callbacks.indexOf(callback);
        if (index !== -1) callbacks.splice(index, 1);
        return this;
    }

    emit(event, ...args) {
        if (!this.events.has(event)) return this;
        this.events.get(event).forEach(cb => cb(...args));
        return this;
    }

    once(event, callback) {
        const wrapper = (...args) => {
            callback(...args);
            this.off(event, wrapper);
        };
        this.on(event, wrapper);
        return this;
    }
}