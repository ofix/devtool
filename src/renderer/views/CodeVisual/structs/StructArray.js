// structs/StructArray.js
import { StructContainer } from '../core/StructContainer.js';
import { Field } from '../fields/Field.js';

export class StructArray extends StructContainer {
    constructor(options = {}) {
        super(options);
        this.title = options.title || 'Array';
        this.layoutMode = options.layoutMode || 'vertical'; // 'vertical', 'horizontal'
        this.elementSize = options.elementSize || 40;
        this.maxElements = options.maxElements || 20;
        this.indexDisplay = options.indexDisplay !== undefined ? options.indexDisplay : true;
    }

    calculateLayout(ctx) {
        if (!this.dirty) return;
        
        const padding = this.padding;
        const elementCount = this.children.length;
        const elementSize = this.elementSize;
        
        if (this.layoutMode === 'horizontal') {
            // 水平排列
            const totalWidth = elementCount * elementSize + (elementCount - 1) * padding;
            this.width = totalWidth + padding * 2;
            this.height = elementSize + this.titleHeight + padding * 2;
            
            this.children.forEach((child, index) => {
                child.x = padding + index * (elementSize + padding);
                child.y = this.titleHeight + padding;
                child.width = elementSize;
                child.height = elementSize;
            });
        } else {
            // 垂直排列
            const totalHeight = elementCount * elementSize + (elementCount - 1) * padding;
            this.width = Math.max(this.width || 120, elementSize + padding * 2);
            this.height = totalHeight + this.titleHeight + padding * 2;
            
            this.children.forEach((child, index) => {
                child.x = padding;
                child.y = this.titleHeight + padding + index * (elementSize + padding);
                child.width = this.width - padding * 2;
                child.height = elementSize;
            });
        }
        
        this.dirty = false;
    }

    draw(ctx) {
        super.draw(ctx);
        
        // 绘制索引
        if (this.indexDisplay) {
            const rect = this.getBoundingRect();
            const padding = this.padding;
            
            ctx.fillStyle = '#6c757d';
            ctx.font = '10px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            
            this.children.forEach((child, index) => {
                const childRect = child.getBoundingRect();
                if (this.layoutMode === 'horizontal') {
                    ctx.fillText(`[${index}]`, childRect.x + childRect.width / 2, childRect.y - 2);
                } else {
                    ctx.fillText(`[${index}]`, childRect.x - 20, childRect.y + childRect.height / 2 + 4);
                }
            });
        }
    }

    // 添加元素
    push(element) {
        if (this.children.length >= this.maxElements) {
            throw new Error(`Array size exceeds maximum (${this.maxElements})`);
        }
        this.addChild(element);
        this.markDirty();
        return this;
    }

    // 弹出元素
    pop() {
        if (this.children.length === 0) return null;
        const element = this.children.pop();
        this.markDirty();
        return element;
    }

    // 插入元素到指定位置
    insert(index, element) {
        if (this.children.length >= this.maxElements) {
            throw new Error(`Array size exceeds maximum (${this.maxElements})`);
        }
        this.children.splice(index, 0, element);
        element.parent = this;
        this.markDirty();
        return this;
    }

    // 移除指定位置的元素
    remove(index) {
        if (index < 0 || index >= this.children.length) return null;
        const element = this.children.splice(index, 1)[0];
        element.parent = null;
        this.markDirty();
        return element;
    }
}