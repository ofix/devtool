
// structs/StructSet.js
import { StructHierarchy } from '../core/StructHierarchy.js';

export class StructSet extends StructHierarchy {
    constructor(options = {}) {
        super(options);
        this.title = options.title || 'Set';
        this.elements = options.elements || [];
        this.useTree = options.useTree !== undefined ? options.useTree : true;
        this.connectionColor = options.connectionColor || '#6f42c1';
    }

    // 构建集合
    buildSet(elements) {
        this.elements = [...new Set(elements)];
        
        if (this.useTree) {
            // 使用树结构存储集合
            this.root = new StructContainer({
                title: 'Set',
                width: this.nodeWidth,
                height: this.nodeHeight,
                backgroundColor: '#f3e8ff',
                borderColor: '#6f42c1'
            });
            this.children = [this.root];
            
            // 构建树
            this.elements.forEach(element => {
                const node = new StructContainer({
                    title: String(element),
                    width: this.nodeWidth * 0.7,
                    height: this.nodeHeight * 0.7,
                    backgroundColor: '#f8f9fa',
                    borderColor: '#6f42c1'
                });
                this.root.addChild(node);
            });
        } else {
            // 使用数组形式展示
            this.children = this.elements.map(element => {
                return new StructContainer({
                    title: String(element),
                    width: this.nodeWidth * 0.7,
                    height: this.nodeHeight * 0.7,
                    backgroundColor: '#f8f9fa',
                    borderColor: '#6f42c1'
                });
            });
        }
        
        this.markDirty();
        return this;
    }

    // 添加元素
    add(element) {
        if (!this.elements.includes(element)) {
            this.elements.push(element);
            this.buildSet(this.elements);
        }
        return this;
    }

    // 删除元素
    delete(element) {
        const index = this.elements.indexOf(element);
        if (index !== -1) {
            this.elements.splice(index, 1);
            this.buildSet(this.elements);
        }
        return this;
    }

    // 检查是否包含元素
    has(element) {
        return this.elements.includes(element);
    }

    // 获取大小
    size() {
        return this.elements.length;
    }

    // 并集
    union(otherSet) {
        const result = new Set(this.elements);
        otherSet.elements.forEach(e => result.add(e));
        return new StructSet({
            elements: Array.from(result),
            useTree: this.useTree
        });
    }

    // 交集
    intersection(otherSet) {
        const result = this.elements.filter(e => otherSet.elements.includes(e));
        return new StructSet({
            elements: result,
            useTree: this.useTree
        });
    }

    // 差集
    difference(otherSet) {
        const result = this.elements.filter(e => !otherSet.elements.includes(e));
        return new StructSet({
            elements: result,
            useTree: this.useTree
        });
    }
}
