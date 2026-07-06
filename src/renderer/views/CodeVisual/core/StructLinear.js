// core/StructLinear.js
import { StructContainer } from './StructContainer.js';

export class StructLinear extends StructContainer {
    constructor(options = {}) {
        super(options);
        this.title = options.title || 'Linear';
        this.maxNodes = options.maxNodes || 10;
        this.minNodes = options.minNodes || 2;
        this.nodeSpacing = options.nodeSpacing || 20;
        this.arrowDirection = options.arrowDirection || 'right'; // 'right', 'down', 'left', 'up'
        this.arrowSize = 12;
        this.arrowColor = options.arrowColor || '#4a90d9';
        this.arrowHead = true;
        this.arrowType = options.arrowType || 'solid'; // 'solid', 'dashed'
        this.curveStyle = options.curveStyle || 'straight'; // 'straight', 'bezier'
    }

    calculateLayout(ctx) {
        if (!this.dirty) return;
        
        // 限制节点数量
        while (this.children.length > this.maxNodes) {
            this.children.pop();
        }
        while (this.children.length < this.minNodes) {
            // 添加默认节点
            const dummy = new StructContainer({
                title: `Node ${this.children.length + 1}`,
                width: 80,
                height: 50
            });
            this.addChild(dummy);
        }
        
        // 计算子节点布局
        this.children.forEach((child, index) => {
            child.calculateLayout(ctx);
        });
        
        // 横向或纵向排列
        const isHorizontal = this.arrowDirection === 'right' || this.arrowDirection === 'left';
        const padding = this.padding;
        let totalWidth = 0;
        let totalHeight = 0;
        let offset = padding;
        
        if (isHorizontal) {
            this.children.forEach((child, index) => {
                const x = offset;
                const y = padding + this.titleHeight;
                child.x = x;
                child.y = y;
                offset += child.width + this.nodeSpacing;
                totalWidth = offset;
                totalHeight = Math.max(totalHeight, child.height + padding * 2 + this.titleHeight);
            });
            this.width = totalWidth + padding;
            this.height = totalHeight;
        } else {
            offset = padding + this.titleHeight;
            this.children.forEach((child) => {
                const x = padding;
                const y = offset;
                child.x = x;
                child.y = y;
                offset += child.height + this.nodeSpacing;
                totalHeight = offset;
                totalWidth = Math.max(totalWidth, child.width + padding * 2);
            });
            this.width = totalWidth;
            this.height = totalHeight + padding;
        }
        
        this.dirty = false;
    }

    drawConnections(ctx) {
        if (this.collapsed) return;
        
        const isHorizontal = this.arrowDirection === 'right' || this.arrowDirection === 'left';
        const reverse = this.arrowDirection === 'left' || this.arrowDirection === 'up';
        
        // 绘制节点之间的箭头
        for (let i = 0; i < this.children.length - 1; i++) {
            const from = this.children[i];
            const to = this.children[i + 1];
            if (!from || !to) continue;
            
            const fromRect = from.getBoundingRect();
            const toRect = to.getBoundingRect();
            
            let startX, startY, endX, endY;
            
            if (isHorizontal) {
                startX = fromRect.x + fromRect.width;
                startY = fromRect.y + fromRect.height / 2;
                endX = toRect.x;
                endY = toRect.y + toRect.height / 2;
            } else {
                startX = fromRect.x + fromRect.width / 2;
                startY = fromRect.y + fromRect.height;
                endX = toRect.x + toRect.width / 2;
                endY = toRect.y;
            }
            
            // 贝塞尔曲线偏移
            let cp1x, cp1y, cp2x, cp2y;
            if (this.curveStyle === 'bezier') {
                const offset = 30;
                if (isHorizontal) {
                    cp1x = (startX + endX) / 2;
                    cp1y = startY - offset;
                    cp2x = (startX + endX) / 2;
                    cp2y = endY - offset;
                } else {
                    cp1x = startX - offset;
                    cp1y = (startY + endY) / 2;
                    cp2x = endX - offset;
                    cp2y = (startY + endY) / 2;
                }
            }
            
            // 设置线条样式
            ctx.strokeStyle = this.arrowColor;
            ctx.lineWidth = 2;
            if (this.arrowType === 'dashed') {
                ctx.setLineDash([5, 5]);
            } else {
                ctx.setLineDash([]);
            }
            
            // 绘制连接线
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            if (this.curveStyle === 'bezier') {
                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
            } else {
                ctx.lineTo(endX, endY);
            }
            ctx.stroke();
            ctx.setLineDash([]);
            
            // 绘制箭头
            if (this.arrowHead) {
                const angle = Math.atan2(endY - startY, endX - startX);
                const arrowSize = this.arrowSize;
                
                ctx.fillStyle = this.arrowColor;
                ctx.beginPath();
                const arrowX = endX;
                const arrowY = endY;
                ctx.moveTo(arrowX, arrowY);
                ctx.lineTo(
                    arrowX - arrowSize * Math.cos(angle - 0.4),
                    arrowY - arrowSize * Math.sin(angle - 0.4)
                );
                ctx.lineTo(
                    arrowX - arrowSize * Math.cos(angle + 0.4),
                    arrowY - arrowSize * Math.sin(angle + 0.4)
                );
                ctx.closePath();
                ctx.fill();
            }
        }
        
        // 如果双向链表，绘制反向箭头
        if (this.bidirectional) {
            this.drawReverseConnections(ctx);
        }
    }

    drawReverseConnections(ctx) {
        // 由子类实现反向箭头
    }

    // 设置节点数量
    setNodeCount(count) {
        const newCount = Math.max(this.minNodes, Math.min(this.maxNodes, count));
        while (this.children.length < newCount) {
            const dummy = new StructContainer({
                title: `Node ${this.children.length + 1}`,
                width: 80,
                height: 50
            });
            this.addChild(dummy);
        }
        while (this.children.length > newCount) {
            this.children.pop();
        }
        this.markDirty();
        this.emit('nodeCountChanged', newCount);
        return this;
    }

    // 设置节点数据
    setNodeData(index, data) {
        if (index >= 0 && index < this.children.length) {
            const node = this.children[index];
            if (data.title) node.title = data.title;
            if (data.fields) {
                node.fields = data.fields;
                node.markDirty();
            }
            this.markDirty();
        }
        return this;
    }
}