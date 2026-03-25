// src/electron/service/crawler/ProcessorRegistry.js
export default class ProcessorRegistry {
    constructor() {
        this.processors = {
            list: new Map(),
            page: new Map(),
            download: new Map(),
            login: new Map()
        };
    }
    
    register(type, model, processor) {
        if (!this.processors[type]) {
            throw new Error(`Unknown processor type: ${type}`);
        }
        this.processors[type].set(model, processor);
    }
    
    get(type, model) {
        const typeMap = this.processors[type];
        if (!typeMap) return null;
        return typeMap.get(model) || null;
    }
    
    getAll(type) {
        const typeMap = this.processors[type];
        if (!typeMap) return [];
        return Array.from(typeMap.entries());
    }
}
