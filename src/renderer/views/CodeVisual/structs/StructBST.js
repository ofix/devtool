// structs/StructBST.js
import { StructHierarchy } from '../core/StructHierarchy.js';

export class StructBST extends StructHierarchy {
    constructor(options = {}) {
        super(options);
        this.title = options.title || 'Binary Search Tree';
        this.connectionColor = options.connectionColor || '#0d6efd';
        this.nodeTheme = {
            backgroundColor: '#e7f3ff',
            borderColor: '#0d6efd',
            textColor: '#0d6efd'
        };
        this.isBalanced = options.isBalanced || false;
    }

    // 插入节点
    insert(value) {
        if (!this.root) {
            this.root = this._createNode(value);
            this.children = [this.root];
        } else {
            this._insertNode(this.root, value);
        }
        this.markDirty();
        return this;
    }

    _createNode(value) {
        return new StructContainer({
            title: String(value),
            width: this.nodeWidth * 0.7,
            height: this.nodeHeight * 0.7,
            backgroundColor: this.nodeTheme.backgroundColor,
            borderColor: this.nodeTheme.borderColor
        });
    }

    _insertNode(node, value) {
        if (value < parseInt(node.title)) {
            if (!node.children || node.children.length === 0) {
                node.addChild(this._createNode(value));
            } else {
                // 找到左子节点
                const leftChild = node.children.find(c => parseInt(c.title) < parseInt(node.title));
                if (leftChild) {
                    this._insertNode(leftChild, value);
                } else {
                    node.addChild(this._createNode(value));
                }
            }
        } else if (value > parseInt(node.title)) {
            if (!node.children || node.children.length === 0) {
                node.addChild(this._createNode(value));
            } else {
                const rightChild = node.children.find(c => parseInt(c.title) > parseInt(node.title));
                if (rightChild) {
                    this._insertNode(rightChild, value);
                } else {
                    node.addChild(this._createNode(value));
                }
            }
        }
    }

    // 构建BST
    buildBST(values) {
        this.children = [];
        this.root = null;
        values.forEach(value => this.insert(value));
        this.markDirty();
        return this;
    }

    // 搜索值
    search(value) {
        if (!this.root) return null;
        return this._searchNode(this.root, value);
    }

    _searchNode(node, value) {
        if (!node) return null;
        const nodeValue = parseInt(node.title);
        if (value === nodeValue) return node;
        if (value < nodeValue) {
            const leftChild = node.children ? node.children.find(c => parseInt(c.title) < nodeValue) : null;
            return this._searchNode(leftChild, value);
        } else {
            const rightChild = node.children ? node.children.find(c => parseInt(c.title) > nodeValue) : null;
            return this._searchNode(rightChild, value);
        }
    }

    // 获取最小节点
    getMin() {
        if (!this.root) return null;
        let node = this.root;
        let leftChild;
        while ((leftChild = node.children ? node.children.find(c => parseInt(c.title) < parseInt(node.title)) : null)) {
            node = leftChild;
        }
        return node;
    }

    // 获取最大节点
    getMax() {
        if (!this.root) return null;
        let node = this.root;
        let rightChild;
        while ((rightChild = node.children ? node.children.find(c => parseInt(c.title) > parseInt(node.title)) : null)) {
            node = rightChild;
        }
        return node;
    }
}
