// structs/StructMap.js
import { StructHierarchy } from '../core/StructHierarchy.js';

export class StructMap extends StructHierarchy {
    constructor(options = {}) {
        super(options);
        this.title = options.title || 'Map';
        this.entries = options.entries || [];
        this.connectionColor = options.connectionColor || '#fd7e14';
        this.keyColor = options.keyColor || '#0d6efd';
        this.valueColor = options.valueColor || '#198754';
    }

    // 构建映射
    buildMap(entries) {
        this.entries = entries;
        this.children = [];
        
        entries.forEach(([key, value]) => {
            const container = new StructContainer({
                title: `${String(key)} → ${String(value)}`,
                width: this.nodeWidth * 0.9,
                height: this.nodeHeight * 0.9,
                backgroundColor: '#fff3e0',
                borderColor: '#fd7e14'
            });
            
            // 添加键值对字段
            container.addField({
                name: `Key: ${String(key)}`,
                type: typeof key,
                value: key,
                visible: true
            });
            container.addField({
                name: `Value: ${String(value)}`,
                type: typeof value,
                value: value,
                visible: true
            });
            
            this.addChild(container);
        });
        
        this.markDirty();
        return this;
    }

    // 设置键值对
    set(key, value) {
        const existingIndex = this.entries.findIndex(([k]) => k === key);
        if (existingIndex !== -1) {
            this.entries[existingIndex] = [key, value];
        } else {
            this.entries.push([key, value]);
        }
        this.buildMap(this.entries);
        return this;
    }

    // 获取值
    get(key) {
        const entry = this.entries.find(([k]) => k === key);
        return entry ? entry[1] : undefined;
    }

    // 删除键值对
    delete(key) {
        const index = this.entries.findIndex(([k]) => k === key);
        if (index !== -1) {
            this.entries.splice(index, 1);
            this.buildMap(this.entries);
            return true;
        }
        return false;
    }

    // 检查是否包含键
    has(key) {
        return this.entries.some(([k]) => k === key);
    }

    // 获取所有键
    keys() {
        return this.entries.map(([k]) => k);
    }

    // 获取所有值
    values() {
        return this.entries.map(([, v]) => v);
    }

    // 获取所有条目
    entries() {
        return this.entries;
    }
}