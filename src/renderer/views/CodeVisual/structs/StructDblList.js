
import { StructLinear } from '../core/StructLinear.js';

export class StructDblList extends StructLinear {
    constructor(options = {}) {
        super(options);
        this.title = options.title || 'Doubly Linked List';
        this.bidirectional = true;
        this.arrowDirection = options.arrowDirection || 'right';
        this.reverseArrowColor = options.reverseArrowColor || '#6c757d';
    }

    drawReverseConnections(ctx) {
        // 绘制反向箭头（从右到左）
        const isHorizontal = this.arrowDirection === 'right' || this.arrowDirection === 'left';
        
        for (let i = this.children.length - 1; i > 0; i--) {
            const from = this.children[i];
            const to = this.children[i - 1];
            if (!from || !to) continue;
            
            const fromRect = from.getBoundingRect();
            const toRect = to.getBoundingRect();
            
            let startX, startY, endX, endY;
            
            if (isHorizontal) {
                startX = fromRect.x;
                startY = fromRect.y + fromRect.height / 2;
                endX = toRect.x + toRect.width;
                endY = toRect.y + toRect.height / 2;
            } else {
                startX = fromRect.x + fromRect.width / 2;
                startY = fromRect.y;
                endX = toRect.x + toRect.width / 2;
                endY = toRect.y + toRect.height;
            }
            
            // 反向箭头使用虚线
            ctx.strokeStyle = this.reverseArrowColor;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // 反向箭头头部（朝左或朝上）
            const angle = Math.atan2(endY - startY, endX - startX);
            const arrowSize = this.arrowSize * 0.8;
            
            ctx.fillStyle = this.reverseArrowColor;
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
}