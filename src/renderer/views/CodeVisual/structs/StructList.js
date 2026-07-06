
// structs/StructList.js
import { StructLinear } from '../core/StructLinear.js';

export class StructList extends StructLinear {
    constructor(options = {}) {
        super(options);
        this.title = options.title || 'Singly Linked List';
        this.bidirectional = false;
        this.arrowDirection = options.arrowDirection || 'right';
    }

    // 添加节点
    append(node) {
        this.addChild(node);
        this.markDirty();
        return this;
    }

    // 插入节点
    insertAfter(targetNode, newNode) {
        const index = this.children.indexOf(targetNode);
        if (index === -1) throw new Error('Target node not found');
        this.children.splice(index + 1, 0, newNode);
        newNode.parent = this;
        this.markDirty();
        return this;
    }

    // 删除节点
    removeNode(node) {
        const index = this.children.indexOf(node);
        if (index === -1) return null;
        const removed = this.children.splice(index, 1)[0];
        removed.parent = null;
        this.markDirty();
        return removed;
    }

    // 查找节点
    findNode(predicate) {
        return this.children.find(predicate) || null;
    }

    // 反转链表
    reverse() {
        this.children.reverse();
        this.markDirty();
        return this;
    }
}