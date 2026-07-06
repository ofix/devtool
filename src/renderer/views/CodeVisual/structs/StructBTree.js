// structs/StructBTree.js
import { StructHierarchy } from '../core/StructHierarchy.js';

export class StructBTree extends StructHierarchy {
    constructor(options = {}) {
        super(options);
        this.title = options.title || 'B-Tree';
        this.order = options.order || 3; // B树阶数
        this.connectionColor = options.connectionColor || '#e83e8c';
        this.nodeTheme = {
            backgroundColor: '#fce4ec',
            borderColor: '#e83e8c',
            textColor: '#e83e8c'
        };
        this.nodeSpacing = options.nodeSpacing || 40;
        this.levelSpacing = options.levelSpacing || 70;
    }

    // 创建B树节点
    createBTreeNode(keys = []) {
        const node = new StructContainer({
            title: `[${keys.join(', ')}]`,
            width: Math.max(80, keys.length * 30 + 20),
            height: 45,
            backgroundColor: this.nodeTheme.backgroundColor,
            borderColor: this.nodeTheme.borderColor
        });
        node.keys = keys;
        node.isLeaf = true;
        node.children = [];
        return node;
    }

    // 插入键
    insert(key) {
        if (!this.root) {
            this.root = this.createBTreeNode([key]);
            this.children = [this.root];
            this.markDirty();
            return this;
        }
        
        const result = this._insertKey(this.root, key);
        if (result) {
            // 根节点分裂
            const newRoot = this.createBTreeNode([result.midKey]);
            newRoot.addChild(result.left);
            newRoot.addChild(result.right);
            newRoot.isLeaf = false;
            this.root = newRoot;
            this.children = [this.root];
        }
        this.markDirty();
        return this;
    }

    _insertKey(node, key) {
        if (node.isLeaf) {
            // 插入到叶子节点
            node.keys.push(key);
            node.keys.sort((a, b) => a - b);
            node.title = `[${node.keys.join(', ')}]`;
            
            // 检查是否需要分裂
            if (node.keys.length > this.order - 1) {
                return this._splitNode(node);
            }
            return null;
        } else {
            // 找到合适的子节点
            const index = node.keys.findIndex(k => key < k);
            const childIndex = index === -1 ? node.children.length - 1 : index;
            const child = node.children[childIndex];
            const result = this._insertKey(child, key);
            
            if (result) {
                // 子节点分裂后，将中间键提升到当前节点
                node.keys.push(result.midKey);
                node.keys.sort((a, b) => a - b);
                const insertIndex = node.keys.indexOf(result.midKey);
                node.children.splice(insertIndex, 1, result.left, result.right);
                node.title = `[${node.keys.join(', ')}]`;
                
                if (node.keys.length > this.order - 1) {
                    return this._splitNode(node);
                }
            }
            return null;
        }
    }

    _splitNode(node) {
        const midIndex = Math.floor(node.keys.length / 2);
        const midKey = node.keys[midIndex];
        
        const leftKeys = node.keys.slice(0, midIndex);
        const rightKeys = node.keys.slice(midIndex + 1);
        
        const leftNode = this.createBTreeNode(leftKeys);
        const rightNode = this.createBTreeNode(rightKeys);
        
        if (!node.isLeaf) {
            const midChildIndex = midIndex + 1;
            leftNode.children = node.children.slice(0, midChildIndex);
            rightNode.children = node.children.slice(midChildIndex);
            leftNode.isLeaf = false;
            rightNode.isLeaf = false;
        }
        
        return {
            midKey: midKey,
            left: leftNode,
            right: rightNode
        };
    }

    // 搜索键
    search(key) {
        if (!this.root) return null;
        return this._searchKey(this.root, key);
    }

    _searchKey(node, key) {
        if (node.keys.includes(key)) {
            return node;
        }
        if (node.isLeaf) return null;
        
        const index = node.keys.findIndex(k => key < k);
        const childIndex = index === -1 ? node.children.length - 1 : index;
        return this._searchKey(node.children[childIndex], key);
    }

    // 构建B树
    buildBTree(keys) {
        this.root = null;
        this.children = [];
        keys.forEach(key => this.insert(key));
        return this;
    }
}