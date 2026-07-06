// core/StructHierarchy.js
import { StructContainer } from './StructContainer.js';

export class StructHierarchy extends StructContainer {
    constructor(options = {}) {
        super(options);
        this.title = options.title || 'Tree';
        this.maxDepth = options.maxDepth || 4;
        this.nodeSpacing = options.nodeSpacing || 30;
        this.levelSpacing = options.levelSpacing || 60;
        this.nodeWidth = options.nodeWidth || 100;
        this.nodeHeight = options.nodeHeight || 50;
        this.root = options.root || null;
        this.connectionColor = options.connectionColor || '#4a90d9';
        this.nodeTheme = options.nodeTheme || {
            backgroundColor: '#f8f9fa',
            borderColor: '#4a90d9',
            textColor: '#212529'
        };
    }

    calculateLayout(ctx) {
        if (!this.dirty) return;
        
        if (!this.root) {
            // 创建默认根节点
            this.root = new StructContainer({
                title: 'Root',
                width: this.nodeWidth,
                height: this.nodeHeight
            });
            this.addChild(this.root);
        }
        
        // 计算树的布局
        this._calculateTreeLayout(ctx, this.root, 0, 0);
        this.dirty = false;
    }

    _calculateTreeLayout(ctx, node, depth, index) {
        if (!node || depth > this.maxDepth) return { width: 0, height: 0 };
        
        // 计算子节点布局
        const children = node.children || [];
        let totalWidth = 0;
        let maxHeight = 0;
        const childPositions = [];
        
        if (children.length > 0) {
            const childSpacing = this.nodeSpacing;
            children.forEach((child, i) => {
                const result = this._calculateTreeLayout(ctx, child, depth + 1, i);
                childPositions.push({
                    width: result.width,
                    height: result.height,
                    children: result.children
                });
                totalWidth += result.width + childSpacing;
                maxHeight = Math.max(maxHeight, result.height);
            });
            totalWidth -= childSpacing;
        }
        
        // 计算当前节点大小
        node.width = this.nodeWidth;
        node.height = this.nodeHeight;
        const nodeWidth = node.width;
        const nodeHeight = node.height;
        
        // 设置节点位置
        if (children.length === 0) {
            // 叶子节点
            node.x = index * (nodeWidth + this.nodeSpacing) - nodeWidth / 2;
            node.y = depth * (nodeHeight + this.levelSpacing);
            return { width: nodeWidth, height: nodeHeight };
        } else {
            // 内部节点 - 居中对齐
            const childrenWidth = totalWidth;
            const startX = -childrenWidth / 2;
            children.forEach((child, i) => {
                const pos = childPositions[i];
                const childWidth = pos.width;
                child.x = startX + i * (childWidth + this.nodeSpacing);
                child.y = depth * (nodeHeight + this.levelSpacing) + nodeHeight + this.levelSpacing;
            });
            
            node.x = 0;
            node.y = depth * (nodeHeight + this.levelSpacing);
            
            // 计算子树宽度
            const subtreeWidth = Math.max(nodeWidth, childrenWidth);
            return { width: subtreeWidth, height: (this.maxDepth - depth) * (nodeHeight + this.levelSpacing) + nodeHeight };
        }
    }

    drawConnections(ctx) {
        if (this.collapsed) return;
        this._drawTreeConnections(ctx, this.root);
    }

    _drawTreeConnections(ctx, node) {
        if (!node || !node.children || node.children.length === 0) return;
        
        const fromRect = node.getBoundingRect();
        const fromX = fromRect.x + fromRect.width / 2;
        const fromY = fromRect.y + fromRect.height;
        
        node.children.forEach(child => {
            const toRect = child.getBoundingRect();
            const toX = toRect.x + toRect.width / 2;
            const toY = toRect.y;
            
            // 绘制贝塞尔曲线连接
            ctx.strokeStyle = this.connectionColor;
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            
            const cpX = fromX;
            const cpY = (fromY + toY) / 2;
            
            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            ctx.quadraticCurveTo(cpX, cpY, toX, toY);
            ctx.stroke();
            
            // 递归绘制子节点连接
            this._drawTreeConnections(ctx, child);
        });
    }

    // 添加子节点
    addChildToNode(parentNode, childNode) {
        if (parentNode && childNode) {
            parentNode.addChild(childNode);
            this.markDirty();
            this.emit('childAdded', { parent: parentNode, child: childNode });
        }
        return this;
    }

    // 移除子节点
    removeChildFromNode(parentNode, childNode) {
        if (parentNode && childNode) {
            parentNode.removeChild(childNode);
            this.markDirty();
            this.emit('childRemoved', { parent: parentNode, child: childNode });
        }
        return this;
    }

    // 获取节点深度
    getNodeDepth(node, currentDepth = 0) {
        if (node === this.root) return 0;
        for (const child of this.children) {
            const depth = this._findNodeDepth(child, node, currentDepth + 1);
            if (depth !== -1) return depth;
        }
        return -1;
    }

    _findNodeDepth(current, target, depth) {
        if (current === target) return depth;
        if (current.children) {
            for (const child of current.children) {
                const result = this._findNodeDepth(child, target, depth + 1);
                if (result !== -1) return result;
            }
        }
        return -1;
    }
}