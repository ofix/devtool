// structs/StructBlackRedTree.js
import { StructBST } from './StructBST.js';

export class StructBlackRedTree extends StructBST {
    constructor(options = {}) {
        super(options);
        this.title = options.title || 'Red-Black Tree';
        this.connectionColor = options.connectionColor || '#dc3545';
        this.redColor = options.redColor || '#dc3545';
        this.blackColor = options.blackColor || '#343a40';
        this.nodeTheme = {
            backgroundColor: '#f8d7da',
            borderColor: '#dc3545',
            textColor: '#dc3545'
        };
        this.isBalanced = true;
    }

    // 创建红黑树节点
    createRBNode(value, color = 'red') {
        const node = super._createNode(value);
        node.color = color;
        node.theme.backgroundColor = color === 'red' ? this.redColor + '20' : this.blackColor + '20';
        node.theme.borderColor = color === 'red' ? this.redColor : this.blackColor;
        node.theme.textColor = color === 'red' ? this.redColor : this.blackColor;
        node.title = `${value}`;
        return node;
    }

    // 插入节点（带红黑树平衡）
    insert(value) {
        if (!this.root) {
            this.root = this.createRBNode(value, 'black');
            this.children = [this.root];
        } else {
            const newNode = this._insertRBNode(this.root, value);
            // 修复红黑树性质
            this._fixInsert(newNode);
        }
        this.markDirty();
        return this;
    }

    _insertRBNode(node, value) {
        if (value < parseInt(node.title)) {
            if (!node.children || node.children.length === 0) {
                const newNode = this.createRBNode(value, 'red');
                node.addChild(newNode);
                return newNode;
            } else {
                const leftChild = node.children.find(c => parseInt(c.title) < parseInt(node.title));
                if (leftChild) {
                    return this._insertRBNode(leftChild, value);
                } else {
                    const newNode = this.createRBNode(value, 'red');
                    node.addChild(newNode);
                    return newNode;
                }
            }
        } else if (value > parseInt(node.title)) {
            if (!node.children || node.children.length === 0) {
                const newNode = this.createRBNode(value, 'red');
                node.addChild(newNode);
                return newNode;
            } else {
                const rightChild = node.children.find(c => parseInt(c.title) > parseInt(node.title));
                if (rightChild) {
                    return this._insertRBNode(rightChild, value);
                } else {
                    const newNode = this.createRBNode(value, 'red');
                    node.addChild(newNode);
                    return newNode;
                }
            }
        }
        return null;
    }

    _fixInsert(node) {
        if (!node || node === this.root) {
            node.color = 'black';
            this._updateNodeColor(node);
            return;
        }
        
        const parent = this._findParent(node);
        if (!parent) return;
        
        if (parent.color === 'black') return;
        
        const grandparent = this._findParent(parent);
        if (!grandparent) {
            parent.color = 'black';
            this._updateNodeColor(parent);
            return;
        }
        
        const uncle = this._findUncle(node);
        
        if (uncle && uncle.color === 'red') {
            // Case 1: 叔叔是红色
            parent.color = 'black';
            uncle.color = 'black';
            grandparent.color = 'red';
            this._updateNodeColor(parent);
            this._updateNodeColor(uncle);
            this._updateNodeColor(grandparent);
            this._fixInsert(grandparent);
        } else {
            // Case 2 & 3: 叔叔是黑色
            if (this._isLeftChild(node) && this._isRightChild(parent)) {
                // Left-Right case
                this._rotateLeft(parent);
                this._fixInsert(parent);
            } else if (this._isRightChild(node) && this._isLeftChild(parent)) {
                // Right-Left case
                this._rotateRight(parent);
                this._fixInsert(parent);
            } else {
                // Left-Left or Right-Right case
                if (this._isLeftChild(node)) {
                    this._rotateRight(grandparent);
                } else {
                    this._rotateLeft(grandparent);
                }
                parent.color = 'black';
                grandparent.color = 'red';
                this._updateNodeColor(parent);
                this._updateNodeColor(grandparent);
            }
        }
    }

    _updateNodeColor(node) {
        if (!node) return;
        node.theme.backgroundColor = node.color === 'red' ? this.redColor + '20' : this.blackColor + '20';
        node.theme.borderColor = node.color === 'red' ? this.redColor : this.blackColor;
        node.theme.textColor = node.color === 'red' ? this.redColor : this.blackColor;
    }

    _findParent(node) {
        if (!this.root || node === this.root) return null;
        return this._searchParent(this.root, node);
    }

    _searchParent(current, target) {
        if (!current.children) return null;
        for (const child of current.children) {
            if (child === target) return current;
            const result = this._searchParent(child, target);
            if (result) return result;
        }
        return null;
    }

    _findUncle(node) {
        const parent = this._findParent(node);
        if (!parent) return null;
        const grandparent = this._findParent(parent);
        if (!grandparent) return null;
        
        if (grandparent.children && grandparent.children.length === 2) {
            const sibling = grandparent.children.find(c => c !== parent);
            return sibling || null;
        }
        return null;
    }

    _isLeftChild(node) {
        const parent = this._findParent(node);
        if (!parent || !parent.children) return false;
        return parent.children.indexOf(node) === 0;
    }

    _isRightChild(node) {
        const parent = this._findParent(node);
        if (!parent || !parent.children) return false;
        return parent.children.indexOf(node) === parent.children.length - 1;
    }

    _rotateLeft(node) {
        if (!node.children || node.children.length < 2) return;
        const rightChild = node.children[node.children.length - 1];
        if (!rightChild) return;
        
        const parent = this._findParent(node);
        const index = parent ? parent.children.indexOf(node) : -1;
        
        // 移除rightChild
        node.children.pop();
        
        // 将rightChild的左子节点移到node的右子节点
        if (rightChild.children && rightChild.children.length > 0) {
            const leftGrandchild = rightChild.children[0];
            node.addChild(leftGrandchild);
        }
        
        // 将node作为rightChild的左子节点
        rightChild.children = [node];
        if (parent) {
            parent.children.splice(index, 1, rightChild);
            rightChild.parent = parent;
        } else {
            this.root = rightChild;
            this.children = [this.root];
        }
        node.parent = rightChild;
        
        this.markDirty();
    }

    _rotateRight(node) {
        if (!node.children || node.children.length < 2) return;
        const leftChild = node.children[0];
        if (!leftChild) return;
        
        const parent = this._findParent(node);
        const index = parent ? parent.children.indexOf(node) : -1;
        
        // 移除leftChild
        node.children.shift();
        
        // 将leftChild的右子节点移到node的左子节点
        if (leftChild.children && leftChild.children.length > 0) {
            const rightGrandchild = leftChild.children[leftChild.children.length - 1];
            node.children.unshift(rightGrandchild);
        }
        
        // 将node作为leftChild的右子节点
        leftChild.children = [node];
        if (parent) {
            parent.children.splice(index, 1, leftChild);
            leftChild.parent = parent;
        } else {
            this.root = leftChild;
            this.children = [this.root];
        }
        node.parent = leftChild;
        
        this.markDirty();
    }

    // 构建红黑树
    buildRBTree(values) {
        this.root = null;
        this.children = [];
        values.forEach(value => this.insert(value));
        return this;
    }
}