// structs/StructBPlusTree.js
import { StructBTree } from './StructBTree.js';

export class StructBPlusTree extends StructBTree {
    constructor(options = {}) {
        super(options);
        this.title = options.title || 'B+ Tree';
        this.connectionColor = options.connectionColor || '#20c997';
        this.nodeTheme = {
            backgroundColor: '#d1f7e6',
            borderColor: '#20c997',
            textColor: '#20c997'
        };
        this.leafNodeColor = options.leafNodeColor || '#198754';
        this.leafLinkColor = options.leafLinkColor || '#20c997';
        this.leafList = [];
    }

    _splitNode(node) {
        const result = super._splitNode(node);
        
        // 如果是叶子节点分裂，需要维护叶子链表
        if (node.isLeaf) {
            // 更新叶子链表
            const leftNode = result.left;
            const rightNode = result.right;
            
            // 在叶子链表中插入右节点
            const index = this.leafList.indexOf(node);
            if (index !== -1) {
                this.leafList.splice(index, 1, leftNode, rightNode);
                // 设置链表指针
                if (index > 0) {
                    this.leafList[index - 1].nextLeaf = leftNode;
                }
                leftNode.nextLeaf = rightNode;
                rightNode.nextLeaf = index + 1 < this.leafList.length ? this.leafList[index + 1] : null;
            }
        }
        
        return result;
    }

    // 插入键
    insert(key) {
        if (!this.root) {
            this.root = this.createBTreeNode([key]);
            this.children = [this.root];
            this.leafList = [this.root];
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

    // 搜索键（返回实际的值节点）
    search(key) {
        if (!this.root) return null;
        let node = this.root;
        while (!node.isLeaf) {
            const index = node.keys.findIndex(k => key <= k);
            const childIndex = index === -1 ? node.children.length - 1 : index;
            node = node.children[childIndex];
        }
        return node.keys.includes(key) ? node : null;
    }

    // 范围查询
    rangeSearch(start, end) {
        if (!this.root) return [];
        const results = [];
        let leaf = this.leafList[0];
        
        // 找到起始叶子节点
        while (leaf) {
            if (leaf.keys.some(k => k >= start && k <= end)) {
                break;
            }
            leaf = leaf.nextLeaf;
        }
        
        // 收集范围内的键
        while (leaf) {
            leaf.keys.forEach(key => {
                if (key >= start && key <= end) {
                    results.push(key);
                }
            });
            if (leaf.keys[leaf.keys.length - 1] > end) break;
            leaf = leaf.nextLeaf;
        }
        
        return results;
    }

    // 构建B+树
    buildBPlusTree(keys) {
        this.root = null;
        this.children = [];
        this.leafList = [];
        keys.forEach(key => this.insert(key));
        return this;
    }
}