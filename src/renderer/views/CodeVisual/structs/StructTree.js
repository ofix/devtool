
// structs/StructTree.js
import { StructHierarchy } from '../core/StructHierarchy.js';

export class StructTree extends StructHierarchy {
    constructor(options = {}) {
        super(options);
        this.title = options.title || 'Tree';
        this.maxDepth = options.maxDepth || 4;
        this.nodeTheme = {
            backgroundColor: '#e3f2fd',
            borderColor: '#0d47a1',
            textColor: '#0d47a1'
        };
    }

    // 创建一个树节点
    createNode(data) {
        const node = new StructContainer({
            title: data.title || 'Node',
            width: this.nodeWidth,
            height: this.nodeHeight,
            backgroundColor: this.nodeTheme.backgroundColor,
            borderColor: this.nodeTheme.borderColor
        });
        
        if (data.fields) {
            node.addFields(data.fields);
        }
        
        return node;
    }

    // 构建树
    buildTree(data) {
        this.root = this.createNode(data.root);
        this.children = [this.root];
        this._buildTreeRecursive(this.root, data.children || []);
        this.markDirty();
        return this;
    }

    _buildTreeRecursive(parent, childrenData) {
        childrenData.forEach(childData => {
            const child = this.createNode(childData);
            parent.addChild(child);
            if (childData.children) {
                this._buildTreeRecursive(child, childData.children);
            }
        });
    }

    // 获取所有叶子节点
    getLeafNodes() {
        const leaves = [];
        this._collectLeaves(this.root, leaves);
        return leaves;
    }

    _collectLeaves(node, leaves) {
        if (!node.children || node.children.length === 0) {
            leaves.push(node);
        } else {
            node.children.forEach(child => this._collectLeaves(child, leaves));
        }
    }

    // 树的遍历
    traverse(order = 'preorder', callback) {
        this._traverseNode(this.root, order, callback);
    }

    _traverseNode(node, order, callback) {
        if (!node) return;
        
        if (order === 'preorder') callback(node);
        
        if (node.children) {
            node.children.forEach(child => this._traverseNode(child, order, callback));
        }
        
        if (order === 'postorder') callback(node);
    }
}